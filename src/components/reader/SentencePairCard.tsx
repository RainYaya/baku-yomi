import { forwardRef, useMemo } from 'react';
import type { SentencePair as SentencePairType } from '../../types';
import { useSettingsStore } from '../../stores/settingsSlice';
import { usePracticeStore } from '../../stores/practiceSlice';
import { useBookmarkStore, BOOKMARK_COLORS } from '../../stores/bookmarkSlice';
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
  const allBookmarks = useBookmarkStore((s) => s.bookmarks);
  const bookmarks = useMemo(() => 
    allBookmarks.filter(b => b.pairId === pair.id),
    [allBookmarks, pair.id]
  );

  const renderedContent = useMemo(() => {
    // 如果有书签，优先显示书签高亮（用纯文本模式）
    if (bookmarks.length > 0) {
      // 按 endOffset 排序，从后往前替换
      const sorted = [...bookmarks].sort((a, b) => b.endOffset - a.endOffset);
      let text = pair.japanese;
      
      for (const bm of sorted) {
        const before = text.slice(0, bm.startOffset);
        const marked = text.slice(bm.startOffset, bm.endOffset);
        const after = text.slice(bm.endOffset);
        const color = BOOKMARK_COLORS.find(c => c.id === bm.colorId);
        text = `${before}<mark style="background-color: ${color?.bg || 'transparent'}; border-bottom: 2px solid ${color?.border || 'transparent'};">${marked}</mark>${after}`;
      }
      
      return <span dangerouslySetInnerHTML={{ __html: text }} />;
    }
    
    // 没有书签时，按正常模式显示
    if (showFurigana && pair.japaneseHtml) {
      return <span dangerouslySetInnerHTML={{ __html: pair.japaneseHtml }} />;
    }
    
    return pair.japanese;
  }, [pair.japanese, pair.japaneseHtml, showFurigana, bookmarks.length, bookmarks.map(b => b.id + b.colorId).join(',')]);

  return (
    <p className={className} style={style}>
      {renderedContent}
    </p>
  );
}

export const SentencePairCard = forwardRef<HTMLElement, Props>(function SentencePairCard({ pair, isSelected, onSelect }, ref) {
  const translation = usePracticeStore((s) => s.translations[pair.id] ?? '');
  const analysis = usePracticeStore((s) => s.analyses[pair.id]);
  const note = usePracticeStore((s) => s.notes[pair.id] ?? '');
  const hasWork = translation.trim() || analysis || note.trim();

  const handleClick = () => {
    // 如果有文字被选中，不触发选择句子（让书签选择器处理）
    const selectedText = window.getSelection()?.toString().trim();
    if (selectedText) {
      return;
    }
    onSelect();
  };

  return (
    <article
      ref={ref}
      data-pair-id={pair.id}
      className="group cursor-pointer relative transition-all duration-200"
      style={{
        borderBottom: '1px solid var(--border-light)',
        padding: '1.25rem 0',
        backgroundColor: isSelected ? 'var(--accent-subtle)' : 'transparent',
        borderRadius: isSelected ? '6px' : '0',
      }}
      onClick={handleClick}
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
