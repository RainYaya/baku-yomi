import { useMemo, useState } from 'react';
import { useBookStore } from '../../stores/bookSlice';
import { usePracticeStore } from '../../stores/practiceSlice';
import { useUIStore } from '../../stores/uiSlice';
import { FeedbackNotes, scoreOf } from '../analysis/FeedbackNotes';
import { ThemeToggle } from '../../theme/ThemeToggle';
import { FiArrowLeft, FiArrowUpRight, FiSearch, FiSettings } from 'react-icons/fi';
import { errorCategoriesOf } from '../../lib/analysis/errorCategories';
import type {
  AnalysisResult,
  Book,
  Chapter,
  ErrorCategory,
  SentencePair,
} from '../../types';

type ScoreBand = 'all' | 'weak' | 'mid' | 'good';
type ErrorFilter = 'all' | ErrorCategory;
type SortBy = 'recent' | 'score';

interface ReviewEntry {
  pairId: string;
  pair: SentencePair;
  chapter: Chapter;
  book: Book;
  analysis: AnalysisResult;
  translation: string;
  score: number;
}

function inBand(score: number, band: ScoreBand): boolean {
  if (band === 'all') return true;
  if (band === 'weak') return score < 70;
  if (band === 'mid') return score >= 70 && score < 85;
  return score >= 85;
}

