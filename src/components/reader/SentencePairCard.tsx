import { forwardRef } from 'react';
import type { SentencePair as SentencePairType } from '../../types';
import { useSettingsStore } from '../../stores/settingsSlice';
import { usePracticeStore } from '../../stores/practiceSlice';
import { FiCheck } from 'react-icons/fi';

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

  if (showFurigana && pair.japaneseHtml) {
    return (
      <p className={className} style={style} dangerouslySetInnerHTML={{ __html: pair.japaneseHtml }} />
    );
  }
  return <p className={className} style={style}>{pair.japanese}</p>;
}

export const SentencePairCard = forwardRef<HTMLElement, Props>(function SentencePairCard({ pair, isSelected, onSelect }, ref) {
  const translation = usePracticeStore((s) => s.translations[pair.id] ?? '');
  const analysis = usePracticeStore((s) => s.analyses[pair.id]);
  const note = usePracticeStore((s) => s.notes[pair.id] ?? '');
  const hasWork = translation.trim() || analysis || note.trim();

  return (
    <article
      ref={ref}
      className="group cursor-pointer relative transition-all duration-200"
      style={{
        borderBottom: '1px solid var(--border-light)',
        padding: '1.25rem 0',
        backgroundColor: isSelected ? 'var(--accent-subtle)' : 'transparent',
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

      {/* Completed indicator */}
      {hasWork && !isSelected && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-30">
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
