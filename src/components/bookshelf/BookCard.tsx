import { useMemo, useState } from 'react';
import type { Book } from '../../types';
import { useBookStore } from '../../stores/bookSlice';
import { FiPlay, FiEdit2, FiTrash2, FiLayers, FiFileText } from 'react-icons/fi';

interface Props {
  book: Book;
  onOpen: () => void;
}

function calcProgressPct(book: Book, readingProgress: Record<string, number>): number {
  const totalPairs = book.chapters.reduce((sum, ch) => sum + ch.pairs.length, 0);
  if (totalPairs <= 0) return 0;

  const readPairs = book.chapters.reduce((sum, ch) => {
    const idx = readingProgress[ch.id] ?? 0;
    return sum + Math.min(Math.max(idx, 0), ch.pairs.length);
  }, 0);

  return Math.round((readPairs / totalPairs) * 100);
}

function coverInitial(title: string): string {
  return title.trim().slice(0, 1) || '書';
}

/**
 * Older imports could stringify an EPUB creator object, leaving the literal
 * "[object Object]" in storage. Show the fallback instead of that artifact.
 */
function authorName(author: string): string {
  return author && author !== '[object Object]' ? author : '未知作者';
}

export function BookCard({ book, onOpen }: Props) {
  const readingProgress = useBookStore((s) => s.readingProgress);
  const removeBook = useBookStore((s) => s.removeBook);
  const renameBook = useBookStore((s) => s.renameBook);

  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [titleDraft, setTitleDraft] = useState(book.title);

  const progressPct = useMemo(
    () => calcProgressPct(book, readingProgress),
    [book, readingProgress]
  );

  const totalPairs = useMemo(
    () => book.chapters.reduce((sum, ch) => sum + ch.pairs.length, 0),
    [book.chapters]
  );

  const handleDelete = () => {
    removeBook(book.id);
    setConfirmingDelete(false);
  };

  return (
    <article
      className="bookshelf-card"
      data-rename-state={editing ? 'editing' : 'viewing'}
      data-delete-state={confirmingDelete ? 'confirming' : 'idle'}
    >
      {/* Cover */}
      <button
        type="button"
        className="bookshelf-cover"
        onClick={onOpen}
        aria-label={`打开《${book.title}》`}
      >
        {book.coverUrl ? (
          <img src={book.coverUrl} alt="" className="bookshelf-cover-img" />
        ) : (
          <div className="bookshelf-cover-fallback">
            <span className="bookshelf-cover-initial" aria-hidden="true">
              {coverInitial(book.title)}
            </span>
            <span className="bookshelf-cover-title">{book.title}</span>
          </div>
        )}
        {progressPct > 0 && (
          <div className="bookshelf-cover-progress">
            <div className="bookshelf-cover-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </button>

      {/* Body */}
      <div className="bookshelf-card-body">
        {editing ? (
          <div className="space-y-2">
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              className="settings-input"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  renameBook(book.id, titleDraft);
                  setEditing(false);
                } else if (e.key === 'Escape') {
                  setTitleDraft(book.title);
                  setEditing(false);
                }
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                className="settings-mini-btn"
                onClick={() => { renameBook(book.id, titleDraft); setEditing(false); }}
              >
                保存
              </button>
              <button
                className="settings-mini-btn"
                onClick={() => { setTitleDraft(book.title); setEditing(false); }}
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="bookshelf-title" title={book.title}>{book.title}</h3>
            <p className="bookshelf-subtitle">{authorName(book.author)}</p>

            {/* Stats row */}
            <div className="bookshelf-stats">
              <span className="bookshelf-stat">
                <FiLayers size={12} />
                {book.chapters.length} {book.source?.kind === 'collection' ? '篇' : '章'}
              </span>
              <span className="bookshelf-stat">
                <FiFileText size={12} />
                {totalPairs} 句对
              </span>
              {book.demo && <span className="bookshelf-stat">示例</span>}
              {progressPct > 0 && (
                <span className="bookshelf-stat bookshelf-stat-accent">
                  {progressPct}%
                </span>
              )}
            </div>

          </>
        )}

        {/* Actions */}
        {!editing && (
          confirmingDelete ? (
            <div className="bookshelf-confirm" role="group" aria-label="确认删除">
              <span>删除这本书？</span>
              <button className="bookshelf-confirm-danger" onClick={handleDelete}>
                确定删除
              </button>
              <button
                className="bookshelf-btn-icon"
                onClick={() => setConfirmingDelete(false)}
              >
                取消
              </button>
            </div>
          ) : (
            <div className="bookshelf-actions">
              <button className="bookshelf-btn-primary" onClick={onOpen}>
                <FiPlay size={13} />
                {book.source?.kind === 'collection' && book.chapters.length === 0
                  ? '添加文章'
                  : progressPct > 0
                    ? '继续阅读'
                    : '开始阅读'}
              </button>
              <button
                className="bookshelf-btn-icon"
                onClick={() => setEditing(true)}
                title="重命名"
                aria-label={`重命名《${book.title}》`}
              >
                <FiEdit2 size={14} />
              </button>
              <button
                className="bookshelf-btn-icon bookshelf-btn-danger"
                onClick={() => setConfirmingDelete(true)}
                title="删除"
                aria-label={`删除《${book.title}》`}
              >
                <FiTrash2 size={14} />
              </button>
            </div>
          )
        )}
      </div>
    </article>
  );
}
