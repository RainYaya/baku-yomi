import { useMemo, useState } from 'react';
import {
  FiArrowLeft,
  FiCopy,
  FiPlus,
  FiSearch,
  FiSettings,
} from 'react-icons/fi';
import { useBookStore } from '../../stores/bookSlice';
import { useSettingsStore, type VocabDensity } from '../../stores/settingsSlice';
import { useUIStore } from '../../stores/uiSlice';
import { useVocabStore } from '../../stores/vocabSlice';
import { ThemeToggle } from '../../theme/ThemeToggle';
import { VocabEntryCard } from './VocabEntryCard';
import { VocabEntryRow } from './VocabEntryRow';
import { createManualVocabDraft, createVocabDraftFromEntry } from '../../lib/vocab/draft';
import { formatVocabExport } from '../../lib/vocab/export';
import { filterVocabEntries } from '../../lib/vocab/filter';
import { copyText } from '../../lib/clipboard';
import type { VocabEntry, VocabStatus } from '../../types';

type StatusFilter = 'all' | VocabStatus;
type CopyState = 'idle' | 'ok' | 'fail';

export function VocabPage() {
  const entries = useVocabStore((s) => s.entries);
  const books = useBookStore((s) => s.books);
  const density = useSettingsStore((s) => s.vocabDensity);
  const setVocabDensity = useSettingsStore((s) => s.setVocabDensity);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const openSettings = useUIStore((s) => s.openSettings);
  const openVocabDialog = useUIStore((s) => s.openVocabDialog);

  const [query, setQuery] = useState('');
  const [bookFilter, setBookFilter] = useState('all');
  const [chapterFilter, setChapterFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const selectedBook = books.find((book) => book.id === bookFilter);

  const filtered = useMemo(
    () =>
      filterVocabEntries(entries, {
        query,
        bookId: bookFilter === 'all' ? undefined : bookFilter,
        chapterId: chapterFilter === 'all' ? undefined : chapterFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
      }),
    [entries, query, bookFilter, chapterFilter, statusFilter]
  );

  const openEntry = (entry: VocabEntry) => {
    openVocabDialog({
      draft: createVocabDraftFromEntry(entry),
      entry,
    });
  };

  const handleExport = async () => {
    if (filtered.length === 0) return;
    const ok = await copyText(formatVocabExport(filtered));
    setCopyState(ok ? 'ok' : 'fail');
    window.setTimeout(() => setCopyState('idle'), 2200);
  };

  const handleBookChange = (value: string) => {
    setBookFilter(value);
    setChapterFilter('all');
  };

  return (
    <section className="shelf-app vocab-app">
      <header className="shelf-topbar">
        <button
          className="shelf-brand shelf-brand-btn"
          onClick={() => setCurrentView('home')}
          title="回到桌面"
        >
          baku-yomi
        </button>
        <span className="shelf-divider" aria-hidden="true" />
        <span className="shelf-crumb">生詞 · 生词本</span>

        <div className="shelf-top-right">
          <label className="shelf-search">
            <FiSearch size={13} aria-hidden="true" />
            <input
              placeholder="搜索词 / 读音 / 例句"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="搜索生词"
            />
          </label>

          <button
            className="shelf-btn"
            onClick={() => setCurrentView('bookshelf')}
            title="回到书架"
          >
            <FiArrowLeft size={13} aria-hidden="true" />
            书架
          </button>

          <button
            className="shelf-btn"
            onClick={handleExport}
            disabled={filtered.length === 0}
            title="复制为 ref 格式"
          >
            <FiCopy size={13} aria-hidden="true" />
            {copyState === 'ok'
              ? '已复制'
              : copyState === 'fail'
                ? '复制失败'
                : '复制导出'}
          </button>

          <button
            className="shelf-btn primary"
            onClick={() => openVocabDialog({ draft: createManualVocabDraft() })}
          >
            <FiPlus size={13} aria-hidden="true" />
            添加生词
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

      <main className="vocab-main">
        <div className="vocab-head">
          <div>
            <span className="home-kicker">Vocabulary</span>
            <h1>生词</h1>
            <p>
              共 {entries.length} 个词。阅读时选中一个词，点「生词」就能存进来。
            </p>
          </div>

          <div className="vocab-filters">
            <label className="review-filter">
              <span>书</span>
              <select
                value={bookFilter}
                onChange={(event) => handleBookChange(event.target.value)}
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
              <span>章</span>
              <select
                value={chapterFilter}
                onChange={(event) => setChapterFilter(event.target.value)}
                aria-label="按章筛选"
                disabled={!selectedBook}
              >
                <option value="all">全部</option>
                {selectedBook?.chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="review-filter">
              <span>状态</span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
                aria-label="按状态筛选"
              >
                <option value="all">全部</option>
                <option value="new">未掌握</option>
                <option value="known">已掌握</option>
              </select>
            </label>

            <div className="vocab-density" role="group" aria-label="列表密度">
              {(
                [
                  ['compact', '紧凑'],
                  ['card', '卡片'],
                ] as [VocabDensity, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={density === value ? 'on' : undefined}
                  aria-pressed={density === value}
                  onClick={() => setVocabDensity(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="review-empty vocab-empty">
            <p>还没有生词。</p>
            <p className="review-empty-sub">
              阅读时选中一个词，点「生词」就能存进来。也可以先手动添加一个。
            </p>
            <button
              className="shelf-btn primary"
              onClick={() => openVocabDialog({ draft: createManualVocabDraft() })}
            >
              手动添加
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="review-empty">没有符合筛选条件的生词。</p>
        ) : (
          <ol className={`vocab-list${density === 'compact' ? ' compact' : ''}`}>
            {filtered.map((entry) => (
              <li key={entry.id}>
                {density === 'compact' ? (
                  <VocabEntryRow entry={entry} books={books} onOpen={openEntry} />
                ) : (
                  <VocabEntryCard entry={entry} books={books} onOpen={openEntry} />
                )}
              </li>
            ))}
          </ol>
        )}
      </main>
    </section>
  );
}
