import { useMemo, useState } from 'react';
import { useBookStore } from '../../stores/bookSlice';
import { useUIStore } from '../../stores/uiSlice';
import { useEpubParser } from '../../hooks/useEpubParser';
import { BookCard } from '../bookshelf/BookCard';
import { PasteTextDialog } from '../import/PasteTextDialog';
import { GenerateMaterialDialog } from '../import/GenerateMaterialDialog';
import { SubtitleImportDialog } from '../import/SubtitleImportDialog';
import { AddMaterialMenu } from '../import/AddMaterialMenu';
import { ThemeToggle } from '../../theme/ThemeToggle';
import { buildTextBook } from '../../lib/import/textMaterial';
import { sourceLabel, visibleBooks } from '../../lib/library/sources';
import { useNoteUnread } from '../../hooks/useNoteFeed';
import { usePracticeStore } from '../../stores/practiceSlice';
import { buildJournalEntries, journalSummary } from '../../lib/practice/journal';
import { useRandomPractice } from '../../hooks/useRandomPractice';
import {
  FiArrowRight,
  FiBookmark,
  FiBookOpen,
  FiClipboard,
  FiGlobe,
  FiSearch,
  FiSettings,
  FiShuffle,
} from 'react-icons/fi';

const RECENT_LIMIT = 6;

const SAMPLE_TEXT = `# 吾輩は猫である
吾輩は猫である。名前はまだ無い。
我是一只猫。名字还没有。
どこで生れたかとんと見当がつかぬ。
在哪里出生的，我完全摸不着头脑。
何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。
只记得自己在一片昏暗潮湿的地方喵喵地哭着。
吾輩はここで始めて人間というものを見た。
我在这里第一次见到了所谓人类。`;

function sampleBook() {
  return buildTextBook({
    title: '吾輩は猫である（节选）',
    author: '夏目漱石',
    text: SAMPLE_TEXT,
  });
}

