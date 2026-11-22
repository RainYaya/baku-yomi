import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiArrowLeft,
  FiExternalLink,
  FiFilm,
  FiMaximize2,
  FiPlay,
  FiSettings,
  FiX,
} from 'react-icons/fi';
import type { SentencePair } from '../../types';
import { useBookStore } from '../../stores/bookSlice';
import { useUIStore } from '../../stores/uiSlice';
import { useSettingsStore } from '../../stores/settingsSlice';
import { usePracticeStore } from '../../stores/practiceSlice';
import { useBookmarkStore, BOOKMARK_COLORS } from '../../stores/bookmarkSlice';
import { useVocabStore } from '../../stores/vocabSlice';
import { useMachine } from '../../machines/react';
import {
  readerSessionMachine,
  sessionPairId,
} from '../../machines/reader';
import { registerKeyboardHandler } from '../../lib/keyboard';
import { pairOrderLines } from '../../lib/pairOrder';
import { bookmarkedHtml } from '../../lib/textMarkup';
import { formatDuration } from '../../lib/import/videoFiles';
import { getSessionVideoFile } from '../../lib/video/sessionFiles';
import { fileMetadataMatches } from '../../lib/video/localVideo';
import {
  getVideoHandle,
  pickVideoFile,
  requestHandlePermission,
  saveVideoHandle,
  supportsFileHandles,
  type VideoFileHandle,
} from '../../lib/video/handles';
import {
  formatTimecode,
  pairIndexAtTime,
  youtubeEmbedUrl,
  youtubeToggleCommand,
} from '../../lib/video/timeline';
import { useTextSelection, type SelectionInfo } from '../../hooks/useTextSelection';
import {
  createVocabDraftFromEntry,
  createVocabDraftFromSelection,
  findDuplicateVocabEntry,
} from '../../lib/vocab/draft';
import { ReadingFontMenu } from './ReadingFontMenu';
import { ThemeToggle } from '../../theme/ThemeToggle';
import { ChapterTranslationBar } from './ChapterTranslationBar';
import { SelectionPopover } from './SelectionPopover';
import { InlinePracticeCard, type InlineTab } from './InlinePracticeCard';
import { PracticeDesk } from './PracticeDesk';

function LineText({ pair }: { pair: SentencePair }) {
  const showFurigana = useSettingsStore((s) => s.showFurigana);
  const allBookmarks = useBookmarkStore((s) => s.bookmarks);

  const content = useMemo(() => {
    const bookmarks = allBookmarks.filter((bookmark) => bookmark.pairId === pair.id);
    if (bookmarks.length > 0) {
      return (
        <span
          dangerouslySetInnerHTML={{
            __html: bookmarkedHtml(pair.japanese, bookmarks, BOOKMARK_COLORS),
          }}
        />
      );
    }
    if (showFurigana && pair.japaneseHtml) {
      return <span dangerouslySetInnerHTML={{ __html: pair.japaneseHtml }} />;
    }
    return pair.japanese;
  }, [allBookmarks, pair.id, pair.japanese, pair.japaneseHtml, showFurigana]);

  return <>{content}</>;
}

