import { forwardRef } from 'react';
import type { SentencePair as SentencePairType } from '../../types';
import { useSettingsStore } from '../../stores/settingsSlice';
import { usePracticeStore } from '../../stores/practiceSlice';
import { useBookmarkStore, BOOKMARK_COLORS } from '../../stores/bookmarkSlice';
import { FiCheck, FiBookmark } from 'react-icons/fi';

interface Props {
  pair: SentencePairType;
  chapterId: string;
  isSelected: boolean;
  onSelect: () => void;
  onBookmarkClick: () => void;
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

  if (showFurigana && pair.japaneseHtml) {
    return (
      <p className={className} style={style} dangerouslySetInnerHTML={{ __html: pair.japaneseHtml }} />
    );
  }
  return <p className={className} style={style}>{pair.japanese}</p>;
}

export const SentencePairCard = forwardRef<HTMLElement, Props>(function SentencePairCard({ pair, isSelected, onSelect, onBookmarkClick }, ref) {
  const translation = usePracticeStore((s) => s.translations[pair.id] ?? '');
  const analysis = usePracticeStore((s) => s.analyses[pair.id]);
  const note = usePracticeStore((s) => s.notes[pair.id] ?? '');
  const hasWork = translation.trim() || analysis || note.trim();
  const bookmark = useBookmarkStore((s) => s.getBookmark(pair.id));
  const bookmarkColor = bookmark ? BOOKMARK_COLORS.find(c => c.id === bookmark.colorId) : null;

  const bgColor = bookmarkColor ? bookmarkColor.bg : (isSelected ? 'var(--accent-subtle)' : 'transparent');

  return (
    <article
      ref={ref}
      className="group cursor-pointer relative transition-all duration-200"
      style={{
        borderBottom: '1px solid var(--border-light)',
        padding: '1.25rem 0',
        paddingRight: '2rem',
        backgroundColor: bgColor,
        borderRadius: isSelected ? '6px' : '0',
      }}
      onClick={onSelect}
    >
      {/* Selected indicator */}
      {isSelected && (
        <div
          className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l"
          style={{ backgroundColor: 'var(--accent-primary)' }}
        />
      )}

      {/* Bookmark indicator */}
      {bookmarkColor && (
        <div
          className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 group-hover:opacity-100 transition-opacity"
          style={{ color: bookmarkColor.border }}
        >
          <FiBookmark size={14} fill={bookmarkColor.border} />
        </div>
      )}

      {/* Bookmark button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onBookmarkClick();
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity p-1"
        style={{ color: 'var(--ink-muted)' }}
        title="添加书签"
      >
        <FiBookmark size={14} />
      </button>

      {/* Completed indicator */}
      {hasWork && !isSelected && !bookmarkColor && (
        <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-30">
          <FiCheck size={16} style={{ color: 'var(--accent-primary)' }} />
        </div>
      )}

      <div>
        {/* Japanese */}
        <JapaneseText
          pair={pair}
          className="text-reading mb-2"
          style={{ lineHeight: '1.9' }}
        />

        {/* Chinese */}
        <div
          style={{
            paddingLeft: '1.25rem',
            borderLeft: bookmarkColor 
              ? `2px solid ${bookmarkColor.border}` 
              : '2px solid var(--accent-subtle)',
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
