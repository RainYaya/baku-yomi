import { FiTrash2 } from 'react-icons/fi';
import { BOOKMARK_COLORS, useBookmarkStore } from '../../stores/bookmarkSlice';

interface Props {
  pairId: string;
  chapterId: string;
  onClose: () => void;
}

export function BookmarkPicker({ pairId, chapterId, onClose }: Props) {
  const bookmark = useBookmarkStore((s) => s.getBookmark(pairId));
  const addBookmark = useBookmarkStore((s) => s.addBookmark);
  const removeBookmark = useBookmarkStore((s) => s.removeBookmark);

  const handleSelectColor = (colorId: string) => {
    addBookmark(pairId, chapterId, colorId);
    onClose();
  };

  const handleRemove = () => {
    removeBookmark(pairId);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ backgroundColor: 'rgba(45, 45, 45, 0.3)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs mx-4 p-4 animate-slide-up"
        style={{
          backgroundColor: 'var(--bg-paper)',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(44, 74, 110, 0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span
            className="text-sm font-medium"
            style={{
              fontFamily: 'var(--font-ui)',
              color: 'var(--ink-primary)',
              letterSpacing: '0.08em',
            }}
          >
            添加书签
          </span>
          {bookmark && (
            <button
              onClick={handleRemove}
              className="p-1 opacity-50 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--error-color)' }}
            >
              <FiTrash2 size={14} />
            </button>
          )}
        </div>

        <div className="grid grid-cols-6 gap-2">
          {BOOKMARK_COLORS.map((color) => (
            <button
              key={color.id}
              onClick={() => handleSelectColor(color.id)}
              className="w-8 h-8 rounded-full transition-transform hover:scale-110"
              style={{
                backgroundColor: color.bg,
                border: `2px solid ${bookmark?.colorId === color.id ? color.border : 'transparent'}`,
              }}
              title={color.label}
            />
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full py-2 text-xs opacity-50 hover:opacity-100 transition-opacity"
          style={{ fontFamily: 'var(--font-ui)', color: 'var(--ink-muted)' }}
        >
          取消
        </button>
      </div>
    </div>
  );
}
