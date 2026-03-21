import { useBookmarkStore, BOOKMARK_COLORS } from '../../stores/bookmarkSlice';
import type { SelectionInfo } from '../../hooks/useTextSelection';

interface Props {
  selection: SelectionInfo;
  chapterId: string;
  onClose: () => void;
}

export function SelectionPopover({ selection, chapterId, onClose }: Props) {
  const addBookmark = useBookmarkStore((s) => s.addBookmark);

  const handleSelectColor = (colorId: string) => {
    addBookmark({
      pairId: selection.pairId,
      chapterId,
      startOffset: selection.startOffset,
      endOffset: selection.endOffset,
      text: selection.text,
      colorId,
    });
    onClose();
  };

  return (
    <div
      className="fixed z-50 animate-fade-in"
      style={{
        left: selection.rect.left + selection.rect.width / 2,
        top: selection.rect.bottom + 8,
        transform: 'translateX(-50%)',
      }}
    >
      <div
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg shadow-lg"
        style={{
          backgroundColor: 'var(--bg-paper)',
          border: '1px solid var(--border-light)',
        }}
      >
        {BOOKMARK_COLORS.map((color) => (
          <button
            key={color.id}
            onClick={() => handleSelectColor(color.id)}
            className="w-6 h-6 rounded-full transition-transform hover:scale-125"
            style={{
              backgroundColor: color.bg,
              border: `2px solid ${color.border}`,
            }}
            title={color.label}
          />
        ))}
      </div>
    </div>
  );
}
