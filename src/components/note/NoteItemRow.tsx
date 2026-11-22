import { FiExternalLink, FiEyeOff } from 'react-icons/fi';
import { relativeNoteTime } from '../../lib/note/feed';
import type { NoteFeedItem } from '../../types/note';

interface Props {
  item: NoteFeedItem;
  sourceLabel: string;
  unread: boolean;
  opening: boolean;
  onOpen: () => void;
  onHide: () => void;
}

/** One clipped article: thumbnail, title, source line, two-line excerpt. */
export function NoteItemRow({
  item,
  sourceLabel,
  unread,
  opening,
  onOpen,
  onHide,
}: Props) {
  return (
    <article className="note-item" data-unread={unread ? 'true' : undefined}>
      {item.thumbnail && (
        <img
          className="note-item-thumb"
          src={item.thumbnail}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}

      <button
        type="button"
        className="note-item-main"
        onClick={onOpen}
        disabled={opening}
        aria-label={`打开《${item.title || '无标题'}》`}
      >
        <span className="note-item-title-row">
          {unread && <span className="note-unread-dot" aria-label="未读" />}
          <span className="note-item-title">{item.title || '（无标题）'}</span>
          <span className="note-item-time">{relativeNoteTime(item.publishedAt)}</span>
        </span>

        <span className="note-item-meta">
          {item.author || '未知作者'} · {sourceLabel}
        </span>

        {item.excerpt && <span className="note-item-excerpt">{item.excerpt}</span>}

        <span className="note-item-foot">
          <span className="note-item-open">
            {opening ? '正在读取正文…' : '打开'} <FiExternalLink size={11} />
          </span>
        </span>
      </button>

      <button
        type="button"
        className="note-item-hide"
        onClick={onHide}
        title="隐藏这篇"
        aria-label={`隐藏《${item.title || '无标题'}》`}
      >
        <FiEyeOff size={13} />
      </button>
    </article>
  );
}