export function ReviewPage() {
  const books = useBookStore((s) => s.books);
  const setCurrentBook = useBookStore((s) => s.setCurrentBook);
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const setScrollToPairId = useBookStore((s) => s.setScrollToPairId);
  const setPracticePairId = useBookStore((s) => s.setPracticePairId);
  const analyses = usePracticeStore((s) => s.analyses);
  const translations = usePracticeStore((s) => s.translations);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const openSettings = useUIStore((s) => s.openSettings);

  const [bookFilter, setBookFilter] = useState('all');
  const [band, setBand] = useState<ScoreBand>('all');
  const [errorFilter, setErrorFilter] = useState<ErrorFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const entries = useMemo(() => {
    const list: ReviewEntry[] = [];
    for (const book of books) {
      for (const chapter of book.chapters) {
        for (const pair of chapter.pairs) {
          const analysis = analyses[pair.id];
          if (!analysis) continue;
          list.push({
            pairId: pair.id,
            pair,
            chapter,
            book,
            analysis,
            translation: translations[pair.id] ?? '',
            score: scoreOf(analysis),
          });
        }
      }
    }
    return list;
  }, [analyses, books, translations]);

  const errorCategories = useMemo(() => {
    const seen = new Set<ErrorCategory>();
    for (const entry of entries) {
      for (const category of errorCategoriesOf(entry.analysis)) seen.add(category);
    }
    return [...seen];
  }, [entries]);

  const filtered = useMemo(() => {
    const lower = query.trim().toLowerCase();
    const list = entries.filter((entry) => {
      if (bookFilter !== 'all' && entry.book.id !== bookFilter) return false;
      if (!inBand(entry.score, band)) return false;
      if (
        errorFilter !== 'all' &&
        !errorCategoriesOf(entry.analysis).includes(errorFilter)
      ) {
        return false;
      }
      if (!lower) return true;
      return (
        entry.pair.japanese.toLowerCase().includes(lower) ||
        (entry.pair.chinese ?? '').toLowerCase().includes(lower) ||
        entry.translation.toLowerCase().includes(lower) ||
        entry.book.title.toLowerCase().includes(lower)
      );
    });
    if (sortBy === 'score') return [...list].sort((a, b) => a.score - b.score);
    return [...list].sort(
      (a, b) => (b.analysis.analyzedAt ?? 0) - (a.analysis.analyzedAt ?? 0)
    );
  }, [band, bookFilter, entries, errorFilter, query, sortBy]);

  const openEntry = (entry: ReviewEntry) => {
    setCurrentBook(entry.book.id);
    setCurrentChapter(entry.chapter.index);
    setScrollToPairId(entry.pairId);
    setCurrentView('reader');
  };

  const practiceAgain = (entry: ReviewEntry) => {
    openEntry(entry);
    setPracticePairId(entry.pairId);
  };

  return (
    <section className="shelf-app review-app">
      <header className="shelf-topbar">
        <button
          className="shelf-brand shelf-brand-btn"
          onClick={() => setCurrentView('home')}
          title="回到桌面"
        >
          baku-yomi
        </button>
        <span className="shelf-divider" aria-hidden="true" />
        <span className="shelf-crumb">練習回顾 · 批改记录</span>

        <div className="shelf-top-right">
          <label className="shelf-search">
            <FiSearch size={13} aria-hidden="true" />
            <input
              placeholder="搜索句子或书"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="搜索练习记录"
            />
          </label>
          <button
            className="shelf-btn"
            onClick={() => setCurrentView('bookshelf')}
          >
            <FiArrowLeft size={13} /> 书架
          </button>
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

      <main className="review-main">
        <div className="review-head">
          <div>
            <span className="home-kicker">Practice Archive</span>
            <h1>练习回顾</h1>
            <p>
              共 {entries.length} 次批改。按分数或错误类型筛出还生疏的句子，回到原句再写一遍。
            </p>
          </div>
          <div className="review-filters">
            <label className="review-filter">
              <span>书</span>
              <select
                value={bookFilter}
                onChange={(event) => setBookFilter(event.target.value)}
                aria-label="按书筛选"
              >
                <option value="all">全部</option>
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="review-filter">
              <span>分数</span>
              <select
                value={band}
                onChange={(event) => setBand(event.target.value as ScoreBand)}
                aria-label="按分数筛选"
              >
                <option value="all">全部</option>
                <option value="weak">70 以下</option>
                <option value="mid">70 – 84</option>
                <option value="good">85 以上</option>
              </select>
            </label>
            <label className="review-filter">
              <span>错误</span>
              <select
                value={errorFilter}
                onChange={(event) =>
                  setErrorFilter(event.target.value as ErrorFilter)
                }
                aria-label="按错误类型筛选"
              >
                <option value="all">全部</option>
                {errorCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="review-filter">
              <span>排序</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortBy)}
                aria-label="排序方式"
              >
                <option value="recent">最近</option>
                <option value="score">分数从低到高</option>
              </select>
            </label>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="review-empty">
            <p>还没有批改记录。</p>
            <p className="review-empty-sub">
              在阅读里选中一句，写下回译并提交批改，这里就会留下记录。
            </p>
            <button className="shelf-btn primary" onClick={() => setCurrentView('home')}>
              回桌面继续读
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="review-empty">没有符合筛选条件的记录。</p>
        ) : (
          <ol className="review-list">
            {filtered.map((entry) => {
              const isOpen = expanded === entry.pairId;
              return (
                <li key={entry.pairId} className="review-item" data-open={isOpen}>
                  <div className="review-item-main">
                    <span
                      className="review-score"
                      data-band={
                        entry.score < 70 ? 'weak' : entry.score < 85 ? 'mid' : 'good'
                      }
                    >
                      {entry.score}
                    </span>
                    <div className="review-copy">
                      <p className="review-ja">{entry.pair.japanese}</p>
                      {entry.pair.chinese && (
                        <p className="review-zh">{entry.pair.chinese}</p>
                      )}
                      {entry.translation && (
                        <p className="review-attempt">
                          <span>回译</span> {entry.translation}
                        </p>
                      )}
                      <p className="review-meta">
                        {entry.book.title} · {entry.chapter.title}
                        {entry.analysis.analyzedAt
                          ? ` · ${new Date(entry.analysis.analyzedAt).toLocaleDateString('zh-CN')}`
                          : ''}
                      </p>
                    </div>
                    <div className="review-actions">
                      <button
                        className="shelf-btn"
                        onClick={() => setExpanded(isOpen ? null : entry.pairId)}
                      >
                        {isOpen ? '收起批注' : '看批注'}
                      </button>
                      <button className="shelf-btn" onClick={() => openEntry(entry)}>
                        回到原句 <FiArrowUpRight size={12} />
                      </button>
                      <button
                        className="shelf-btn primary"
                        onClick={() => practiceAgain(entry)}
                      >
                        再练一次
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="review-feedback">
                      <FeedbackNotes result={entry.analysis} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </main>
    </section>
  );
}
