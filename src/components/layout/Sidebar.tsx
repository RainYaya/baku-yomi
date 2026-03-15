import { useBookStore } from '../../stores/bookSlice';
import { useUIStore } from '../../stores/uiSlice';
import { HiOutlineBookOpen, HiOutlineTrash, HiOutlinePlusCircle } from 'react-icons/hi2';
import { useRef } from 'react';
import { useEpubParser } from '../../hooks/useEpubParser';

export function Sidebar() {
  const { books, currentBookId, setCurrentBook, setCurrentChapter, removeBook, readingProgress } =
    useBookStore();
  const currentBook = useBookStore((s) => s.getCurrentBook());
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const { parseFile, parsing } = useEpubParser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!sidebarOpen) return null;

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file?.name.endsWith('.epub')) parseFile(file);
    e.target.value = '';
  };

  return (
    <aside className="w-64 bg-gray-50 border-r border-gray-200 h-full overflow-y-auto flex-shrink-0">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            书架
          </h2>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing}
            className="text-indigo-500 hover:text-indigo-700 disabled:opacity-50 transition-colors"
            title="导入书籍"
          >
            {parsing ? (
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <HiOutlinePlusCircle size={20} />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub"
            onChange={handleImport}
            className="hidden"
          />
        </div>
        {books.length === 0 ? (
          <p className="text-sm text-gray-400">点击 + 导入书籍</p>
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
            {currentBook.chapters.map((chapter, idx) => {
              const progress = readingProgress[chapter.id] ?? 0;
              const pct = chapter.pairs.length > 0
                ? Math.round((progress / chapter.pairs.length) * 100)
                : 0;
              return (
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
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-400 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-8 text-right">
                      {pct}%
                    </span>
                  </div>
                </button>
              </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}
