import { useBookmarkStore, BOOKMARK_COLORS } from '../../stores/bookmarkSlice';
import type { SelectionInfo } from '../../hooks/useTextSelection';
import { FiBookOpen } from 'react-icons/fi';

interface Props {
  selection: SelectionInfo;
  chapterId: string;
  onClose: () => void;
  /** Opens the explanation panel for the selected fragment. */
  onExplain: (selection: SelectionInfo) => void;
  /** Keeps the captured selection alive while the user taps this toolbar. */
  onPreserveSelection: () => void;
}

export function SelectionPopover({
  selection,
  chapterId,
  onClose,
  onExplain,
  onPreserveSelection,
}: Props) {
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

  const anchorX = selection.rect.left + selection.rect.width / 2;
  const left = Math.min(Math.max(anchorX, 92), window.innerWidth - 92);
  const showAbove = selection.rect.bottom + 52 > window.innerHeight;
  const top = showAbove ? selection.rect.top - 44 : selection.rect.bottom + 8;

  return (
    <div
      className="sel-pop"
      style={{ left, top }}
      role="toolbar"
      aria-label="选中文字"
      // Touch taps collapse the browser selection before click fires. Mark
      // the selection as kept so the popover does not unmount mid-tap.
      onPointerDown={onPreserveSelection}
      onTouchStart={onPreserveSelection}
    >
      <div className="sel-pop-inner">
        {BOOKMARK_COLORS.map((color) => (
          <button
            key={color.id}
            onClick={() => handleSelectColor(color.id)}
            className="sel-swatch"
            style={{
              backgroundColor: color.bg,
              borderColor: color.border,
            }}
            title={color.label}
            aria-label={`用${color.label}标记`}
          />
        ))}

        <span className="sel-divider" aria-hidden="true" />

        <button
          onClick={() => {
            onExplain(selection);
            onClose();
          }}
          className="sel-explain"
          title="讲解这段"
        >
          <FiBookOpen size={12} />
          講解
        </button>
      </div>
    </div>
  );
}
