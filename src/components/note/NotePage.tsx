import { useEffect, useMemo, useState } from 'react';
import {
  FiAlertCircle,
  FiGlobe,
  FiPlus,
  FiRefreshCw,
  FiSettings,
  FiSliders,
} from 'react-icons/fi';
import { useNoteFeed } from '../../hooks/useNoteFeed';
import { useNoteArticle } from '../../hooks/useNoteArticle';
import { normalizeNoteUrl } from '../../lib/note/feed';
import { useNoteStore, DEFAULT_NOTE_SOURCES } from '../../stores/noteSlice';
import { useUIStore } from '../../stores/uiSlice';
import { ThemeToggle } from '../../theme/ThemeToggle';
import { NoteItemRow } from './NoteItemRow';
import { NoteSourceDialog } from './NoteSourceDialog';
import { PasteTextDialog } from '../import/PasteTextDialog';
import type { NoteChapterMeta, NoteFeedItem, NoteSourceKind } from '../../types';

function metaForItem(item: NoteFeedItem): NoteChapterMeta {
  const separator = item.sourceId.indexOf(':');
  const kind: NoteSourceKind =
    separator >= 0 && item.sourceId.slice(0, separator) === 'author'
      ? 'author'
      : 'hashtag';
  return {
    url: item.url,
    author: item.author,
    publishedAt: item.publishedAt,
    sourceKind: kind,
    sourceKey: separator >= 0 ? item.sourceId.slice(separator + 1) : '',
    tags: [],
  };
}

