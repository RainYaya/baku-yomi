import { useBookStore } from '../../stores/bookSlice';
import { useBookmarkStore, BOOKMARK_COLORS } from '../../stores/bookmarkSlice';
import { FiBookmark } from 'react-icons/fi';

interface Props {
  onSelectPair: (pairId: string) => void;
  onClose: () => void;
}

export function BookmarkList({ onSelectPair, onClose }: Props) {
  const currentChapter = useBookStore((s) => s.getCurrentChapter());
  const bookmarks = useBookmarkStore((s) => currentChapter ? s.getBookmarksByChapter(currentChapter.id) : []);

  if (bookmarks.length === 0) {
    return (
      <div className="p-4 text-center" style={{ color: 'var(--ink-muted)' }}>
        <FiBookmark size={24} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm opacity-50">暂无书签</p>
      </div>
    );
  }

  return (
    <div className="max-h-64 overflow-y-auto">
      {bookmarks.map((bookmark) => {
        const color = BOOKMARK_COLORS.find(c => c.id === bookmark.colorId);
        const pair = currentChapter?.pairs.find(p => p.id === bookmark.pairId);

        return (
          <div
            key={bookmark.pairId}
            className="group flex items-start gap-2 p-3 cursor-pointer hover:opacity-80 transition-opacity"
            style={{
              borderBottom: '1px solid var(--border-light)',
              backgroundColor: color ? color.bg : 'transparent',
            }}
            onClick={() => {
              onSelectPair(bookmark.pairId);
              onClose();
            }}
          >
            <div
              className="mt-1"
              style={{ color: color?.border || 'var(--ink-muted)' }}
            >
              <FiBookmark size={12} />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-sm truncate"
                style={{ fontFamily: 'var(--font-reading)', color: 'var(--ink-primary)' }}
              >
                {pair?.japanese || '句子已不存在'}
              </p>
              <p
                className="text-xs truncate opacity-50"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {pair?.chinese}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
