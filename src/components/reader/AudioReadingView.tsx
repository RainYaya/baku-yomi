import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiArrowLeft,
  FiChevronLeft,
  FiChevronRight,
  FiPause,
  FiPlay,
  FiSettings,
  FiVolume2,
} from 'react-icons/fi';
import { useBookStore } from '../../stores/bookSlice';
import { usePracticeStore } from '../../stores/practiceSlice';
import { useSettingsStore } from '../../stores/settingsSlice';
import { useUIStore } from '../../stores/uiSlice';
import type { BookAudio, SentencePair } from '../../types';
import { formatTimecode, pairIndexAtTime } from '../../lib/video/timeline';
import { useMachine } from '../../machines/react';
import { readerSessionMachine, sessionPairId } from '../../machines/reader';
import { ChapterTranslationBar } from './ChapterTranslationBar';
import { InlinePracticeCard, type InlineTab } from './InlinePracticeCard';
import { PracticeDesk } from './PracticeDesk';
import { SaveSentenceButton } from '../saved/SaveSentenceButton';
import { ReadingFontMenu } from './ReadingFontMenu';
import { ThemeToggle } from '../../theme/ThemeToggle';

/** The audio file that contains a point on the book timeline. */
function audioEntryFor(audio: BookAudio, ms: number) {
  const inside = audio.chapters.find(
    (chapter) => ms >= chapter.startMs && ms < chapter.startMs + chapter.durationMs
  );
  if (inside) return inside;

  for (let index = audio.chapters.length - 1; index >= 0; index--) {
    if (audio.chapters[index].startMs <= ms) return audio.chapters[index];
  }
  return audio.chapters[0];
}

function nextAudioEntry(audio: BookAudio, chapterIndex: number) {
  return audio.chapters.find((chapter) => chapter.index > chapterIndex);
}

/**
 * Reading a book that ships with a generated audiobook.
 *
 * The transcript is the book's own paragraphs; the audio is one file per
 * chapter. Playback positions are absolute on the book timeline, so the
 * paragraph under the playhead is the same lookup the video desk uses.
 */
