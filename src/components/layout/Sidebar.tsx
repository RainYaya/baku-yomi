import { useRef } from 'react';
import { useBookStore } from '../../stores/bookSlice';
import { useUIStore } from '../../stores/uiSlice';
import { FiBookOpen, FiTrash2, FiPlus, FiChevronRight, FiGrid } from 'react-icons/fi';
import { useEpubParser } from '../../hooks/useEpubParser';

export function Sidebar() {
  const books = useBookStore((s) => s.books);
  const currentBookId = useBookStore((s) => s.currentBookId);
  const currentChapterIndex = useBookStore((s) => s.currentChapterIndex);
  const readingProgress = useBookStore((s) => s.readingProgress);
  const setCurrentBook = useBookStore((s) => s.setCurrentBook);
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const getLastChapterIndexForBook = useBookStore((s) => s.getLastChapterIndexForBook);
  const removeBook = useBookStore((s) => s.removeBook);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const currentView = useUIStore((s) => s.currentView);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const { parseFile, parsing } = useEpubParser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentBook = books.find((b) => b.id === currentBookId) ?? null;

  const openReader = (bookId: string, chapterIndex?: number) => {
    setCurrentBook(bookId);
    const target = chapterIndex ?? getLastChapterIndexForBook(bookId);
    setCurrentChapter(target);
    setCurrentView('reader');
  };

  if (!sidebarOpen) return null;

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file?.name.endsWith('.epub')) parseFile(file);
    e.target.value = '';
  };

  return (
    <aside
      className="app-sidebar"
    >
      <div className="app-sidebar-inner">
        <div className="app-sidebar-section">
          <div className="app-sidebar-heading-row">
            <h2 className="app-sidebar-heading">LIBRARY</h2>
            <input
              ref={fileInputRef}
              type="file"
              accept=".epub"
              onChange={handleImport}
              className="hidden"
            />
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing}
            className="app-mini-action"
            title="导入书籍"
          >
            {parsing ? (
              <div className="app-spinner" />
            ) : (
              <>
                <FiPlus size={14} />
                IMPORT
              </>
            )}
          </button>
        </div>

        <div className="app-sidebar-section">
          <button
            className={`app-sidebar-link ${currentView === 'bookshelf' ? 'active' : ''}`}
            onClick={() => setCurrentView('bookshelf')}
          >
            <FiGrid size={14} />
            <span>书架总览</span>
          </button>
        </div>

        <div className="app-sidebar-section">
          <div className="app-sidebar-label">BOOKS</div>
        {books.length === 0 ? (
          <p className="app-sidebar-empty">
            点击 + 导入书籍
          </p>
        ) : (
            <ul className="app-sidebar-list">
            {books.map((book) => (
                <li key={book.id} className="group flex items-center">
                <button
                  onClick={() => openReader(book.id)}
                    className={`app-sidebar-link ${currentBookId === book.id ? 'active' : ''}`}
                >
                  <FiBookOpen
                    size={16}
                      className="flex-shrink-0"
                  />
                    <span className="truncate flex-1 text-sm">
                    {book.title}
                  </span>
                </button>
                <button
                  onClick={() => removeBook(book.id)}
                    className="app-inline-danger"
                    title="删除"
                >
                  <FiTrash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        </div>
      </div>

      {currentBook && currentBook.chapters.length > 0 && (
        <div className="app-sidebar-section app-sidebar-footer">
          <div className="app-sidebar-label">CHAPTERS</div>
          <ul className="app-sidebar-list">
              {currentBook.chapters.map((chapter, idx) => {
                const progress = readingProgress[chapter.id] ?? 0;
                const pct =
                  chapter.pairs.length > 0
                    ? Math.round((progress / chapter.pairs.length) * 100)
                    : 0;
                const isActive = currentChapterIndex === idx;

                return (
                  <li key={chapter.id}>
                    <button
                      onClick={() => openReader(currentBook.id, idx)}
                      className={`app-sidebar-link ${isActive ? 'active' : ''}`}
                    >
                      <FiChevronRight
                        size={14}
                        className="flex-shrink-0"
                      />
                      <span className="truncate flex-1 text-sm">
                        {chapter.title}
                      </span>
                      {pct > 0 && (
                        <span className="app-sidebar-progress">
                          {pct}%
                        </span>
                      )}
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
