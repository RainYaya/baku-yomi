import { useMemo, useState } from 'react';
import { useBookStore } from '../../stores/bookSlice';
import { useUIStore } from '../../stores/uiSlice';
import { useEpubParser } from '../../hooks/useEpubParser';
import { BookCard } from './BookCard';
import { PasteTextDialog } from '../import/PasteTextDialog';
import { ThemeToggle } from '../../theme/ThemeToggle';
import {
  FiBookOpen,
  FiClipboard,
  FiEdit3,
  FiSearch,
  FiSettings,
  FiUpload,
} from 'react-icons/fi';

type SortBy = 'lastImported' | 'title' | 'progress';

export function BookshelfPage() {
  const books = useBookStore((s) => s.books);
  const currentBookId = useBookStore((s) => s.currentBookId);
  const setCurrentBook = useBookStore((s) => s.setCurrentBook);
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const getLastChapterIndexForBook = useBookStore((s) => s.getLastChapterIndexForBook);
  const readingProgress = useBookStore((s) => s.readingProgress);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const openSettings = useUIStore((s) => s.openSettings);
  const { parseFile, parsing, status } = useEpubParser();

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('lastImported');
  const [pasteOpen, setPasteOpen] = useState(false);

  const totalPairs = useMemo(
    () => books.reduce(
      (sum, book) => sum + book.chapters.reduce((count, chapter) => count + chapter.pairs.length, 0),
      0
    ),
    [books]
  );

  const filteredBooks = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();

    const list = books.filter((b) => {
      if (!lowerQuery) return true;
      return (
        b.title.toLowerCase().includes(lowerQuery) ||
        (b.author ?? '').toLowerCase().includes(lowerQuery)
      );
    });

    if (sortBy === 'title') {
      return [...list].sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans'));
    }

    if (sortBy === 'progress') {
      const progressOf = (bookId: string) => {
        const book = list.find((b) => b.id === bookId);
        if (!book) return 0;
        const total = book.chapters.reduce((sum, ch) => sum + ch.pairs.length, 0);
        if (!total) return 0;
        const done = book.chapters.reduce((sum, ch) => sum + (readingProgress[ch.id] ?? 0), 0);
        return done / total;
      };
      return [...list].sort((a, b) => progressOf(b.id) - progressOf(a.id));
    }

    return [...list].sort((a, b) => (b.importedAt ?? 0) - (a.importedAt ?? 0));
  }, [books, query, sortBy, readingProgress]);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file?.name.endsWith('.epub')) {
      void parseFile(file);
    }
    e.target.value = '';
  };

  const openBook = (bookId: string) => {
    setCurrentBook(bookId);
    setCurrentChapter(getLastChapterIndexForBook(bookId));
    setCurrentView('reader');
  };

  return (
    <section className="shelf-app">
      <header className="shelf-topbar">
        <button
          className="shelf-brand shelf-brand-btn"
          onClick={() => setCurrentView('home')}
          title="回到桌面"
        >
          baku-yomi
        </button>
        <span className="shelf-divider" aria-hidden="true" />
        <span className="shelf-crumb">書架 · 书架</span>

        <div className="shelf-top-right">
          <label className="shelf-search">
            <FiSearch size={13} aria-hidden="true" />
            <input
              placeholder="搜索书名 / 作者"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="搜索书名或作者"
            />
          </label>

          <button
            className="shelf-btn"
            onClick={() => setCurrentView('review')}
            title="查看批改记录"
          >
            <FiClipboard size={13} aria-hidden="true" />
            练习回顾
          </button>

          <button
            className="shelf-btn"
            onClick={() => setPasteOpen(true)}
            title="粘贴文章或导入 TXT / Markdown"
          >
            <FiEdit3 size={13} aria-hidden="true" />
            粘贴 / 文本
          </button>

          <label className="shelf-btn" data-import-state={status}>
            <FiUpload size={13} aria-hidden="true" />
            {parsing ? '导入中…' : '导入 EPUB'}
            <input
              type="file"
              accept=".epub"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </label>

          <button
            className="shelf-icon-btn"
            onClick={openSettings}
            title="打开设置"
            aria-label="打开设置"
          >
            <FiSettings size={15} />
          </button>
          <ThemeToggle className="shelf-icon-btn" />
        </div>
      </header>

      <div className="shelf-shell">
        <aside className="shelf-rail">
          <div className="shelf-rail-head">
            <span className="shelf-rail-kicker">書架</span>
            <h2 className="shelf-rail-title">我的书架</h2>
            <p className="shelf-rail-sub">
              {books.length} 本 · {totalPairs} 句
            </p>
          </div>

          <div className="shelf-rail-section">书籍</div>
          <nav className="shelf-nav" aria-label="书籍">
            {books.length === 0 ? (
              <p className="shelf-rail-sub" style={{ padding: '0 8px' }}>
                还没有导入书籍
              </p>
            ) : (
              books.map((book) => (
                <button
                  key={book.id}
                  className={`shelf-nav-btn${book.id === currentBookId ? ' active' : ''}`}
                  onClick={() => openBook(book.id)}
                  title={book.title}
                >
                  <FiBookOpen size={13} aria-hidden="true" />
                  <span className="truncate">{book.title}</span>
                  <span className="shelf-nav-count">{book.chapters.length}</span>
                </button>
              ))
            )}
          </nav>

          <div className="shelf-rail-foot">
            <button
              className="shelf-btn"
              onClick={() => setPasteOpen(true)}
              title="粘贴文章或导入 TXT / Markdown"
            >
              <FiEdit3 size={13} aria-hidden="true" />
              粘贴 / 文本
            </button>
            <label className="shelf-btn" data-import-state={status}>
              <FiUpload size={13} aria-hidden="true" />
              {parsing ? '导入中…' : '导入 EPUB'}
              <input
                type="file"
                accept=".epub"
                onChange={handleImport}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </aside>

        <main className="shelf-main">
          <div className="shelf-title-row">
            <h1>书架</h1>
            <span className="shelf-title-meta">
              共 {books.length} 本 · {totalPairs} 句
            </span>
            <div className="right">
              <label className="shelf-sort">
                <span>排序</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  aria-label="排序方式"
                >
                  <option value="lastImported">导入时间</option>
                  <option value="title">书名</option>
                  <option value="progress">阅读进度</option>
                </select>
              </label>
            </div>
          </div>

          {filteredBooks.length === 0 ? (
            <div className="shelf-empty">
              <p>
                {books.length === 0
                  ? '你的书架还是空的，先导入第一本 EPUB 吧。'
                  : '没有匹配的书，换个关键词试试。'}
              </p>
              {books.length === 0 && (
                <>
                  <button
                    className="shelf-btn primary"
                    onClick={() => setPasteOpen(true)}
                  >
                    <FiEdit3 size={13} aria-hidden="true" />
                    粘贴第一篇文章
                  </button>
                  <label className="shelf-btn" data-import-state={status}>
                    <FiUpload size={13} aria-hidden="true" />
                    {parsing ? '导入中…' : '导入 EPUB'}
                    <input
                      type="file"
                      accept=".epub"
                      onChange={handleImport}
                      style={{ display: 'none' }}
                    />
                  </label>
                </>
              )}
            </div>
          ) : (
            <div className="bookshelf-grid">
              {filteredBooks.map((book) => (
                <BookCard key={book.id} book={book} onOpen={() => openBook(book.id)} />
              ))}
            </div>
          )}
        </main>
      </div>

      <PasteTextDialog open={pasteOpen} onClose={() => setPasteOpen(false)} />
    </section>
  );
}
