import { useMemo, useState } from 'react';
import { useBookStore } from '../../stores/bookSlice';
import { useUIStore } from '../../stores/uiSlice';
import { useEpubParser } from '../../hooks/useEpubParser';
import { BookCard } from './BookCard';
import { PasteTextDialog } from '../import/PasteTextDialog';
import { GenerateMaterialDialog } from '../import/GenerateMaterialDialog';
import { SubtitleImportDialog } from '../import/SubtitleImportDialog';
import { VideoImportDialog } from '../import/VideoImportDialog';
import { AddMaterialMenu } from '../import/AddMaterialMenu';
import { booksInGroup, visibleBooks, type LibraryFilter } from '../../lib/library/sources';
import { useNoteUnread } from '../../hooks/useNoteFeed';
import { ThemeToggle } from '../../theme/ThemeToggle';
import {
  FiBookmark,
  FiBookOpen,
  FiClipboard,
  FiGlobe,
  FiSearch,
  FiSettings,
} from 'react-icons/fi';

type SortBy = 'lastImported' | 'title' | 'progress';

export function BookshelfPage() {
  const allBooks = useBookStore((s) => s.books);
  const books = useMemo(() => visibleBooks(allBooks), [allBooks]);
  const currentBookId = useBookStore((s) => s.currentBookId);
  const setCurrentBook = useBookStore((s) => s.setCurrentBook);
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const getLastChapterIndexForBook = useBookStore((s) => s.getLastChapterIndexForBook);
  const readingProgress = useBookStore((s) => s.readingProgress);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const openSettings = useUIStore((s) => s.openSettings);
  const { parseFile, parsing } = useEpubParser();
  const { unread: noteUnread } = useNoteUnread();

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('lastImported');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [subtitleOpen, setSubtitleOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<LibraryFilter>('all');

  const totalPairs = useMemo(
    () => books.reduce(
      (sum, book) => sum + book.chapters.reduce((count, chapter) => count + chapter.pairs.length, 0),
      0
    ),
    [books]
  );

  const filteredBooks = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    const grouped = booksInGroup(books, sourceFilter);

    const list = grouped.filter((b) => {
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
  }, [books, query, sortBy, readingProgress, sourceFilter]);

  const sourceChips = [
    { id: 'all' as const, label: '全部', count: books.length },
    { id: 'book' as const, label: '书', count: booksInGroup(books, 'book').length },
    { id: 'link' as const, label: '链接', count: booksInGroup(books, 'link').length },
    { id: 'collection' as const, label: '合集', count: booksInGroup(books, 'collection').length },
    { id: 'ai' as const, label: 'AI 情景', count: booksInGroup(books, 'ai').length },
    { id: 'subtitle' as const, label: '字幕', count: booksInGroup(books, 'subtitle').length },
    { id: 'video' as const, label: '视频', count: booksInGroup(books, 'video').length },
  ].filter((chip) => chip.id === 'all' || chip.count > 0);

  const handleEpubFile = (file: File) => {
    if (file.name.endsWith('.epub')) {
      void parseFile(file);
    }
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
            练习记录
          </button>

          <button
            className="shelf-btn"
            onClick={() => setCurrentView('vocab')}
            title="打开生词本"
          >
            <FiBookmark size={13} aria-hidden="true" />
            生词
          </button>

          <button
            className="shelf-btn"
            onClick={() => setCurrentView('note')}
            title="打开 note 阅读源"
          >
            <FiGlobe size={13} aria-hidden="true" />
            note
            {noteUnread > 0 && <span className="note-entry-count">{noteUnread}</span>}
          </button>

          <AddMaterialMenu
            onEpub={handleEpubFile}
            onPaste={() => setPasteOpen(true)}
            onGenerate={() => setGenerateOpen(true)}
            onSubtitle={() => setSubtitleOpen(true)}
            onVideo={() => setVideoOpen(true)}
            onNote={() => setCurrentView('note')}
            uploading={parsing}
          />

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

          <div className="shelf-rail-section">来源</div>
          <nav className="shelf-nav" aria-label="note 来源">
            <button
              className="shelf-nav-btn"
              onClick={() => setCurrentView('note')}
              title="打开 note 阅读源"
            >
              <FiGlobe size={13} aria-hidden="true" />
              <span className="truncate">note</span>
              {noteUnread > 0 && (
                <span className="shelf-nav-count">{noteUnread}</span>
              )}
            </button>
          </nav>

          <div className="shelf-rail-foot">
            <AddMaterialMenu
              onEpub={handleEpubFile}
              onPaste={() => setPasteOpen(true)}
              onGenerate={() => setGenerateOpen(true)}
              onSubtitle={() => setSubtitleOpen(true)}
              onVideo={() => setVideoOpen(true)}
              onNote={() => setCurrentView('note')}
              uploading={parsing}
            />
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

          <div className="source-chips" role="tablist" aria-label="材料类型">
            {sourceChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                role="tab"
                aria-selected={sourceFilter === chip.id}
                className={`source-chip${sourceFilter === chip.id ? ' active' : ''}`}
                onClick={() => setSourceFilter(chip.id)}
              >
                {chip.label}
                <span className="source-chip-count">{chip.count}</span>
              </button>
            ))}
          </div>

          {filteredBooks.length === 0 ? (
            <div className="shelf-empty">
              <p>
                {books.length === 0
                  ? '材料库还是空的，先添加一篇材料吧。'
                  : sourceFilter !== 'all'
                    ? '这个类型下还没有材料。'
                    : '没有匹配的书，换个关键词试试。'}
              </p>
              {books.length === 0 && (
                <AddMaterialMenu
                  onEpub={handleEpubFile}
                  onPaste={() => setPasteOpen(true)}
                  onGenerate={() => setGenerateOpen(true)}
                  onSubtitle={() => setSubtitleOpen(true)}
                  onVideo={() => setVideoOpen(true)}
                  onNote={() => setCurrentView('note')}
                  uploading={parsing}
                />
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
      <GenerateMaterialDialog open={generateOpen} onClose={() => setGenerateOpen(false)} />
      <SubtitleImportDialog open={subtitleOpen} onClose={() => setSubtitleOpen(false)} />
      <VideoImportDialog
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        onFallbackSubtitle={() => setSubtitleOpen(true)}
      />
    </section>
  );
}
