import { useMemo, useState } from 'react';
import { useBookStore } from '../../stores/bookSlice';
import { usePracticeStore } from '../../stores/practiceSlice';
import { useUIStore } from '../../stores/uiSlice';
import { FeedbackNotes } from '../analysis/FeedbackNotes';
import { PracticeAttemptHistory } from './PracticeAttemptHistory';
import { ThemeToggle } from '../../theme/ThemeToggle';
import { useRandomPractice } from '../../hooks/useRandomPractice';
import {
  FiArrowLeft,
  FiArrowUpRight,
  FiSearch,
  FiSettings,
  FiShuffle,
} from 'react-icons/fi';
import { errorCategoriesOf } from '../../lib/analysis/errorCategories';
import {
  buildJournalEntries,
  filterJournalEntries,
  journalSummary,
  type JournalEntry,
  type ScoreBand,
} from '../../lib/practice/journal';
import {
  sourceGroup,
  sourceGroupLabel,
  sourceLabel,
  type SourceGroup,
} from '../../lib/library/sources';
import type { ErrorCategory } from '../../types';
import { useSettingsStore } from '../../stores/settingsSlice';
import { PairOrderToggle } from '../common/PairOrderToggle';

type ErrorFilter = 'all' | ErrorCategory;
type SortBy = 'recent' | 'score';
type DateRange = 'all' | '7' | '30';

