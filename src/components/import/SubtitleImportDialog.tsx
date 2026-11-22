import { useEffect, useRef, useState } from 'react';
import { FiFilm, FiUpload, FiX } from 'react-icons/fi';
import { useBookStore } from '../../stores/bookSlice';
import { useUIStore } from '../../stores/uiSlice';
import { registerKeyboardHandler } from '../../lib/keyboard';
import {
  buildSubtitleBook,
  parseSrt,
  parseVtt,
  type SubtitleFormat,
} from '../../lib/import/subtitle';

interface Props {
  open: boolean;
  onClose: () => void;
}

const MAX_BYTES = 4 * 1024 * 1024;

function formatOf(file: File): SubtitleFormat | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.vtt')) return 'vtt';
  if (name.endsWith('.srt')) return 'srt';
  return null;
}

function titleOf(file: File): string {
  return file.name.replace(/\.(srt|vtt)$/i, '').trim() || '字幕';
}

/** Pick one SRT/VTT file, preview its cue count, then save it as a book. */
export function SubtitleImportDialog({ open, onClose }: Props) {
  const addBook = useBookStore((s) => s.addBook);
  const setCurrentBook = useBookStore((s) => s.setCurrentBook);
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const setCurrentView = useUIStore((s) => s.setCurrentView);

  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<SubtitleFormat>('srt');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [cueCount, setCueCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setFormat('srt');
    setTitle('');
    setText('');
    setCueCount(0);
    setError(null);
    setReading(false);
    return registerKeyboardHandler('subtitle-import', 100, (event) => {
      if (event.key !== 'Escape') return false;
      onClose();
      return true;
    });
  }, [onClose, open]);

  if (!open) return null;

  const handleFile = async (chosen: File) => {
    const kind = formatOf(chosen);
    if (!kind) {
      setError('请选择 .srt 或 .vtt 字幕文件。');
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setError('字幕文件不能超过 4 MB。');
      return;
    }

    setError(null);
    setReading(true);
    try {
      const raw = await chosen.text();
      const isVtt = kind === 'vtt' || raw.replace(/^\uFEFF/, '').trimStart().startsWith('WEBVTT');
      const cues = isVtt ? parseVtt(raw) : parseSrt(raw);
      setFile(chosen);
      setFormat(isVtt ? 'vtt' : 'srt');
      setTitle(titleOf(chosen));
      setText(raw);
      setCueCount(cues.length);
      if (cues.length === 0) {
        setError('这个字幕里没有读到句子，检查一下文件内容。');
      }
    } catch {
      setError('读取失败，换一个文件试试。');
    } finally {
      setReading(false);
    }
  };

  const handleImport = () => {
    if (!file) {
      setError('先选择一个字幕文件。');
      return;
    }
    try {
      const book = buildSubtitleBook({ title, text, format });
      addBook(book);
      setCurrentBook(book.id);
      setCurrentChapter(0);
      setCurrentView('reader');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入失败，请检查字幕文件。');
    }
  };

  return (
    <div className="paste-overlay" onClick={onClose}>
      <section
        className="paste-dialog subtitle-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="subtitle-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="paste-head">
          <div>
            <span className="paste-kicker">SUBTITLE</span>
            <h2 id="subtitle-title">导入字幕</h2>
          </div>
          <button className="settings-close-btn" onClick={onClose} aria-label="关闭">
            <FiX size={18} />
          </button>
        </header>

        <div className="paste-body">
          <button
            className="subtitle-drop"
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            <FiUpload size={20} />
            <b>{reading ? '读取中…' : file ? file.name : '选择 .srt / .vtt 文件'}</b>
            <small>双语字幕会直接配对；只有日语时中文留空，可在阅读器里翻译。</small>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".srt,.vtt"
            hidden
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              event.target.value = '';
              if (chosen) void handleFile(chosen);
            }}
          />

          {file && (
            <>
              <div className="subtitle-meta">
                <span>{format.toUpperCase()}</span>
                <span>{cueCount} 条字幕</span>
              </div>
              <label className="paste-field">
                <span>材料标题</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
            </>
          )}

          {error && <p className="paste-error">{error}</p>}

          <div className="generate-actions">
            <button
              className="shelf-btn primary"
              onClick={handleImport}
              disabled={!file || reading || cueCount === 0}
            >
              <FiFilm size={13} /> 导入并阅读
            </button>
            {file && (
              <button
                className="quiet-link"
                onClick={() => inputRef.current?.click()}
              >
                换一个文件
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
