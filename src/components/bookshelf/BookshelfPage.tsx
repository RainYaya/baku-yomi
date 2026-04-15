import { useMemo, useState } from 'react';
import { useBookStore } from '../../stores/bookSlice';
import { useUIStore } from '../../stores/uiSlice';
import { useEpubParser } from '../../hooks/useEpubParser';
import { BookCard } from './BookCard';

type SortBy = 'lastImported' | 'title' | 'progress';

export function BookshelfPage() {
  const books = useBookStore((s) => s.books);
  const setCurrentBook = useBookStore((s) => s.setCurrentBook);
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const getLastChapterIndexForBook = useBookStore((s) => s.getLastChapterIndexForBook);
  const readingProgress = useBookStore((s) => s.readingProgress);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const { parseFile, parsing } = useEpubParser();

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('lastImported');

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
    <section className="bookshelf-page">
      <header className="bookshelf-toolbar">
        <div className="bookshelf-toolbar-left">
          <div className="bookshelf-kicker">LIBRARY</div>
          <div>
            <h2 className="bookshelf-heading">书架</h2>
            <span className="bookshelf-count">共 {books.length} 本</span>
          </div>
        </div>

        <div className="bookshelf-toolbar-right">
          <input
            className="settings-input"
            style={{ minWidth: 220 }}
            placeholder="搜索书名 / 作者"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <select
            className="settings-input"
            style={{ width: 150 }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
          >
            <option value="lastImported">按导入时间</option>
            <option value="title">按书名</option>
            <option value="progress">按阅读进度</option>
          </select>

          <label className="btn btn-primary cursor-pointer">
            {parsing ? '导入中...' : '导入 EPUB'}
            <input type="file" accept=".epub" onChange={handleImport} style={{ display: 'none' }} />
          </label>
        </div>
      </header>

      {filteredBooks.length === 0 ? (
        <div className="bookshelf-empty">
          <p>{books.length === 0 ? '你的书架还是空的，先导入第一本 EPUB 吧。' : '没有匹配的书，换个关键词试试。'}</p>
          {books.length === 0 && (
            <label className="btn btn-primary cursor-pointer">
              {parsing ? '导入中...' : '导入 EPUB'}
              <input type="file" accept=".epub" onChange={handleImport} style={{ display: 'none' }} />
            </label>
          )}
        </div>
      ) : (
        <div className="bookshelf-grid">
          {filteredBooks.map((book) => (
            <BookCard key={book.id} book={book} onOpen={() => openBook(book.id)} />
          ))}
        </div>
      )}
    </section>
  );
}
