import { forwardRef, useEffect, useMemo, useState } from 'react';
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
import { FiCheck, FiPause, FiPlay } from 'react-icons/fi';

interface Props {
  pair: SentencePairType;
  isSelected: boolean;
  onSelect: () => void;
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
    bookmarks.length,
    bookmarks.map((b) => b.id + b.colorId).join(','),
  ]);

  return (
    <p className={className} style={style}>
      {renderedContent}
    </p>
  );
}

export const SentencePairCard = forwardRef<HTMLElement, Props>(function SentencePairCard(
  { pair, isSelected, onSelect },
  ref
) {
  const translation = usePracticeStore((s) => s.translations[pair.id] ?? '');
  const analysis = usePracticeStore((s) => s.analyses[pair.id]);
  const note = usePracticeStore((s) => s.notes[pair.id] ?? '');
  const hasWork = translation.trim() || analysis || note.trim();

  const voicevoxSpeakerId = useSettingsStore((s) => s.voicevoxSpeakerId);
  const voicevoxSpeed = useSettingsStore((s) => s.voicevoxSpeed);
  const voicevoxPitch = useSettingsStore((s) => s.voicevoxPitch);
  const voicevoxVolume = useSettingsStore((s) => s.voicevoxVolume);
  const [isActiveAudio, setIsActiveAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const handleClick = () => {
    const selectedText = window.getSelection()?.toString().trim();
    if (selectedText) return;
    onSelect();
  };

  useEffect(() => {
    const unsubscribe = subscribeVoicevoxPlayback((state) => {
      const isMine = state.pairId === pair.id;
      setIsActiveAudio(isMine);
      setIsPlaying(isMine && state.isPlaying);
      setIsLoadingAudio(isMine && state.isLoading);
      setCurrentTime(isMine ? state.currentTime : 0);
      setDuration(isMine ? state.duration : 0);
    });

    return unsubscribe;
  }, [pair.id]);

  const handlePlayToggle = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();

    if (isActiveAudio) {
      toggleVoicevoxPause();
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
    const next = Number(e.target.value);
    seekVoicevox(next);
  };

  return (
    <article
      ref={ref}
      data-pair-id={pair.id}
      className="reader-sentence-card group relative transition-all duration-200"
      style={{
        borderBottom: '1px solid var(--border-light)',
        padding: '1.25rem 0',
        backgroundColor: isSelected ? 'var(--accent-subtle)' : 'transparent',
        borderRadius: isSelected ? '6px' : '0',
      }}
      onClick={handleClick}
    >
      {isSelected && (
        <div
          className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l"
          style={{ backgroundColor: 'var(--accent-primary)' }}
        />
      )}

      {hasWork && !isSelected && (
        <div className="absolute right-10 top-1/2 -translate-y-1/2 opacity-30">
          <FiCheck size={16} style={{ color: 'var(--accent-primary)' }} />
        </div>
      )}

      <div
        className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handlePlayToggle}
          disabled={isLoadingAudio}
          className="mini-audio-button"
          title={isActiveAudio ? (isPlaying ? '暂停' : '继续播放') : '播放日语原文'}
        >
          {isActiveAudio && isPlaying ? <FiPause size={12} /> : <FiPlay size={12} />}
        </button>

        <div className={`mini-audio-progress ${isActiveAudio ? 'active' : ''}`}>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 0.1)}
            step={0.01}
            value={Math.min(currentTime, duration || 0)}
            onChange={handleSeek}
            className="mini-audio-range"
            title="调整播放进度"
            disabled={!isActiveAudio}
          />
          <span
            className="mini-audio-fill"
            style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
          />
        </div>
      </div>

      <div className="reader-sentence-text">
        <JapaneseText pair={pair} className="text-reading mb-2" style={{ lineHeight: '1.9' }} />

        <div
          style={{
            paddingLeft: '1.25rem',
            borderLeft: '2px solid var(--accent-subtle)',
          }}
        >
          <p className="text-reading" style={{ fontSize: '0.9em', opacity: 0.65 }}>
            {pair.chinese}
          </p>
        </div>
      </div>
    </article>
  );
});
