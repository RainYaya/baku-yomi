import { memo, useEffect, useMemo, useState } from 'react';
import type { SentencePair as SentencePairType } from '../../types';
import { useSettingsStore } from '../../stores/settingsSlice';
import { usePracticeStore } from '../../stores/practiceSlice';
import { useBookmarkStore, BOOKMARK_COLORS } from '../../stores/bookmarkSlice';
import {
  playVoicevox,
  seekVoicevox,
  subscribeVoicevoxPlayback,
  toggleVoicevoxPause,
} from '../../lib/tts/voicevox';
import { FiPause, FiPlay, FiRefreshCw } from 'react-icons/fi';
import {
  idlePlaybackView,
  type TtsPlaybackView,
} from '../../machines/tts';

interface Props {
  pair: SentencePairType;
  isSelected: boolean;
  onSelect: (pairId: string, isSelected: boolean) => void;
  onPractice?: (pairId: string) => void;
  onExplain?: (pairId: string) => void;
  onRetranslate?: (pairId: string) => Promise<void>;
}

function JapaneseText({
  pair,
  className,
  style,
}: {
  pair: SentencePairType;
  className?: string;
  style?: React.CSSProperties;
}) {
  const showFurigana = useSettingsStore((s) => s.showFurigana);
  const allBookmarks = useBookmarkStore((s) => s.bookmarks);
  const bookmarks = useMemo(
    () => allBookmarks.filter((b) => b.pairId === pair.id),
    [allBookmarks, pair.id]
  );

  const renderedContent = useMemo(() => {
    if (bookmarks.length > 0) {
      const sorted = [...bookmarks].sort((a, b) => b.endOffset - a.endOffset);
      let text = pair.japanese;

      for (const bm of sorted) {
        const before = text.slice(0, bm.startOffset);
        const marked = text.slice(bm.startOffset, bm.endOffset);
        const after = text.slice(bm.endOffset);
        const color = BOOKMARK_COLORS.find((c) => c.id === bm.colorId);
        text = `${before}<mark style="background-color: ${color?.bg || 'transparent'}; border-bottom: 2px solid ${color?.border || 'transparent'};">${marked}</mark>${after}`;
      }

      return <span dangerouslySetInnerHTML={{ __html: text }} />;
    }

    if (showFurigana && pair.japaneseHtml) {
      return <span dangerouslySetInnerHTML={{ __html: pair.japaneseHtml }} />;
    }

    return pair.japanese;
  }, [
    pair.japanese,
    pair.japaneseHtml,
    showFurigana,
    bookmarks,
  ]);

  return (
    <p
      className={className}
      style={style}
      data-pair-text
      data-pair-length={pair.japanese.length}
    >
      {renderedContent}
    </p>
  );
}

