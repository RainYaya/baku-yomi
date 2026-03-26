import { useBookStore } from '../../stores/bookSlice';
import { useBookmarkStore, BOOKMARK_COLORS } from '../../stores/bookmarkSlice';
import { FiBookmark, FiTrash2 } from 'react-icons/fi';

interface Props {
  onClose: () => void;
}

export function BookmarkList({ onClose }: Props) {
  const currentChapterId = useBookStore((s) => s.getCurrentChapter()?.id ?? null);
  const currentChapterPairs = useBookStore((s) => s.getCurrentChapter()?.pairs ?? []);
  const allBookmarks = useBookmarkStore((s) => s.bookmarks);
  const removeBookmark = useBookmarkStore((s) => s.removeBookmark);
  const setScrollToBookmarkId = useBookmarkStore((s) => s.setScrollToBookmarkId);

  const bookmarks = currentChapterId
    ? allBookmarks.filter((b) => b.chapterId === currentChapterId)
    : [];

  if (bookmarks.length === 0) {
    return (
      <div className="p-4 text-center" style={{ color: 'var(--ink-muted)' }}>
        <FiBookmark size={24} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm opacity-50">选中文字添加书签</p>
      </div>
    );
  }

  return (
    <div className="max-h-64 overflow-y-auto">
      {bookmarks.map((bookmark) => {
        const color = BOOKMARK_COLORS.find((c) => c.id === bookmark.colorId);
        const pair = currentChapterPairs.find((p) => p.id === bookmark.pairId);

        return (
          <div
            key={bookmark.id}
            className="group flex items-start gap-2 p-3 cursor-pointer hover:opacity-80 transition-opacity"
            style={{
              borderBottom: '1px solid var(--border-light)',
              backgroundColor: color?.bg || 'transparent',
            }}
            onClick={() => {
              setScrollToBookmarkId(bookmark.id);
              onClose();
            }}
          >
            <div
              className="mt-1 flex-shrink-0"
              style={{ color: color?.border || 'var(--ink-muted)' }}
            >
              <FiBookmark size={12} />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-sm truncate"
                style={{
                  fontFamily: 'var(--font-reading)',
                  color: 'var(--ink-primary)',
                  borderLeft: color ? `2px solid ${color.border}` : 'none',
                  paddingLeft: '0.5rem',
                }}
              >
                {bookmark.text}
              </p>
              {pair && (
                <p
                  className="text-xs truncate opacity-50 mt-0.5"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  {pair.japanese.slice(0, 30)}...
                </p>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeBookmark(bookmark.id);
              }}
              className="opacity-0 group-hover:opacity-50 hover:!opacity-100 p-1 transition-opacity"
              style={{ color: 'var(--error-color)' }}
            >
              <FiTrash2 size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
