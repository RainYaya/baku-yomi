import { useMemo, useState } from 'react';
import type { Book } from '../../types';
import { useBookStore } from '../../stores/bookSlice';
import { FiBook, FiPlay, FiEdit2, FiTrash2, FiLayers, FiFileText } from 'react-icons/fi';

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

function coverGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(145deg, hsl(${hue} 30% 25%), hsl(${(hue + 40) % 360} 35% 18%))`;
}

export function BookCard({ book, onOpen }: Props) {
  const readingProgress = useBookStore((s) => s.readingProgress);
  const removeBook = useBookStore((s) => s.removeBook);
  const renameBook = useBookStore((s) => s.renameBook);

  const [editing, setEditing] = useState(false);
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
    if (window.confirm(`确定删除《${book.title}》吗？`)) {
      removeBook(book.id);
    }
  };

  return (
    <article className="bookshelf-card">
      {/* Cover */}
      <div
        className="bookshelf-cover"
        style={{ background: book.coverUrl ? undefined : coverGradient(book.title) }}
        onClick={onOpen}
      >
        {book.coverUrl ? (
          <img src={book.coverUrl} alt={book.title} className="bookshelf-cover-img" />
        ) : (
          <div className="bookshelf-cover-fallback">
            <FiBook size={28} style={{ opacity: 0.5 }} />
            <span className="bookshelf-cover-title">{book.title}</span>
          </div>
        )}
        {/* Progress overlay on cover */}
        {progressPct > 0 && (
          <div className="bookshelf-cover-progress">
            <div className="bookshelf-cover-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>

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
            <p className="bookshelf-subtitle">{book.author || '未知作者'}</p>

            {/* Stats row */}
            <div className="bookshelf-stats">
              <span className="bookshelf-stat">
                <FiLayers size={12} />
                {book.chapters.length} 章
              </span>
              <span className="bookshelf-stat">
                <FiFileText size={12} />
                {totalPairs} 句对
              </span>
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
          <div className="bookshelf-actions">
            <button className="bookshelf-btn-primary" onClick={onOpen}>
              <FiPlay size={13} />
              {progressPct > 0 ? '继续阅读' : '开始阅读'}
            </button>
            <button
              className="bookshelf-btn-icon"
              onClick={() => setEditing(true)}
              title="重命名"
            >
              <FiEdit2 size={14} />
            </button>
            <button
              className="bookshelf-btn-icon bookshelf-btn-danger"
              onClick={handleDelete}
              title="删除"
            >
              <FiTrash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