export function HomePage() {
  const allBooks = useBookStore((s) => s.books);
  const books = useMemo(() => visibleBooks(allBooks), [allBooks]);
  const currentBookId = useBookStore((s) => s.currentBookId);
  const setCurrentBook = useBookStore((s) => s.setCurrentBook);
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const getLastChapterIndexForBook = useBookStore((s) => s.getLastChapterIndexForBook);
  const readingProgress = useBookStore((s) => s.readingProgress);
  const addBook = useBookStore((s) => s.addBook);
  const setScrollToPairId = useBookStore((s) => s.setScrollToPairId);
  const createCollectionBook = useBookStore((s) => s.createCollectionBook);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const openSettings = useUIStore((s) => s.openSettings);
  const { parseFile, parsing } = useEpubParser();
  const { unread: noteUnread, sourceCount: noteSourceCount } = useNoteUnread();
  const analyses = usePracticeStore((s) => s.analyses);
  const translations = usePracticeStore((s) => s.translations);
  const attempts = usePracticeStore((s) => s.attempts);
  const { practiceRandom, emptyReason } = useRandomPractice();

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'title'>('recent');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [subtitleOpen, setSubtitleOpen] = useState(false);
  const [collectionDialogBookId, setCollectionDialogBookId] = useState<string | null>(null);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionTitle, setNewCollectionTitle] = useState('');

  const openBook = (bookId: string) => {
    const book = allBooks.find((item) => item.id === bookId);
    if (book?.source?.kind === 'collection' && book.chapters.length === 0) {
      // An empty collection has nothing to read yet; add the first article.
      setCollectionDialogBookId(book.id);
      return;
    }
    setCurrentBook(bookId);
    setCurrentChapter(getLastChapterIndexForBook(bookId));
    setCurrentView('reader');
  };

  const openAt = (bookId: string, chapterIndex: number, pairId: string) => {
    setCurrentBook(bookId);
    setCurrentChapter(chapterIndex);
    setScrollToPairId(pairId);
    setCurrentView('reader');
  };

  const handleEpubFile = (file: File) => {
    if (file.name.endsWith('.epub')) void parseFile(file);
  };

  const handleSample = () => {
    const existing = allBooks.find((book) => book.title === '吾輩は猫である（节选）');
    if (existing) {
      openBook(existing.id);
      return;
    }
    const book = sampleBook();
    addBook(book);
    setCurrentView('reader');
  };

  const continueBook = useMemo(() => {
    if (allBooks.length === 0) return null;
    const active = allBooks.find(
      (book) => book.id === currentBookId && book.chapters.length > 0
    );
    if (active) return active;
    const readable = allBooks.filter((book) => book.chapters.length > 0);
    if (readable.length === 0) return allBooks[0];
    return [...readable].sort((a, b) => (b.importedAt ?? 0) - (a.importedAt ?? 0))[0];
  }, [allBooks, currentBookId]);

  const continueInfo = useMemo(() => {
    if (!continueBook) return null;
    const chapterIndex = Math.min(
      getLastChapterIndexForBook(continueBook.id),
      Math.max(0, continueBook.chapters.length - 1)
    );
    const chapter = continueBook.chapters[chapterIndex];
    const progressIndex = chapter ? readingProgress[chapter.id] ?? 0 : 0;
    const total = chapter?.pairs.length ?? 0;
    const percent = total > 0 ? Math.round(((progressIndex + 1) / total) * 100) : 0;
    return { chapter, percent: Math.min(100, Math.max(0, percent)) };
  }, [continueBook, getLastChapterIndexForBook, readingProgress]);

  const library = useMemo(() => {
    const lower = query.trim().toLowerCase();
    const filtered = books.filter(
      (book) =>
        !lower ||
        book.title.toLowerCase().includes(lower) ||
        (book.author ?? '').toLowerCase().includes(lower)
    );
    if (sortBy === 'title') {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans'));
    }
    return [...filtered].sort((a, b) => (b.importedAt ?? 0) - (a.importedAt ?? 0));
  }, [books, query, sortBy]);

  const sentenceHits = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) return [];
    const hits: Array<{
      bookId: string;
      bookTitle: string;
      chapterIndex: number;
      chapterTitle: string;
      pairId: string;
      japanese: string;
      chinese: string;
    }> = [];

    for (const book of allBooks) {
      for (const chapter of book.chapters) {
        for (const pair of chapter.pairs) {
          const japanese = pair.japanese ?? '';
          const chinese = pair.chinese ?? '';
          if (
            !japanese.toLowerCase().includes(lower) &&
            !chinese.toLowerCase().includes(lower)
          ) {
            continue;
          }
          hits.push({
            bookId: book.id,
            bookTitle: book.title,
            chapterIndex: chapter.index,
            chapterTitle: chapter.title,
            pairId: pair.id,
            japanese,
            chinese,
          });
          if (hits.length >= 60) return hits;
        }
      }
    }
    return hits;
  }, [allBooks, query]);

  const journal = useMemo(
    () =>
      journalSummary(
        buildJournalEntries(allBooks, analyses, translations, attempts ?? {})
      ),
    [allBooks, analyses, translations, attempts]
  );

  const handleCreateCollection = () => {
    const id = createCollectionBook(newCollectionTitle);
    if (id) setCollectionDialogBookId(id);
    setNewCollectionTitle('');
    setNewCollectionOpen(false);
  };

  return (
    <section className="shelf-app home-app">
      <header className="shelf-topbar">
        <span className="shelf-brand">baku-yomi</span>
        <span className="shelf-divider" aria-hidden="true" />
        <span className="shelf-crumb">桌面 · 読書</span>

        <div className="shelf-top-right">
          {books.length > 0 && (
            <label className="shelf-search">
              <FiSearch size={13} aria-hidden="true" />
              <input
                placeholder="搜索书名 / 作者"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="搜索书名或作者"
              />
            </label>
          )}

          <button
            className="shelf-btn"
            onClick={() => practiceRandom()}
            title="从所有材料里随机抽一句练习"
          >
            <FiShuffle size={13} />
            随机练一句
          </button>

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

      <main className="home-main">
        {emptyReason && <p className="random-empty-note">{emptyReason}</p>}
        {books.length === 0 ? (
          <div className="home-empty">
            <div className="home-empty-copy">
              <span className="home-kicker">BAKU-YOMI · 双語回訳</span>
              <h1>把一段日文放进来，<br />在原文下面写回日语。</h1>
              <p>
                导入双语 EPUB，或者直接粘贴一篇文章。读到哪里就在哪一句下面练习，
                AI 会标出你的回译和原文的差距。没有双语也没关系——可以按章让 AI 译出来。
              </p>
              <div className="home-empty-actions">
                <AddMaterialMenu
                  onEpub={handleEpubFile}
                  onPaste={() => setPasteOpen(true)}
                  onGenerate={() => setGenerateOpen(true)}
                  onSubtitle={() => setSubtitleOpen(true)}
                  onNote={() => setCurrentView('note')}
                  uploading={parsing}
                />
                <button className="quiet-link home-sample-link" onClick={handleSample}>
                  先用示例试读 <FiArrowRight size={12} />
                </button>
              </div>
            </div>

            <ol className="home-steps">
              <li>
                <span>01</span>
                <b>放进材料</b>
                <p>EPUB、TXT、Markdown，或直接从网页和公众号粘贴。</p>
              </li>
              <li>
                <span>02</span>
                <b>边读边写</b>
                <p>选中任意一句，在它下面写回日语，不离开阅读。</p>
              </li>
              <li>
                <span>03</span>
                <b>看差距</b>
                <p>AI 逐条批注用词、助词和语感，练习记录会留下来。</p>
              </li>
            </ol>
          </div>
        ) : (
          <>
            {continueBook && continueInfo && (
              <section className="home-continue">
                <div className="home-continue-copy">
                  <span className="home-kicker">继续阅读</span>
                  <h1>{continueBook.title}</h1>
                  <p className="home-continue-meta">
                    {continueBook.author || '未知作者'}
                    {` · ${sourceLabel(continueBook)}`}
                    {continueInfo.chapter && ` · ${continueInfo.chapter.title}`}
                    {` · 读到 ${continueInfo.percent}%`}
                  </p>
                  <div className="home-progress" aria-hidden="true">
                    <span style={{ width: `${Math.max(2, continueInfo.percent)}%` }} />
                  </div>
                  <button
                    className="shelf-btn primary"
                    onClick={() => openBook(continueBook.id)}
                  >
                    <FiBookOpen size={13} /> 接着读
                  </button>
                </div>
                <div className="home-continue-side">
                  <span className="home-kicker">添加材料</span>
                  <AddMaterialMenu
                    onEpub={handleEpubFile}
                    onPaste={() => setPasteOpen(true)}
                    onGenerate={() => setGenerateOpen(true)}
                    onSubtitle={() => setSubtitleOpen(true)}
                    onNote={() => setCurrentView('note')}
                    uploading={parsing}
                    variant="card"
                  />
                  {noteSourceCount > 0 && (
                    <button
                      className="home-add-card note-home-card"
                      onClick={() => setCurrentView('note')}
                    >
                      <FiGlobe size={16} />
                      <span>
                        <b>note 阅读源</b>
                        <small>
                          {noteUnread > 0
                            ? `${noteUnread} 篇未读`
                            : `${noteSourceCount} 个来源`}
                        </small>
                      </span>
                    </button>
                  )}
                </div>
              </section>
            )}

            <section className="home-library">
              <div className="home-library-head">
                <div>
                  <span className="home-kicker">材料库</span>
                  <h2>{query.trim() ? '搜索结果' : '最近添加'}</h2>
                </div>
                <div className="home-library-tools">
                  {newCollectionOpen ? (
                    <form
                      className="home-collection-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        handleCreateCollection();
                      }}
                    >
                      <input
                        value={newCollectionTitle}
                        onChange={(event) => setNewCollectionTitle(event.target.value)}
                        placeholder="合集名称"
                        aria-label="新合集名称"
                        autoFocus
                      />
                      <button className="shelf-btn" type="submit">
                        建立
                      </button>
                      <button
                        type="button"
                        className="quiet-link"
                        onClick={() => {
                          setNewCollectionOpen(false);
                          setNewCollectionTitle('');
                        }}
                      >
                        取消
                      </button>
                    </form>
                  ) : (
                    <button
                      className="shelf-btn"
                      onClick={() => setNewCollectionOpen(true)}
                    >
                      + 合集
                    </button>
                  )}
                  <label className="shelf-sort">
                    <span>排序</span>
                    <select
                      value={sortBy}
                      onChange={(event) =>
                        setSortBy(event.target.value as 'recent' | 'title')
                      }
                      aria-label="排序方式"
                    >
                      <option value="recent">导入时间</option>
                      <option value="title">书名</option>
                    </select>
                  </label>
                  <button
                    className="shelf-btn"
                    onClick={() => setCurrentView('bookshelf')}
                  >
                    全部材料 <FiArrowRight size={12} />
                  </button>
                </div>
              </div>

              {query.trim() && (
                <section className="home-hits">
                  <div className="home-hits-head">
                    <span>句子命中</span>
                    <b>{sentenceHits.length}</b>
                    {sentenceHits.length >= 60 && <small>只显示前 60 条</small>}
                  </div>
                  {sentenceHits.length === 0 ? (
                    <p className="home-hits-empty">正文里没有匹配的句子。</p>
                  ) : (
                    <ul className="home-hit-list">
                      {sentenceHits.map((hit) => (
                        <li key={hit.pairId}>
                          <button
                            className="home-hit"
                            onClick={() =>
                              openAt(hit.bookId, hit.chapterIndex, hit.pairId)
                            }
                          >
                            <span className="home-hit-ja">{hit.japanese}</span>
                            {hit.chinese && (
                              <span className="home-hit-zh">{hit.chinese}</span>
                            )}
                            <span className="home-hit-meta">
                              {hit.bookTitle} · {hit.chapterTitle}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {library.length === 0 ? (
                <p className="shelf-empty">
                  <span>没有匹配的材料，换个关键词试试。</span>
                </p>
              ) : (
                <div className="bookshelf-grid home-grid">
                  {library.slice(0, RECENT_LIMIT).map((book) => (
                    <BookCard key={book.id} book={book} onOpen={() => openBook(book.id)} />
                  ))}
                </div>
              )}
            </section>

            <section className="home-journal">
              <button
                className="home-journal-card"
                onClick={() => setCurrentView('review')}
              >
                <div className="home-journal-copy">
                  <span className="home-kicker">练习记录</span>
                  <h2>
                    {journal.uniqueSentences > 0
                      ? `${journal.uniqueSentences} 句练习过`
                      : '还没有练习记录'}
                  </h2>
                  <p>
                    {journal.uniqueSentences > 0
                      ? `累计 ${journal.totalAttempts} 次批改 · ${journal.materials} 份材料 · 本周 ${journal.thisWeek} 次`
                      : '在阅读里写一句回译，每次批改都会留在这里。'}
                  </p>
                </div>
                <span className="home-journal-cta">
                  打开记录 <FiArrowRight size={12} />
                </span>
              </button>
            </section>
          </>
        )}
      </main>

      <PasteTextDialog open={pasteOpen} onClose={() => setPasteOpen(false)} />
      <GenerateMaterialDialog open={generateOpen} onClose={() => setGenerateOpen(false)} />
      <SubtitleImportDialog open={subtitleOpen} onClose={() => setSubtitleOpen(false)} />
      <PasteTextDialog
        open={collectionDialogBookId !== null}
        onClose={() => setCollectionDialogBookId(null)}
        targetBookId={collectionDialogBookId ?? undefined}
      />
    </section>
  );
}
