import { useBookStore } from '../../stores/bookSlice';
import { useUIStore } from '../../stores/uiSlice';
import { HiOutlineBookOpen, HiOutlineTrash } from 'react-icons/hi2';

export function Sidebar() {
  const { books, currentBookId, setCurrentBook, setCurrentChapter, removeBook } =
    useBookStore();
  const currentBook = useBookStore((s) => s.getCurrentBook());
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);

  if (!sidebarOpen) return null;

  return (
    <aside className="w-64 bg-gray-50 border-r border-gray-200 h-full overflow-y-auto flex-shrink-0">
      <div className="p-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          书架
        </h2>
        {books.length === 0 ? (
          <p className="text-sm text-gray-400">还没有导入书籍</p>
        ) : (
          <ul className="space-y-1">
            {books.map((book) => (
              <li key={book.id}>
                <button
                  onClick={() => setCurrentBook(book.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 group transition-colors ${
                    currentBookId === book.id
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <HiOutlineBookOpen className="flex-shrink-0" />
                  <span className="truncate flex-1">{book.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeBook(book.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
                  >
                    <HiOutlineTrash size={14} />
                  </button>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {currentBook && currentBook.chapters.length > 0 && (
        <div className="p-4 border-t border-gray-200">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            章节
          </h2>
          <ul className="space-y-1">
            {currentBook.chapters.map((chapter, idx) => (
              <li key={chapter.id}>
                <button
                  onClick={() => setCurrentChapter(idx)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    useBookStore.getState().currentChapterIndex === idx
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <span className="truncate block">{chapter.title}</span>
                  <span className="text-xs text-gray-400">
                    {chapter.pairs.length} 句对
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