export function ReviewPage() {
  const books = useBookStore((s) => s.books);
  const pairOrder = useSettingsStore((s) => s.pairOrder);
  const setCurrentBook = useBookStore((s) => s.setCurrentBook);
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const setScrollToPairId = useBookStore((s) => s.setScrollToPairId);
  const setPracticePairId = useBookStore((s) => s.setPracticePairId);
  const analyses = usePracticeStore((s) => s.analyses);
  const translations = usePracticeStore((s) => s.translations);
  const attempts = usePracticeStore((s) => s.attempts);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const openSettings = useUIStore((s) => s.openSettings);
  const { practiceRandom, emptyReason } = useRandomPractice();

  const [bookFilter, setBookFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | SourceGroup>('all');
  const [band, setBand] = useState<ScoreBand>('all');
  const [errorFilter, setErrorFilter] = useState<ErrorFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const entries = useMemo(
    () => buildJournalEntries(books, analyses, translations, attempts ?? {}),
    [analyses, attempts, books, translations]
  );

  const summary = useMemo(() => journalSummary(entries), [entries]);

  const sourceOptions = useMemo(() => {
    const groups = new Set<SourceGroup>();
    for (const entry of entries) groups.add(sourceGroup(entry.book));
    return [...groups];
  }, [entries]);

  const errorCategories = useMemo(() => {
    const seen = new Set<ErrorCategory>();
    for (const entry of entries) {
      for (const category of errorCategoriesOf(entry.analysis)) seen.add(category);
    }
    return [...seen];
  }, [entries]);

  const filtered = useMemo(() => {
    const since =
      dateRange === 'all'
        ? undefined
        : now - Number(dateRange) * 86400_000;

    return filterJournalEntries(entries, {
      bookId: bookFilter === 'all' ? undefined : bookFilter,
      source: sourceFilter,
      band,
      error: errorFilter,
      query,
      since,
      sortBy,
    });
  }, [
    band,
    bookFilter,
    dateRange,
    entries,
    errorFilter,
    now,
    query,
    sortBy,
    sourceFilter,
  ]);

  const openEntry = (entry: JournalEntry) => {
    setCurrentBook(entry.book.id);
    setCurrentChapter(entry.chapter.index);
    setScrollToPairId(entry.pairId);
    setCurrentView('reader');
  };

  const practiceAgain = (entry: JournalEntry) => {
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
        <span className="shelf-crumb">練習記録 · 练习记录</span>

        <div className="shelf-top-right">
          <label className="shelf-search">
            <FiSearch size={13} aria-hidden="true" />
            <input
              placeholder="搜索句子、回译或材料"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="搜索练习记录"
            />
          </label>
          <button
            className="shelf-btn"
            onClick={() => setCurrentView('bookshelf')}
          >
            <FiArrowLeft size={13} /> 材料库
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
            <span className="home-kicker">Practice Journal</span>
            <h1>练习记录</h1>
            <p>
              所有材料里的练习都在这里。展开一句，可以看到每次回译和批改的变化。
            </p>
            <div className="review-random">
              <button
                className="shelf-btn primary"
                onClick={() =>
                  practiceRandom({
                    sourceGroup: sourceFilter,
                    bookId: bookFilter === 'all' ? undefined : bookFilter,
                    onlyWeak: band === 'weak' ? true : undefined,
                  })
                }
              >
                <FiShuffle size={13} /> 随机练一句
              </button>
              {emptyReason && <span className="review-random-empty">{emptyReason}</span>}
            </div>
          </div>
          <div className="review-filters">
            <label className="review-filter">
              <span>材料</span>
              <select
                value={bookFilter}
                onChange={(event) => setBookFilter(event.target.value)}
                aria-label="按材料筛选"
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
              <span>来源</span>
              <select
                value={sourceFilter}
                onChange={(event) =>
                  setSourceFilter(event.target.value as 'all' | SourceGroup)
                }
                aria-label="按来源筛选"
              >
                <option value="all">全部</option>
                {sourceOptions.map((group) => (
                  <option key={group} value={group}>
                    {sourceGroupLabel(group)}
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
              <span>时间</span>
              <select
                value={dateRange}
                onChange={(event) =>
                  setDateRange(event.target.value as DateRange)
                }
                aria-label="按时间筛选"
              >
                <option value="all">全部</option>
                <option value="7">近 7 天</option>
                <option value="30">近 30 天</option>
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
            <div className="review-filter review-filter-order">
              <span>顺序</span>
              <PairOrderToggle />
            </div>
          </div>
        </div>

        <div className="review-summary">
          {[
            ['累计批改', summary.totalAttempts, '次'],
            ['去重句子', summary.uniqueSentences, '句'],
            ['材料', summary.materials, '份'],
            ['70 分以下', summary.weak, '句'],
            ['本周练习', summary.thisWeek, '次'],
          ].map(([label, value, unit]) => (
            <div className="review-summary-cell" key={String(label)}>
              <span>{label}</span>
              <b>{value}</b>
              <small>{unit}</small>
            </div>
          ))}
        </div>

        {entries.length === 0 ? (
          <div className="review-empty">
            <p>还没有练习记录。</p>
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
              const zhLine = entry.pair.chinese ? (
                <p className="review-zh">{entry.pair.chinese}</p>
              ) : null;
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
                      {pairOrder === 'zh-ja' && zhLine}
                      <p className="review-ja">{entry.pair.japanese}</p>
                      {pairOrder === 'ja-zh' && zhLine}
                      {entry.translation && (
                        <p className="review-attempt">
                          <span>回译</span> {entry.translation}
                        </p>
                      )}
                      <p className="review-meta">
                        <span
                          className="review-source-badge"
                          data-source={entry.book.source?.kind ?? 'book'}
                        >
                          {sourceLabel(entry.book)}
                        </span>
                        {entry.book.title} · {entry.chapter.title} · 练习{' '}
                        {entry.attemptCount} 次
                        {entry.latestAt
                          ? ` · ${new Date(entry.latestAt).toLocaleDateString('zh-CN')}`
                          : ''}
                      </p>
                    </div>
                    <div className="review-actions">
                      <button
                        className="shelf-btn"
                        onClick={() => setExpanded(isOpen ? null : entry.pairId)}
                      >
                        {isOpen ? '收起记录' : '看历史'}
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
                      <PracticeAttemptHistory attempts={entry.attempts} />
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