export function VideoReadingView() {
  const currentBook = useBookStore((s) =>
    s.books.find((book) => book.id === s.currentBookId)
  );
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const openSettings = useUIStore((s) => s.openSettings);
  const openVocabDialog = useUIStore((s) => s.openVocabDialog);
  const pairOrder = useSettingsStore((s) => s.pairOrder);
  const setPairOrder = useSettingsStore((s) => s.setPairOrder);
  const videoLanguageMode = useSettingsStore((s) => s.videoLanguageMode);
  const setVideoLanguageMode = useSettingsStore((s) => s.setVideoLanguageMode);
  const fontZoom = useSettingsStore((s) => s.fontZoom);
  const changeFontZoom = useSettingsStore((s) => s.changeFontZoom);
  const setReadingProgress = useBookStore((s) => s.setReadingProgress);
  const getReadingProgress = useBookStore((s) => s.getReadingProgress);
  const scrollToPairId = useBookStore((s) => s.scrollToPairId);
  const practicePairId = useBookStore((s) => s.practicePairId);
  const setScrollToPairId = useBookStore((s) => s.setScrollToPairId);
  const setPracticePairId = useBookStore((s) => s.setPracticePairId);
  const analyses = usePracticeStore((s) => s.analyses);
  const vocabEntries = useVocabStore((s) => s.entries);
  const { selection, clearSelection, keepSelection } = useTextSelection();

  const { state: session, send: sendSession } = useMachine(readerSessionMachine, {
    debugId: 'video.session',
    debug: false,
  });
  const inlineInputRef = useRef<HTMLTextAreaElement | null>(null);
  const deskInputRef = useRef<HTMLTextAreaElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const lineRefs = useRef<Array<HTMLLIElement | null>>([]);
  const relinkInputRef = useRef<HTMLInputElement | null>(null);

  const [restoredFile, setRestoredFile] = useState<File | null>(null);
  const [savedHandle, setSavedHandle] = useState<VideoFileHandle | null>(null);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState(false);
  const [ytPlaying, setYtPlaying] = useState(false);

  const [inlineTab, setInlineTab] = useState<InlineTab>('practice');
  const [explainFragment, setExplainFragment] = useState('');
  const [follow, setFollow] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const chapter = currentBook?.chapters[0];
  const pairs = chapter?.pairs ?? [];
  const video = currentBook?.source?.video;
  const isLocal = video?.provider === 'local';
  const isYouTube = video?.provider === 'youtube' && Boolean(video.videoId);

  const metadataNote = (file: File): string | null => {
    if (!video?.fileName) return null;
    const same = fileMetadataMatches(video, {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
    });
    return same
      ? null
      : '这个文件和导入时记录的不一致（文件名 / 大小 / 修改时间）。仍然可以播放，确认是同一段视频就好。';
  };

  const sessionFile = useMemo(
    () => (currentBook && isLocal ? getSessionVideoFile(currentBook.id) : undefined),
    [currentBook, isLocal]
  );
  const localFile = sessionFile ?? restoredFile;
  const [localUrl, setLocalUrl] = useState<string | undefined>();

  const initialIndex = chapter ? Math.max(0, getReadingProgress(chapter.id)) : 0;
  const [currentMs, setCurrentMs] = useState(
    pairs[Math.min(initialIndex, Math.max(pairs.length - 1, 0))]?.startMs ?? 0
  );
  const currentIndex = Math.max(0, pairIndexAtTime(pairs, currentMs));
  const currentPair = pairs[currentIndex];

  useEffect(() => {
    setPlaybackError(false);
    if (!localFile) {
      setLocalUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(localFile);
    setLocalUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [localFile]);

  useEffect(() => {
    if (!localUrl || !videoRef.current) return;
    videoRef.current.currentTime = currentMs / 1000;
    // Only when a newly linked file becomes playable; not on every timeupdate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localUrl]);

  useEffect(() => {
    let cancelled = false;
    if (!currentBook || !isLocal || sessionFile) return;

    void (async () => {
      const handle = await getVideoHandle(currentBook.id).catch(() => undefined);
      if (!handle || cancelled) return;

      setSavedHandle(handle);
      const descriptor = { mode: 'read' as const };
      const permission = handle.queryPermission
        ? await handle.queryPermission(descriptor).catch(() => 'prompt' as const)
        : 'granted';
      if (permission !== 'granted') return;

      const file = await handle.getFile().catch(() => null);
      if (file && !cancelled) {
        setRestoredFile(file);
        setLinkNote(metadataNote(file));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBook, isLocal, sessionFile]);

  const continueWithHandle = async () => {
    if (!savedHandle) return;
    const granted = await requestHandlePermission(savedHandle);
    if (!granted) {
      setSavedHandle(null);
      setLinkNote('没有拿到读取权限，请重新选择视频文件。');
      relinkInputRef.current?.click();
      return;
    }

    const file = await savedHandle.getFile().catch(() => null);
    if (!file) {
      setLinkNote('这个文件已经不在原位了，请重新选择。');
      setSavedHandle(null);
      return;
    }
    setRestoredFile(file);
    setLinkNote(metadataNote(file));
  };

  const relinkVideo = async () => {
    if (!currentBook || !supportsFileHandles()) {
      relinkInputRef.current?.click();
      return;
    }

    const picked = await pickVideoFile().catch(() => null);
    if (!picked) return;
    setRestoredFile(picked.file);
    setSavedHandle(picked.handle);
    setLinkNote(metadataNote(picked.file));
    void saveVideoHandle(currentBook.id, picked.handle);
  };

  const handleRelinkFile = (file: File) => {
    setRestoredFile(file);
    setLinkNote(metadataNote(file));
  };

  useEffect(() => {
    if (!chapter || currentIndex < 0) return;
    setReadingProgress(chapter.id, currentIndex);
  }, [chapter, currentIndex, setReadingProgress]);

  useEffect(() => {
    if (!follow || !chapter) return;
    lineRefs.current[currentIndex]?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [chapter, currentIndex, follow]);

  const postYouTube = (func: string, args: unknown[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      '*'
    );
  };

  useEffect(() => {
    if (!isYouTube) return;

    const onMessage = (event: MessageEvent) => {
      if (!event.origin.includes('youtube.com')) return;
      try {
        const data =
          typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        const time = data?.info?.currentTime;
        if (typeof time === 'number') setCurrentMs(time * 1000);
        if (typeof data?.info?.playerState === 'number') {
          setYtPlaying(data.info.playerState === 1);
        }
      } catch {
        // Ignore unrelated player messages.
      }
    };

    window.addEventListener('message', onMessage);
    const listen = window.setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
        '*'
      );
      // Resume at the saved sentence; the iframe always starts at 0.
      postYouTube('seekTo', [currentMs / 1000, true]);
    }, 1200);
    const poll = window.setInterval(() => postYouTube('getCurrentTime'), 800);

    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(listen);
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYouTube, video?.videoId]);

  const seekTo = (index: number) => {
    const pair = pairs[index];
    if (!pair) return;
    const ms = pair.startMs ?? 0;
    setCurrentMs(ms);
    if (isYouTube) {
      postYouTube('seekTo', [ms / 1000, true]);
    } else if (videoRef.current) {
      videoRef.current.currentTime = ms / 1000;
    }
  };

  const togglePlay = () => {
    if (isYouTube) {
      postYouTube(youtubeToggleCommand(ytPlaying));
      setYtPlaying(!ytPlaying);
      return;
    }
    const element = videoRef.current;
    if (!element) return;
    if (element.paused) void element.play();
    else element.pause();
  };

  const selectPair = (pair: SentencePair) => {
    sendSession({
      type: 'SELECT',
      pairId: pair.id,
      hasAnalysis: Boolean(analyses[pair.id]),
    });
  };

  const openInline = (pair: SentencePair, tab: InlineTab, fragment = '') => {
    if (sessionPairId(session) !== pair.id) selectPair(pair);
    setInlineTab(tab);
    setExplainFragment(fragment);
    sendSession({ type: 'OPEN_INLINE' });
    setFollow(false);
  };

  // Search hits, review "回到原句" and "再练一次" arrive as transient store
  // commands, same as the text reader. Seek to the sentence and open practice
  // when the command asks for it.
  useEffect(() => {
    if (!scrollToPairId || !chapter) return;
    const frame = requestAnimationFrame(() => {
      const index = pairs.findIndex((pair) => pair.id === scrollToPairId);
      if (index < 0) {
        setScrollToPairId(null);
        setPracticePairId(null);
        return;
      }

      seekTo(index);
      setFollow(false);
      if (practicePairId === scrollToPairId) {
        openInline(pairs[index], 'practice');
        setPracticePairId(null);
      }
      setScrollToPairId(null);
      setReadingProgress(chapter.id, index);
    });

    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToPairId, practicePairId, chapter, pairs]);

  const handleSelectionExplain = (info: SelectionInfo) => {
    const pair = pairs.find((item) => item.id === info.pairId);
    if (!pair) return;
    openInline(pair, 'explain', info.text);
  };

  const handleAddVocab = (info: SelectionInfo) => {
    const pair = pairs.find((item) => item.id === info.pairId);
    if (!pair || !currentBook || !chapter) return;

    const draft = createVocabDraftFromSelection({
      selection: info,
      pair,
      bookId: currentBook.id,
      chapterId: chapter.id,
      chapterIndex: chapter.index,
    });
    const duplicate = findDuplicateVocabEntry(
      vocabEntries,
      draft.word,
      draft.example
    );
    openVocabDialog({
      draft: duplicate ? createVocabDraftFromEntry(duplicate) : draft,
      entry: duplicate ?? undefined,
      notice: duplicate ? '这个词已经在本句存过了，已打开那条记录。' : undefined,
    });
  };

  useEffect(() => {
    const unregister = registerKeyboardHandler('video-reading', 80, (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
        return false;
      }
      if (event.key === 'Escape' && expanded) {
        setExpanded(false);
        return true;
      }
      if (event.key === 'j' || event.key === 'J') {
        seekTo(Math.min(currentIndex + 1, pairs.length - 1));
        setFollow(false);
        return true;
      }
      if (event.key === 'k' || event.key === 'K') {
        seekTo(Math.max(currentIndex - 1, 0));
        setFollow(false);
        return true;
      }
      if (event.key === ' ') {
        togglePlay();
        return true;
      }
      return false;
    });
    return unregister;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, expanded, pairs, isYouTube, ytPlaying]);

  if (!currentBook || !chapter) return null;

  const order = pairOrderLines(pairOrder);
  const showJapanese = videoLanguageMode !== 'zh';
  const showChinese = videoLanguageMode !== 'ja';
  const visibleLanguages = order.filter((language) =>
    language === 'ja' ? showJapanese : showChinese
  );
  const selectedPair = sessionPairId(session)
    ? pairs.find((pair) => pair.id === sessionPairId(session))
    : null;
  const translatedCount = pairs.filter((pair) => pair.chinese.trim()).length;

  const jaLine = currentPair ? (
    <p className="video-current-ja">
      <LineText pair={currentPair} />
    </p>
  ) : null;
  const zhLine = currentPair ? (
    <p className="video-current-zh">{currentPair.chinese || '暂无译文'}</p>
  ) : null;

  const renderPlayer = (expandedMode: boolean) => (
    <div className={`video-player${expandedMode ? ' is-expanded' : ''}`}>
      {isYouTube && video?.videoId ? (
        <iframe
          ref={iframeRef}
          title={currentBook.title}
          src={`${youtubeEmbedUrl(video.videoId)}&origin=${encodeURIComponent(
            window.location.origin
          )}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : localUrl ? (
        <>
          <video
            ref={videoRef}
            src={localUrl}
            controls
            onError={() => setPlaybackError(true)}
            onTimeUpdate={(event) =>
              setCurrentMs(event.currentTarget.currentTime * 1000)
            }
          />
          {playbackError && (
            <div className="video-player-error">
              这个格式不能播放，转成 mp4 / webm 后再试。文稿、生词和练习仍然可用。
            </div>
          )}
        </>
      ) : (
        <div className="video-missing">
          <FiFilm size={22} />
          <b>{savedHandle ? '上次的视频还在' : '视频还没有链接'}</b>
          <span>
            {savedHandle
              ? '继续使用需要一次读取授权；拒绝后可以重新选择文件。'
              : '文稿、生词和练习仍然可用。重新选择视频后再播放。'}
          </span>
          <div className="video-missing-actions">
            {savedHandle && (
              <button
                className="shelf-btn primary"
                onClick={() => void continueWithHandle()}
              >
                继续使用上次的视频
              </button>
            )}
            <button
              className="quiet-link"
              onClick={() => void relinkVideo()}
            >
              重新链接视频
            </button>
          </div>
        </div>
      )}

      {isYouTube ? (
        <button
          className="video-float-btn"
          onClick={() => window.open(video.url, '_blank', 'noreferrer')}
          aria-label="在 YouTube 打开"
          title="在 YouTube 打开"
        >
          <FiExternalLink size={14} />
        </button>
      ) : (
        <button
          className="video-float-btn"
          onClick={togglePlay}
          aria-label="播放或暂停"
          title="播放 / 暂停 (空格)"
        >
          <FiPlay size={14} />
        </button>
      )}

      {expandedMode && currentPair && (showJapanese || showChinese) && (
        <div className="video-overlay-subtitle">
          {order.map((language) => {
            if (language === 'ja' && !showJapanese) return null;
            if (language === 'zh' && !showChinese) return null;
            return (
              <span
                key={language}
                className={`video-overlay-${language}`}
                data-primary={
                  visibleLanguages[0] === language ? 'true' : 'false'
                }
              >
                {language === 'ja'
                  ? currentPair.japanese
                  : currentPair.chinese || '暂无译文'}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div
      className="video-stage"
      data-language-mode={videoLanguageMode}
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
        <span className="video-source-badge">
          {isYouTube ? 'YouTube' : '本地视频'}
        </span>
        <div className="video-topbar-title">
          <b>{currentBook.title}</b>
          <span>{video?.channel || video?.fileName || '视频'}</span>
        </div>
        <div className="video-topbar-actions">
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
              <span className="video-kicker">TRANSCRIPT</span>
              <h1>{currentBook.title}</h1>
              <p>
                {pairs.length} 句 · {formatDuration(video?.durationSec)} ·{' '}
                {translatedCount > 0
                  ? `中文 ${translatedCount}/${pairs.length}`
                  : '中文：未翻译'}
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

          <ChapterTranslationBar book={currentBook} chapter={chapter} />

          <ol
            className="video-lines"
            onWheel={() => setFollow(false)}
            onTouchMove={() => setFollow(false)}
          >
            {pairs.map((pair, index) => {
              const isCurrent = index === currentIndex;
              const isOpen = sessionPairId(session) === pair.id;
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
                      seekTo(index);
                      setFollow(false);
                    }}
                    title={`跳到 ${formatTimecode(pair.startMs)}`}
                  >
                    {formatTimecode(pair.startMs)}
                  </button>
                  <div
                    className="video-line-text"
                    onClick={() => seekTo(index)}
                  >
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
                          {language === 'ja' ? (
                            <LineText pair={pair} />
                          ) : (
                            pair.chinese || '暂无译文'
                          )}
                        </p>
                      );
                    })}
                  </div>

                  {isOpen && session.surface === 'inline' && (
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
          <div
            className={`video-player-shell${expanded ? ' is-expanded' : ''}`}
          >
            {renderPlayer(expanded)}
          </div>
          {isLocal && linkNote && (
            <p className="video-link-note">{linkNote}</p>
          )}
          {isYouTube && (
            <p className="video-link-note">
              如果这里不能播放，点右上角或下方链接在 YouTube 打开；字幕和练习不受影响。
            </p>
          )}

          <section className="video-current">
            <header className="video-current-head">
              <span className="video-kicker">当前句</span>
              <div className="video-lang-toggle" role="group" aria-label="字幕语言">
                <button
                  aria-pressed={
                    videoLanguageMode === 'both' && pairOrder === 'ja-zh'
                  }
                  onClick={() => {
                    setVideoLanguageMode('both');
                    setPairOrder('ja-zh');
                  }}
                >
                  日中
                </button>
                <button
                  aria-pressed={
                    videoLanguageMode === 'both' && pairOrder === 'zh-ja'
                  }
                  onClick={() => {
                    setVideoLanguageMode('both');
                    setPairOrder('zh-ja');
                  }}
                >
                  中日
                </button>
                <button
                  aria-pressed={videoLanguageMode === 'ja'}
                  onClick={() => setVideoLanguageMode('ja')}
                >
                  日
                </button>
                <button
                  aria-pressed={videoLanguageMode === 'zh'}
                  onClick={() => setVideoLanguageMode('zh')}
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
                  return language === 'ja' ? (
                    <div
                      key={language}
                      className="video-current-order"
                      data-primary={
                        visibleLanguages[0] === language ? 'true' : 'false'
                      }
                    >
                      {jaLine}
                    </div>
                  ) : (
                    <div
                      key={language}
                      className="video-current-order"
                      data-primary={
                        visibleLanguages[0] === language ? 'true' : 'false'
                      }
                    >
                      {zhLine}
                    </div>
                  );
                })}
                <div className="video-current-actions">
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
                  <button
                    className="video-icon-btn video-expand-btn"
                    onClick={() => setExpanded(true)}
                    aria-label="放大播放器"
                    title="放大播放器"
                  >
                    <FiMaximize2 size={14} />
                  </button>
                </div>
              </>
            ) : (
              <p className="video-empty">字幕里还没有句子。</p>
            )}
          </section>

          <div className="video-source-row">
            <span>
              {video?.provider === 'youtube'
                ? '视频与字幕来自 YouTube'
                : video?.fileName
                  ? `本地文件 · ${video.fileName}`
                  : '本地视频'}
            </span>
            {video?.provider === 'youtube' && video.url && (
              <a href={video.url} target="_blank" rel="noreferrer">
                在 YouTube 打开 <FiExternalLink size={11} />
              </a>
            )}
          </div>
        </aside>
      </main>

      {expanded && (
        <div className="video-expand-overlay" onClick={() => setExpanded(false)}>
          <button
            className="video-expand-close"
            onClick={() => setExpanded(false)}
            aria-label="关闭放大"
          >
            <FiX size={18} />
          </button>
        </div>
      )}

      {session.surface === 'desk' && selectedPair && (
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

      {selection && (
        <SelectionPopover
          selection={selection}
          chapterId={chapter.id}
          onClose={clearSelection}
          onExplain={handleSelectionExplain}
          onAddVocab={handleAddVocab}
          onPreserveSelection={keepSelection}
        />
      )}

      {/* Fallback relink path: browsers without File System Access API. */}
      <input
        ref={relinkInputRef}
        type="file"
        accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) handleRelinkFile(file);
        }}
      />
    </div>
  );
}
