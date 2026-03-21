import { useRef } from 'react';
import { useBookStore } from '../../stores/bookSlice';
import { useUIStore } from '../../stores/uiSlice';
import { FiBookOpen, FiTrash2, FiPlus, FiChevronRight } from 'react-icons/fi';
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
    <aside
      className="h-full overflow-y-auto flex-shrink-0"
      style={{
        width: '280px',
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-light)',
      }}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2
            className="text-sm font-medium"
            style={{
              fontFamily: 'var(--font-ui)',
              color: 'var(--ink-muted)',
              letterSpacing: '0.1em',
            }}
          >
            書架
          </h2>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing}
            className="p-1.5 rounded transition-all hover:bg-opacity-80"
            style={{
              color: 'var(--accent-primary)',
              opacity: parsing ? 0.4 : 1,
            }}
            title="导入书籍"
          >
            {parsing ? (
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <FiPlus size={18} />
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

        {/* Book list */}
        {books.length === 0 ? (
          <p
            className="text-sm text-center py-8 opacity-40"
            style={{ fontFamily: 'var(--font-ui)' }}
          >
            点击 + 导入书籍
          </p>
        ) : (
          <ul className="space-y-1">
            {books.map((book) => (
              <li key={book.id}>
                <button
                  onClick={() => setCurrentBook(book.id)}
                  className="w-full text-left px-3 py-2.5 rounded transition-all group flex items-center gap-2"
                  style={{
                    backgroundColor:
                      currentBookId === book.id ? 'var(--accent-subtle)' : 'transparent',
                    color: currentBookId === book.id ? 'var(--accent-primary)' : 'var(--ink-secondary)',
                  }}
                >
                  <FiBookOpen
                    size={16}
                    className="flex-shrink-0"
                    style={{
                      opacity: currentBookId === book.id ? 1 : 0.5,
                    }}
                  />
                  <span
                    className="truncate flex-1 text-sm"
                    style={{ fontFamily: 'var(--font-ui)' }}
                  >
                    {book.title}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeBook(book.id);
                    }}
                    className="opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity p-1"
                    style={{ color: 'var(--error-color)' }}
                  >
                    <FiTrash2 size={14} />
                  </button>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Chapter list */}
      {currentBook && currentBook.chapters.length > 0 && (
        <>
          <div
            className="mx-5"
            style={{ height: '1px', backgroundColor: 'var(--border-light)' }}
          />
          <div className="p-5">
            <h2
              className="text-xs font-medium mb-4"
              style={{
                fontFamily: 'var(--font-ui)',
                color: 'var(--ink-muted)',
                letterSpacing: '0.1em',
              }}
            >
              章节
            </h2>
            <ul className="space-y-1">
              {currentBook.chapters.map((chapter, idx) => {
                const progress = readingProgress[chapter.id] ?? 0;
                const pct =
                  chapter.pairs.length > 0
                    ? Math.round((progress / chapter.pairs.length) * 100)
                    : 0;
                const isActive = useBookStore.getState().currentChapterIndex === idx;

                return (
                  <li key={chapter.id}>
                    <button
                      onClick={() => setCurrentChapter(idx)}
                      className="w-full text-left px-3 py-2.5 rounded transition-all flex items-center gap-2"
                      style={{
                        backgroundColor: isActive ? 'var(--accent-subtle)' : 'transparent',
                        color: isActive ? 'var(--accent-primary)' : 'var(--ink-secondary)',
                      }}
                    >
                      <FiChevronRight
                        size={14}
                        className="flex-shrink-0"
                        style={{ opacity: isActive ? 1 : 0.3 }}
                      />
                      <span
                        className="truncate flex-1 text-sm"
                        style={{ fontFamily: 'var(--font-ui)' }}
                      >
                        {chapter.title}
                      </span>
                      {pct > 0 && (
                        <span
                          className="text-xs"
                          style={{
                            fontFamily: 'var(--font-ui)',
                            color: 'var(--ink-muted)',
                          }}
                        >
                          {pct}%
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </aside>
  );
}