function SentencePairCardComponent({
  pair,
  isSelected,
  onSelect,
  onPractice,
  onExplain,
  onRetranslate,
}: Props) {
  const hasChinese = pair.chinese.trim().length > 0;
  const translation = usePracticeStore((s) => s.translations[pair.id] ?? '');
  const analysis = usePracticeStore((s) => s.analyses[pair.id]);
  const note = usePracticeStore((s) => s.notes[pair.id] ?? '');
  const hasWork = translation.trim() || analysis || note.trim();
  const [retranslating, setRetranslating] = useState(false);
  const [retranslateError, setRetranslateError] = useState<string | null>(null);
  const isAiTranslation = pair.translationSource === 'ai';

  const voicevoxSpeakerId = useSettingsStore((s) => s.voicevoxSpeakerId);
  const voicevoxSpeed = useSettingsStore((s) => s.voicevoxSpeed);
  const voicevoxPitch = useSettingsStore((s) => s.voicevoxPitch);
  const voicevoxVolume = useSettingsStore((s) => s.voicevoxVolume);
  const [playback, setPlayback] =
    useState<TtsPlaybackView>(idlePlaybackView);
  const isActiveAudio = playback.status !== 'idle';
  const isPlaying = playback.isPlaying;
  const isLoadingAudio = playback.isLoading;
  const audioStatus = playback.status;
  const currentTime = playback.currentTime;
  const duration = playback.duration;

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    // `handleCardSelect` ignores clicks that immediately follow a text
    // selection. On touch, the native selection can survive a tap much longer
    // than with a mouse, so also ignore taps on the selected text itself —
    // but still allow tapping the card's padding/number to select the card.
    const target = e.target as HTMLElement;
    const clickedText = Boolean(target.closest('[data-pair-text]'));
    const selectedText = window.getSelection()?.toString().trim();
    if (clickedText && selectedText) return;
    onSelect(pair.id, isSelected);
  };

  useEffect(() => {
    return subscribeVoicevoxPlayback((state) => {
      setPlayback(state.pairId === pair.id ? state : idlePlaybackView);
    });
  }, [pair.id]);

  const handlePlayToggle = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();

    if (isActiveAudio && toggleVoicevoxPause()) {
      return;
    }

    try {
      await playVoicevox(pair.japanese, voicevoxSpeakerId, pair.id, {
        speedScale: voicevoxSpeed,
        pitchScale: voicevoxPitch,
        volumeScale: voicevoxVolume,
      });
    } catch (error) {
      console.error('TTS playback failed:', error);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    seekVoicevox(Number(e.target.value));
  };

  const handleRetranslate = async () => {
    if (!onRetranslate || retranslating) return;
    setRetranslating(true);
    setRetranslateError(null);
    try {
      await onRetranslate(pair.id);
    } catch (error) {
      setRetranslateError(error instanceof Error ? error.message : '重译失败，请重试。');
    } finally {
      setRetranslating(false);
    }
  };

  return (
    <article
      data-pair-id={pair.id}
      data-selected={isSelected ? 'true' : 'false'}
      className={`pair${isSelected ? ' selected' : ''}`}
      onClick={handleClick}
    >
      <span className="num">{pair.pairIndex + 1}</span>

      {hasWork && !isSelected && (
        <span className="pair-done" title="这一句已经练过" aria-hidden="true" />
      )}

      {/* Playback sits in the number gutter; it never floats over the text. */}
      <div
        className="pair-audio"
        data-active={isActiveAudio}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handlePlayToggle}
          disabled={isLoadingAudio}
          className="mini-audio-button"
          data-tts-state={audioStatus}
          title={
            audioStatus === 'error'
              ? '重试播放'
              : isActiveAudio
                ? isPlaying
                  ? '暂停'
                  : '继续播放'
                : '播放日语原文'
          }
        >
          {isActiveAudio && isPlaying ? <FiPause size={13} /> : <FiPlay size={13} />}
        </button>
      </div>

      <div className="pair-text">
        <JapaneseText pair={pair} className="ja" />

        {hasChinese && (
          <p className="zh">
            {isAiTranslation && (
              <span
                className="translation-badge"
                data-reviewed={pair.translationReviewed ? 'true' : 'false'}
                title={
                  pair.translationReviewed
                    ? 'AI 翻译，已人工校对'
                    : 'AI 翻译，尚未校对'
                }
              >
                {pair.translationReviewed ? 'AI 译 · 已校' : 'AI 译'}
              </span>
            )}
            {pair.chinese}
          </p>
        )}
        {retranslateError && (
          <p className="pair-retranslate-error">{retranslateError}</p>
        )}
      </div>

      {/* A 2px progress line at the card edge, not a bar across the sentence. */}
      <div
        className={`pair-audio-track${isActiveAudio ? ' active' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <span
          className="pair-audio-fill"
          style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
        />
        <input
          type="range"
          min={0}
          max={Math.max(duration, 0.1)}
          step={0.01}
          value={Math.min(currentTime, duration || 0)}
          onChange={handleSeek}
          className="pair-audio-range"
          title="调整播放进度"
          disabled={!isActiveAudio}
          aria-label="调整播放进度"
        />
      </div>

      {isSelected && (
        <div className="pair-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="paper-chip"
            onClick={() => onPractice?.(pair.id)}
            title="在句内展开练习（P）"
          >
            練習 <kbd>P</kbd>
          </button>
          <button
            className="paper-chip"
            onClick={() => onExplain?.(pair.id)}
            title="在句内看讲解（E）"
          >
            講解 <kbd>E</kbd>
          </button>
          {onRetranslate && (
            <button
              className="paper-chip"
              onClick={() => void handleRetranslate()}
              disabled={retranslating}
              title="用 AI 重新翻译这一句"
            >
              <FiRefreshCw size={11} /> {retranslating ? '重译中' : '重译'}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export const SentencePairCard = memo(SentencePairCardComponent);
