import { useEffect, useRef, useState } from 'react';
import { FiFileText, FiLink, FiX } from 'react-icons/fi';
import { buildTextBook } from '../../lib/import/textMaterial';
import { useBookStore } from '../../stores/bookSlice';
import { useUIStore } from '../../stores/uiSlice';
import { registerKeyboardHandler } from '../../lib/keyboard';

interface Props {
  open: boolean;
  onClose: () => void;
  /** When set, append the pasted text as a chapter instead of creating a book. */
  targetBookId?: string;
}

const MAX_TEXT_BYTES = 4 * 1024 * 1024;

/**
 * Paste-first material import.
 *
 * Anything that can be copied — a WeChat post, a web article, a PDF excerpt,
 * a TXT or Markdown file — becomes a book here. Building the book locally
 * means the translation step is the only part that needs AI, and importing
 * never depends on a site's markup or on a scraper.
 */
export function PasteTextDialog({ open, onClose, targetBookId }: Props) {
  const addBook = useBookStore((s) => s.addBook);
  const appendTextChapter = useBookStore((s) => s.appendTextChapter);
  const setCurrentBook = useBookStore((s) => s.setCurrentBook);
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [url, setUrl] = useState('');
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => titleRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return registerKeyboardHandler('paste-material', 100, (event) => {
      if (event.key !== 'Escape') return false;
      onClose();
      return true;
    });
  }, [open, onClose]);

  if (!open) return null;

  const reset = () => {
    setTitle('');
    setAuthor('');
    setText('');
    setError(null);
    setUrl('');
    setUrlError(null);
  };

  const handleFetchUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setUrlError(null);
    setFetchingUrl(true);
    try {
      const response = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await response.json().catch(() => null)) as
        | { title?: string; text?: string; error?: string }
        | null;
      if (!response.ok || !data?.text) {
        throw new Error(
          data?.error ?? '抓取失败。可以打开网页，手动复制正文再粘贴。'
        );
      }
      setText(data.text);
      if (!title.trim() && data.title) setTitle(data.title);
    } catch (e) {
      setUrlError(
        e instanceof Error
          ? `${e.message} 也可以手动复制正文，粘贴到下面的文本框。`
          : '抓取失败，请手动粘贴正文。'
      );
    } finally {
      setFetchingUrl(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_TEXT_BYTES) {
      setError('文件太大（上限 4MB）。请只粘贴要读的部分。');
      return;
    }
    setReadingFile(true);
    try {
      const content = await file.text();
      setText(content);
      if (!title.trim()) {
        setTitle(file.name.replace(/\.(txt|md|markdown)$/i, ''));
      }
    } catch {
      setError('读取文件失败，请确认它是 UTF-8 文本。');
    } finally {
      setReadingFile(false);
    }
  };

  const handleImport = () => {
    setError(null);
    if (!text.trim()) {
      setError('先粘贴正文，或选择一个 TXT / Markdown 文件。');
      return;
    }
    try {
      if (targetBookId) {
        const appended = appendTextChapter(targetBookId, { title, text });
        if (!appended) throw new Error('没有可导入的正文。');
        setCurrentBook(targetBookId);
        setCurrentChapter(appended.chapterIndex);
      } else {
        const book = buildTextBook({ title, author, text });
        addBook(book);
      }
      reset();
      onClose();
      setCurrentView('reader');
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入失败。');
    }
  };

  return (
    <div className="paste-overlay" onClick={onClose}>
      <section
        className="paste-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paste-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="paste-head">
          <div>
            <span className="paste-kicker">ADD MATERIAL</span>
            <h2 id="paste-title">
              {targetBookId ? '添加文章到合集' : '粘贴文章或导入文本'}
            </h2>
          </div>
          <button className="settings-close-btn" onClick={onClose} aria-label="关闭">
            <FiX size={18} />
          </button>
        </header>

        <div className="paste-body">
          <div className="paste-url-row">
            <label className="paste-field">
              <span>
                从网址抓取
                <small>只读取正文；抓不到时直接复制粘贴即可。</small>
              </span>
              <div className="paste-url-input">
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleFetchUrl();
                    }
                  }}
                  placeholder="https://…"
                  inputMode="url"
                />
                <button
                  className="shelf-btn"
                  onClick={() => void handleFetchUrl()}
                  disabled={fetchingUrl || !url.trim()}
                >
                  <FiLink size={13} /> {fetchingUrl ? '抓取中…' : '抓取正文'}
                </button>
              </div>
            </label>
            {urlError && <p className="paste-error">{urlError}</p>}
          </div>

          <div className="paste-row">
            <label className="paste-field">
              <span>{targetBookId ? '文章标题' : '标题'}</span>
              <input
                ref={titleRef}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="留空时使用第一行标题或「正文」"
              />
            </label>
            {!targetBookId && (
              <label className="paste-field paste-field-author">
                <span>作者（可选）</span>
                <input
                  value={author}
                  onChange={(event) => setAuthor(event.target.value)}
                  placeholder="未知作者"
                />
              </label>
            )}
          </div>

          <label className="paste-field">
            <span>
              正文
              <small>
                Markdown 的 # 标题会被拆成章节；空行分段；相邻的日文/中文会自动配对。
              </small>
            </span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={14}
              placeholder={'粘贴日文原文或日中对照文本…\n\n# 第一章\nここに本文。\n这里是译文。'}
            />
          </label>

          <div className="paste-file-row">
            <label className="paste-file-btn">
              <FiFileText size={13} />
              {readingFile ? '读取中…' : '从 TXT / Markdown 文件读取'}
              <input
                type="file"
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                onChange={(event) => {
                  void handleFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
                style={{ display: 'none' }}
              />
            </label>
            <span className="paste-file-meta">
              {text.trim() ? `${text.trim().length.toLocaleString()} 字` : '上限 4MB'}
            </span>
          </div>

          {error && <p className="paste-error">{error}</p>}
        </div>

        <footer className="paste-foot">
          <button className="quiet-link" onClick={onClose}>
            取消
          </button>
          <button className="stamp" onClick={handleImport} disabled={!text.trim()}>
            {targetBookId ? '加入合集' : '放进书架'}
          </button>
        </footer>
      </section>
    </div>
  );
}