export function AudioReadingView() {
  const currentBook = useBookStore((state) =>
    state.books.find((book) => book.id === state.currentBookId)
  );
  const chapterIndex = useBookStore((state) => state.currentChapterIndex);
  const setCurrentChapter = useBookStore((state) => state.setCurrentChapter);
  const scrollToPairId = useBookStore((state) => state.scrollToPairId);
  const setScrollToPairId = useBookStore((state) => state.setScrollToPairId);
  const practicePairId = useBookStore((state) => state.practicePairId);
  const setPracticePairId = useBookStore((state) => state.setPracticePairId);
  const analyses = usePracticeStore((state) => state.analyses);
  const setCurrentView = useUIStore((state) => state.setCurrentView);
  const openSettings = useUIStore((state) => state.openSettings);
  const pairOrder = useSettingsStore((state) => state.pairOrder);
  const setPairOrder = useSettingsStore((state) => state.setPairOrder);
  const languageMode = useSettingsStore((state) => state.videoLanguageMode);
  const setLanguageMode = useSettingsStore((state) => state.setVideoLanguageMode);
  const fontZoom = useSettingsStore((state) => state.fontZoom);
  const changeFontZoom = useSettingsStore((state) => state.changeFontZoom);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lineRefs = useRef<(HTMLLIElement | null)[]>([]);
  const pendingSeekRef = useRef<number | null>(null);
  /** Where playback wants to resume after a chapter switch, in ms. */
  const [currentMs, setCurrentMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [follow, setFollow] = useState(true);

  const { state: session, send: sendSession } = useMachine(readerSessionMachine, {
    debugId: 'audio.session',
    debug: false,
  });
  const inlineInputRef = useRef<HTMLTextAreaElement | null>(null);
  const deskInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [inlineTab, setInlineTab] = useState<InlineTab>('practice');
  const [explainFragment, setExplainFragment] = useState('');

  const audio = currentBook?.audio;
  const chapter = currentBook?.chapters[chapterIndex];
  const pairs = useMemo(() => chapter?.pairs ?? [], [chapter]);
  const audioChapter = audio?.chapters.find(
    (entry) => entry.index === chapterIndex
  );

  const source = audio && audioChapter ? `${audio.base}/${audioChapter.file}` : undefined;

  // A few paragraphs have no timing of their own (a page of only symbols, or
  // text the narrator skipped). They ride with the previous paragraph so the
  // binary search stays monotonic.
  const timeline = useMemo(
    () =>
      pairs.map((pair, index) => ({
        startMs: pair.startMs ?? pairs[index - 1]?.endMs ?? 0,
        endMs: pair.endMs ?? pair.startMs ?? 0,
      })),
    [pairs]
  );
  const currentIndex = audioChapter ? pairIndexAtTime(timeline, currentMs) : -1;
  const currentPair = currentIndex >= 0 ? pairs[currentIndex] : undefined;

  const order = useMemo(
    () => (pairOrder === 'zh-ja' ? (['zh', 'ja'] as const) : (['ja', 'zh'] as const)),
    [pairOrder]
  );
  const showJapanese = languageMode !== 'zh';
  const showChinese = languageMode !== 'ja';
  const visibleLanguages = order.filter((language) =>
    language === 'ja' ? showJapanese : showChinese
  );

  const seekToPair = useCallback(
    (pair: SentencePair) => {
      if (!audio) return;

      let target = pair;
      if (target.startMs === undefined) {
        const nextTimed = pairs.find(
          (candidate) => candidate.startMs !== undefined && candidate.pairIndex > pair.pairIndex
        );
        if (!nextTimed) return;
        target = nextTimed;
      }

      const entry = audioEntryFor(audio, target.startMs!);
      const local = Math.max(0, target.startMs! - entry.startMs);

      if (entry.index !== chapterIndex) {
        pendingSeekRef.current = local;
        setCurrentMs(target.startMs!);
        setCurrentChapter(entry.index);
        return;
      }

      const element = audioRef.current;
      if (!element) return;
      element.currentTime = local / 1000;
      void element.play().catch(() => {});
    },
    [audio, chapterIndex, pairs, setCurrentChapter]
  );

  const openInline = useCallback(
    (pair: SentencePair, tab: InlineTab) => {
      if (sessionPairId(session) !== pair.id) {
        sendSession({
          type: 'SELECT',
          pairId: pair.id,
          hasAnalysis: Boolean(analyses[pair.id]),
        });
      }
      setInlineTab(tab);
      setExplainFragment('');
      sendSession({ type: 'OPEN_INLINE' });
      setFollow(false);
    },
    [analyses, sendSession, session]
  );

  // Review "回到原句" / "再练一次" and the saved page's "练这句" arrive as
  // transient store commands. Seek to the sentence, and open the practice card
  // when the command asks for it.
  useEffect(() => {
    if (!scrollToPairId || !chapter) return;
    const frame = requestAnimationFrame(() => {
      const pair = pairs.find((item) => item.id === scrollToPairId);
      if (!pair) {
        setScrollToPairId(null);
        setPracticePairId(null);
        return;
      }

      seekToPair(pair);
      setFollow(false);
      if (practicePairId === scrollToPairId) {
        openInline(pair, 'practice');
        setPracticePairId(null);
      }
      setScrollToPairId(null);
    });

    return () => cancelAnimationFrame(frame);
  }, [
    chapter,
    openInline,
    pairs,
    practicePairId,
    scrollToPairId,
    seekToPair,
    setPracticePairId,
    setScrollToPairId,
  ]);

  const togglePlay = useCallback(() => {
    const element = audioRef.current;
    if (!element) return;
    if (element.paused) void element.play();
    else element.pause();
  }, []);

  // Resume at the requested spot once the new chapter's file is ready.
  const handleLoaded = useCallback(() => {
    const element = audioRef.current;
    if (!element) return;
    const pending = pendingSeekRef.current;
    if (pending === null) return;
    pendingSeekRef.current = null;
    element.currentTime = pending / 1000;
    void element.play();
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const element = audioRef.current;
    if (!element || !audioChapter) return;
    setCurrentMs(audioChapter.startMs + element.currentTime * 1000);
  }, [audioChapter]);

  const handleEnded = useCallback(() => {
    if (!audio) return;
    const next = nextAudioEntry(audio, chapterIndex);
    if (!next) {
      setPlaying(false);
      return;
    }
    pendingSeekRef.current = 0;
    setCurrentMs(next.startMs);
    setCurrentChapter(next.index);
  }, [audio, chapterIndex, setCurrentChapter]);

  // Keep the spoken paragraph in view.
  useEffect(() => {
    if (!follow || currentIndex < 0) return;
    lineRefs.current[currentIndex]?.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    });
  }, [currentIndex, follow]);

  if (!currentBook) return null;

  const chapterOptions = currentBook.chapters.map((entry) => ({
    index: entry.index,
    title: entry.title,
    hasAudio: Boolean(
      audio?.chapters.some((audioEntry) => audioEntry.index === entry.index)
    ),
  }));

  const changeChapter = (index: number) => {
    pendingSeekRef.current = 0;
    setCurrentMs(0);
    setCurrentChapter(index);
  };

  const selectedPair = pairs.find((pair) => pair.id === session.pairId);

  return (
    <div
      className="video-stage audio-stage"
      data-language-mode={languageMode}
      style={{ '--video-zoom': fontZoom } as React.CSSProperties}
    >
      <header className="video-topbar">
        <button
          className="video-icon-btn"
          onClick={() => setCurrentView('home')}
          aria-label="返回"
          title="返回"
        >
          <FiArrowLeft size={16} />
        </button>
        <span className="video-source-badge">有声书</span>
        <div className="video-topbar-title">
          <b>{currentBook.title}</b>
          <span>{chapter?.title ?? ''}</span>
        </div>
        <div className="video-topbar-actions">
          <button
            className="video-icon-btn"
            onClick={() => changeChapter(Math.max(0, chapterIndex - 1))}
            disabled={chapterIndex === 0}
            aria-label="上一章"
            title="上一章"
          >
            <FiChevronLeft size={16} />
          </button>
          <button
            className="video-icon-btn"
            onClick={() =>
              changeChapter(
                Math.min(currentBook.chapters.length - 1, chapterIndex + 1)
              )
            }
            disabled={chapterIndex >= currentBook.chapters.length - 1}
            aria-label="下一章"
            title="下一章"
          >
            <FiChevronRight size={16} />
          </button>
          <button
            className="video-text-btn"
            onClick={() => changeFontZoom(-1)}
            aria-label="缩小字号"
            title="缩小字号"
          >
            A−
          </button>
          <button
            className="video-text-btn"
            onClick={() => changeFontZoom(1)}
            aria-label="放大字号"
            title="放大字号"
          >
            A+
          </button>
          <ReadingFontMenu />
          <ThemeToggle className="binder-icon-btn" />
          <button
            className="video-icon-btn"
            onClick={openSettings}
            aria-label="打开设置"
            title="打开设置"
          >
            <FiSettings size={15} />
          </button>
        </div>
      </header>

      <main className="video-main">
        <section className="video-transcript">
          <header className="video-transcript-head">
            <div>
              <span className="video-kicker">AUDIOBOOK</span>
              <h1>{chapter?.title ?? currentBook.title}</h1>
              <p>
                {pairs.length} 段 ·{' '}
                {audioChapter ? formatTimecode(audioChapter.durationMs) : '没有语音'} ·{' '}
                第 {chapterIndex + 1}/{currentBook.chapters.length} 章
              </p>
            </div>
            <div className="video-transcript-actions">
              <label className="video-follow">
                <input
                  type="checkbox"
                  checked={follow}
                  onChange={(event) => setFollow(event.target.checked)}
                />
                跟随播放
              </label>
            </div>
          </header>

          {chapter && <ChapterTranslationBar book={currentBook} chapter={chapter} />}

          <ol
            className="video-lines"
            onWheel={() => setFollow(false)}
            onTouchMove={() => setFollow(false)}
          >
            {pairs.map((pair, index) => {
              const isCurrent = index === currentIndex;
              return (
                <li
                  key={pair.id}
                  ref={(element) => {
                    lineRefs.current[index] = element;
                  }}
                  className={`video-line${isCurrent ? ' current' : ''}`}
                  data-pair-id={pair.id}
                  data-current={isCurrent ? 'true' : 'false'}
                >
                  <button
                    className="video-line-time"
                    onClick={() => {
                      seekToPair(pair);
                      setFollow(false);
                    }}
                    title={
                      pair.startMs === undefined
                        ? '没有语音'
                        : `跳到 ${formatTimecode(pair.startMs)}`
                    }
                  >
                    {formatTimecode(pair.startMs)}
                  </button>
                  <div className="video-line-text" onClick={() => seekToPair(pair)}>
                    {order.map((language) => {
                      if (language === 'ja' && !showJapanese) return null;
                      if (language === 'zh' && !showChinese) return null;
                      return (
                        <p
                          key={language}
                          className={`video-line-${language}`}
                          data-primary={
                            visibleLanguages[0] === language ? 'true' : 'false'
                          }
                          data-pair-text={language === 'ja' ? true : undefined}
                          data-pair-length={
                            language === 'ja' ? pair.japanese.length : undefined
                          }
                        >
                          {language === 'ja'
                            ? pair.japanese
                            : pair.chinese || '暂无译文'}
                        </p>
                      );
                    })}
                  </div>

                  {session.surface === 'inline' && session.pairId === pair.id && (
                    <div className="video-inline">
                      <InlinePracticeCard
                        pair={pair}
                        session={session}
                        tab={inlineTab}
                        fragment={explainFragment}
                        onTabChange={setInlineTab}
                        onClose={() => sendSession({ type: 'CLOSE' })}
                        onOpenDesk={() => sendSession({ type: 'OPEN_DESK' })}
                        onSessionEvent={sendSession}
                        inputRef={inlineInputRef}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <aside className="video-side">
          <section className="audio-player">
            {source ? (
              <audio
                ref={audioRef}
                src={source}
                onLoadedMetadata={handleLoaded}
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={handleEnded}
                controls
                preload="metadata"
              />
            ) : (
              <p className="video-empty">
                <FiVolume2 size={16} /> 这一章没有语音。
              </p>
            )}

            <div className="audio-controls">
              <button
                className="shelf-btn primary"
                onClick={togglePlay}
                disabled={!source}
              >
                {playing ? <FiPause size={14} /> : <FiPlay size={14} />}
                {playing ? '暂停' : '播放'}
              </button>
              <select
                className="audio-chapter-select"
                value={chapterIndex}
                onChange={(event) => changeChapter(Number(event.target.value))}
                aria-label="选择章节"
              >
                {chapterOptions.map((option) => (
                  <option key={option.index} value={option.index}>
                    {option.hasAudio ? '' : '· '}
                    {option.title}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="video-current">
            <header className="video-current-head">
              <span className="video-kicker">当前句</span>
              <div className="video-lang-toggle" role="group" aria-label="显示语言">
                <button
                  aria-pressed={languageMode === 'both' && pairOrder === 'ja-zh'}
                  onClick={() => {
                    setLanguageMode('both');
                    setPairOrder('ja-zh');
                  }}
                >
                  日中
                </button>
                <button
                  aria-pressed={languageMode === 'both' && pairOrder === 'zh-ja'}
                  onClick={() => {
                    setLanguageMode('both');
                    setPairOrder('zh-ja');
                  }}
                >
                  中日
                </button>
                <button
                  aria-pressed={languageMode === 'ja'}
                  onClick={() => setLanguageMode('ja')}
                >
                  日
                </button>
                <button
                  aria-pressed={languageMode === 'zh'}
                  onClick={() => setLanguageMode('zh')}
                >
                  中
                </button>
              </div>
            </header>

            {currentPair ? (
              <>
                {order.map((language) => {
                  if (language === 'ja' && !showJapanese) return null;
                  if (language === 'zh' && !showChinese) return null;
                  return (
                    <div
                      key={language}
                      className="video-current-order"
                      data-primary={visibleLanguages[0] === language ? 'true' : 'false'}
                    >
                      {language === 'ja'
                        ? currentPair.japanese
                        : currentPair.chinese || '暂无译文'}
                    </div>
                  );
                })}
                <div className="video-current-actions">
                  <SaveSentenceButton pair={currentPair} className="shelf-btn" />
                  <button
                    className="shelf-btn"
                    onClick={() => openInline(currentPair, 'explain')}
                  >
                    講解
                  </button>
                  <button
                    className="shelf-btn primary"
                    onClick={() => openInline(currentPair, 'practice')}
                  >
                    练这句
                  </button>
                </div>
              </>
            ) : (
              <p className="video-empty">点任意一段开始播放。</p>
            )}
          </section>
        </aside>
      </main>

      {session.surface === 'desk' && selectedPair && chapter && (
        <PracticeDesk
          pair={selectedPair}
          chapter={chapter}
          session={session}
          tab={inlineTab}
          fragment={explainFragment}
          onTabChange={setInlineTab}
          onBack={() => sendSession({ type: 'BACK' })}
          onClose={() => sendSession({ type: 'CLOSE' })}
          onSessionEvent={sendSession}
          inputRef={deskInputRef}
        />
      )}
    </div>
  );
}
