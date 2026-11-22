import { useEffect, useState } from 'react';
import { FiPlus, FiRefreshCw, FiTrash2, FiX } from 'react-icons/fi';
import { DEFAULT_NOTE_SOURCES, useNoteStore } from '../../stores/noteSlice';
import type { NoteFeedSource } from '../../types/note';

interface Props {
  open: boolean;
  onClose: () => void;
}

function parseSourceInput(raw: string): NoteFeedSource | null {
  const value = raw.trim();
  if (!value) return null;

  if (value.startsWith('#')) {
    const key = value.slice(1).trim();
    return key ? { kind: 'hashtag', key } : null;
  }

  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`
    );
    const host = url.hostname.toLowerCase();
    if (host === 'note.com' || host === 'www.note.com') {
      const parts = url.pathname
        .split('/')
        .filter(Boolean)
        .map((part) => decodeURIComponent(part));
      if (parts[0] === 'hashtag' && parts[1]) {
        return { kind: 'hashtag', key: parts[1] };
      }
      if (parts.length === 1) {
        return { kind: 'author', key: parts[0] };
      }
      return null;
    }
  } catch {
    // Not a URL; fall through to a bare hashtag.
  }

  return /^[^\s/?#]+$/.test(value) ? { kind: 'hashtag', key: value } : null;
}

export function NoteSourceDialog({ open, onClose }: Props) {
  const sources = useNoteStore((s) => s.sources);
  const hiddenUrls = useNoteStore((s) => s.hiddenUrls);
  const blockedKeywords = useNoteStore((s) => s.blockedKeywords);
  const addSource = useNoteStore((s) => s.addSource);
  const removeSource = useNoteStore((s) => s.removeSource);
  const toggleSource = useNoteStore((s) => s.toggleSource);
  const unhideItem = useNoteStore((s) => s.unhideItem);
  const clearHidden = useNoteStore((s) => s.clearHidden);
  const setBlockedKeywords = useNoteStore((s) => s.setBlockedKeywords);

  const [addInput, setAddInput] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [keywords, setKeywords] = useState(blockedKeywords.join('\n'));

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const add = (source: NoteFeedSource) => {
    const id = addSource(source);
    if (!id) {
      setNotice('最多同时启用 8 个来源，且总数不超过 20 个。请先停用或移除一个。');
      return;
    }
    setNotice(null);
    setAddInput('');
  };

  const handleAdd = () => {
    const parsed = parseSourceInput(addInput);
    if (!parsed) {
      setNotice('没认出这个输入。可以填 #话题、note.com/hashtag/话题，或 note.com/作者名。');
      return;
    }
    add(parsed);
  };

  return (
    <div className="paste-overlay" onClick={onClose}>
      <section
        className="paste-dialog note-source-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-source-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="paste-head">
          <div>
            <span className="paste-kicker">NOTE · SOURCES</span>
            <h2 id="note-source-title">管理 note 来源</h2>
          </div>
          <button className="settings-close-btn" onClick={onClose} aria-label="关闭">
            <FiX size={18} />
          </button>
        </header>

        <div className="paste-body note-source-body">
          <section className="note-source-section">
            <h3>当前来源</h3>
            {sources.length === 0 ? (
              <p className="note-source-hint">还没有来源，先在下面添加一个话题。</p>
            ) : (
              <ul className="note-source-list">
                {sources.map((source) => (
                  <li
                    key={source.id}
                    className="note-source-row"
                    data-enabled={source.enabled ? 'true' : undefined}
                  >
                    <button
                      type="button"
                      className="note-source-toggle"
                      aria-pressed={source.enabled}
                      onClick={() => {
                        if (!toggleSource(source.id)) {
                          setNotice('最多同时启用 8 个来源。请先停用一个。');
                        }
                      }}
                    >
                      {source.enabled ? '已启用' : '已停用'}
                    </button>
                    <span className="note-source-name">{source.label}</span>
                    <span className="note-source-kind">
                      {source.kind === 'hashtag' ? '话题' : '作者'}
                    </span>
                    <button
                      type="button"
                      className="note-source-remove"
                      onClick={() => removeSource(source.id)}
                      aria-label={`移除 ${source.label}`}
                    >
                      <FiTrash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="note-source-section">
            <h3>添加来源</h3>
            <div className="note-source-add">
              <input
                value={addInput}
                onChange={(event) => setAddInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder="#エッセイ、note.com/hashtag/読書、note.com/seoyun"
                aria-label="note 来源"
              />
              <button className="shelf-btn" onClick={handleAdd} disabled={!addInput.trim()}>
                <FiPlus size={13} /> 添加
              </button>
            </div>
            <div className="note-recommend-chips">
              {DEFAULT_NOTE_SOURCES.map((source) => (
                <button
                  key={source.key}
                  type="button"
                  className="note-recommend-chip"
                  onClick={() => add(source)}
                >
                  #{source.key}
                </button>
              ))}
            </div>
            <p className="note-source-hint">
              只读取公开文章；付费、关注者限定或需要登录的页面不会自动保存。
            </p>
          </section>

          <section className="note-source-section">
            <h3>不想看的词</h3>
            <textarea
              value={keywords}
              onChange={(event) => setKeywords(event.target.value)}
              rows={6}
              aria-label="屏蔽关键词，一行一个"
            />
            <div className="note-source-actions">
              <span className="note-source-hint">匹配标题和摘要，一行一个。</span>
              <button
                className="shelf-btn"
                onClick={() => {
                  setBlockedKeywords(keywords.split('\n'));
                  setNotice('屏蔽词已保存。');
                }}
              >
                保存屏蔽词
              </button>
            </div>
          </section>

          <section className="note-source-section">
            <div className="note-source-section-head">
              <h3>已隐藏的文章</h3>
              {hiddenUrls.length > 0 && (
                <button className="quiet-link" onClick={clearHidden}>
                  <FiRefreshCw size={11} /> 全部恢复
                </button>
              )}
            </div>
            {hiddenUrls.length === 0 ? (
              <p className="note-source-hint">没有隐藏的文章。</p>
            ) : (
              <ul className="note-hidden-list">
                {hiddenUrls.map((url) => (
                  <li key={url}>
                    <span title={url}>{url.replace(/^https:\/\/note\.com/, '')}</span>
                    <button className="quiet-link" onClick={() => unhideItem(url)}>
                      恢复
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {notice && <p className="paste-error">{notice}</p>}
        </div>

        <footer className="paste-foot">
          <span className="note-source-hint">
            {sources.filter((source) => source.enabled).length} / 8 启用 ·{' '}
            {sources.length} / 20 总数
          </span>
          <button className="stamp" onClick={onClose}>
            完成
          </button>
        </footer>
      </section>
    </div>
  );
}