export function NotePage() {
  const {
    sources,
    enabledSources,
    items,
    unread,
    sourceCounts,
    sourceErrors,
    seeded,
    loading,
    refreshing,
    error,
    refresh,
  } = useNoteFeed();
  const readAt = useNoteStore((s) => s.readAt);
  const hideItem = useNoteStore((s) => s.hideItem);
  const unhideItem = useNoteStore((s) => s.unhideItem);
  const addSource = useNoteStore((s) => s.addSource);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const openSettings = useUIStore((s) => s.openSettings);

  const {
    openNoteArticle,
    busyUrl,
    error: articleError,
    dismissError,
    partial,
    confirmPartial,
    cancelPartial,
  } = useNoteArticle();

  const [selectedSource, setSelectedSource] = useState('all');
  const [manageOpen, setManageOpen] = useState(false);
  const [toastItem, setToastItem] = useState<NoteFeedItem | null>(null);
  const [lastAttempt, setLastAttempt] = useState<NoteFeedItem | null>(null);
  const [pasteItem, setPasteItem] = useState<NoteFeedItem | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);

  const labelById = useMemo(
    () => Object.fromEntries(sources.map((source) => [source.id, source.label])),
    [sources]
  );

  const activeSource =
    selectedSource !== 'all' &&
    enabledSources.some((source) => source.id === selectedSource)
      ? selectedSource
      : 'all';

  const visibleItems =
    activeSource === 'all'
      ? items
      : items.filter((item) => item.sourceId === activeSource);

  const failedCount = Object.keys(sourceErrors).length;

  useEffect(() => {
    if (!toastItem) return;
    const timer = setTimeout(() => setToastItem(null), 6000);
    return () => clearTimeout(timer);
  }, [toastItem]);

  const handleOpen = (item: NoteFeedItem) => {
    setLastAttempt(item);
    void openNoteArticle(item.url, item.sourceId);
  };

  const handleHide = (item: NoteFeedItem) => {
    hideItem(item.url);
    setToastItem(item);
  };

  const openOriginal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const retry = () => {
    if (lastAttempt) {
      void openNoteArticle(lastAttempt.url, lastAttempt.sourceId);
    }
  };

  const noteContext = useMemo(
    () =>
      pasteItem
        ? { title: pasteItem.title, note: metaForItem(pasteItem) }
        : undefined,
    [pasteItem]
  );

  return (
    <section className="shelf-app note-app">
      <header className="shelf-topbar">
        <button
          className="shelf-brand shelf-brand-btn"
          onClick={() => setCurrentView('home')}
          title="回到桌面"
        >
          baku-yomi
        </button>
        <span className="shelf-divider" aria-hidden="true" />
        <span className="shelf-crumb">note · 阅读源</span>

        <div className="shelf-top-right">
          <button
            className="shelf-btn"
            onClick={() => void refresh(true)}
            disabled={refreshing || enabledSources.length === 0}
            title="重新读取所有来源"
          >
            <FiRefreshCw size={13} className={refreshing ? 'note-spin' : undefined} />
            {refreshing ? '刷新中…' : '刷新'}
          </button>
          <button className="shelf-btn" onClick={() => setManageOpen(true)}>
            <FiSliders size={13} /> 管理来源
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

      <main className="note-main">
        <div className="note-title-row">
          <div>
            <span className="note-kicker">NOTE · 読みもの</span>
            <h1>note</h1>
          </div>
          <span className="note-title-meta">
            {items.length} 篇 · {unread} 未读
          </span>
        </div>

        <div className="note-source-bar" role="tablist" aria-label="note 来源">
          <button
            type="button"
            role="tab"
            aria-selected={activeSource === 'all'}
            className={`note-chip${activeSource === 'all' ? ' active' : ''}`}
            onClick={() => setSelectedSource('all')}
          >
            全部
            <span className="note-chip-count">{items.length}</span>
          </button>

          {enabledSources.map((source) => (
            <button
              key={source.id}
              type="button"
              role="tab"
              aria-selected={activeSource === source.id}
              className={`note-chip${activeSource === source.id ? ' active' : ''}`}
              data-error={sourceErrors[source.id] ? 'true' : undefined}
              title={sourceErrors[source.id]}
              onClick={() => setSelectedSource(source.id)}
            >
              {source.label}
              <span className="note-chip-count">{sourceCounts[source.id] ?? 0}</span>
              {sourceErrors[source.id] && <FiAlertCircle size={11} />}
            </button>
          ))}

          <button
            type="button"
            className="note-chip note-chip-add"
            onClick={() => setManageOpen(true)}
            aria-label="添加或管理来源"
            title="添加或管理来源"
          >
            <FiPlus size={12} />
          </button>
        </div>

        {(error || failedCount > 0) && (
          <div className="note-error-bar" role="status">
            <FiAlertCircle size={14} />
            <span>
              {error ??
                `${failedCount} 个来源读取失败${Object.keys(sourceErrors).length === 1 ? `（${Object.values(sourceErrors)[0]}）` : ''}`}
            </span>
            <button className="quiet-link" onClick={() => void refresh(true)}>
              重试
            </button>
            <a
              className="quiet-link"
              href="https://note.com"
              target="_blank"
              rel="noreferrer"
            >
              在 note 打开
            </a>
          </div>
        )}

        {articleError && (
          <div className="note-error-bar note-article-error" role="alert">
            <FiAlertCircle size={14} />
            <span>{articleError}</span>
            {lastAttempt && (
              <>
                <button className="quiet-link" onClick={retry}>
                  重试
                </button>
                <a
                  className="quiet-link"
                  href={lastAttempt.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  在 note 打开
                </a>
                <button
                  className="quiet-link"
                  onClick={() => {
                    setPasteItem(lastAttempt);
                    setPasteOpen(true);
                  }}
                >
                  手动粘贴正文
                </button>
              </>
            )}
            <button className="quiet-link" onClick={dismissError}>
              关闭
            </button>
          </div>
        )}

        {!seeded || (loading && items.length === 0) ? (
          <div className="note-skeleton" aria-label="正在读取 note 的更新">
            {[0, 1, 2, 3].map((index) => (
              <div className="note-skeleton-row" key={index}>
                <span className="note-skeleton-thumb" />
                <span className="note-skeleton-lines">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            ))}
          </div>
        ) : enabledSources.length === 0 ? (
          <div className="note-empty">
            <FiGlobe size={22} />
            <p>还没有 note 来源。先加一个话题，列表会在点开时按需读取。</p>
            <div className="note-recommend-chips">
              {DEFAULT_NOTE_SOURCES.map((source) => (
                <button
                  key={source.key}
                  type="button"
                  className="note-recommend-chip"
                  onClick={() => addSource(source)}
                >
                  #{source.key}
                </button>
              ))}
            </div>
            <button className="shelf-btn" onClick={() => setManageOpen(true)}>
              管理来源
            </button>
            <small>只读取公开文章；正文在点开时才加载。</small>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="note-empty">
            <p>
              {refreshing
                ? '正在读取 note 的更新…'
                : '当前话题下没有可读的新文章。'}
            </p>
            <button className="shelf-btn" onClick={() => void refresh(true)}>
              <FiRefreshCw size={13} /> 再读一次
            </button>
          </div>
        ) : (
          <div className="note-feed">
            {visibleItems.map((item) => (
              <NoteItemRow
                key={normalizeNoteUrl(item.url)}
                item={item}
                sourceLabel={labelById[item.sourceId] ?? 'note'}
                unread={!readAt[normalizeNoteUrl(item.url)]}
                opening={busyUrl === item.url}
                onOpen={() => handleOpen(item)}
                onHide={() => handleHide(item)}
              />
            ))}
          </div>
        )}
      </main>

      {manageOpen && (
        <NoteSourceDialog open onClose={() => setManageOpen(false)} />
      )}

      <PasteTextDialog
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        noteContext={noteContext}
      />

      {partial && (
        <div className="paste-overlay" onClick={cancelPartial}>
          <section
            className="paste-dialog note-partial-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="note-partial-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="paste-head">
              <div>
                <span className="paste-kicker">NOTE · PARTIAL</span>
                <h2 id="note-partial-title">这篇可能只公开了一部分</h2>
              </div>
            </header>
            <div className="paste-body">
              <p>
                note 返回了 {partial.article.paragraphs.length} 段可见正文，后面可能是付费或限定内容。
                默认不会自动保存，避免把半篇文章当成全文。
              </p>
              <p className="note-source-hint">{partial.article.title}</p>
            </div>
            <footer className="paste-foot">
              <button className="quiet-link" onClick={cancelPartial}>
                取消
              </button>
              <button
                className="quiet-link"
                onClick={() => openOriginal(partial.note.url)}
              >
                去 note 打开
              </button>
              <button className="stamp" onClick={confirmPartial}>
                仍然导入可见部分
              </button>
            </footer>
          </section>
        </div>
      )}

      {toastItem && (
        <div className="note-toast" role="status">
          <span>已隐藏《{toastItem.title || '无标题'}》</span>
          <button
            className="quiet-link"
            onClick={() => {
              unhideItem(toastItem.url);
              setToastItem(null);
            }}
          >
            撤销
          </button>
        </div>
      )}
    </section>
  );
}
