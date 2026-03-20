import { useCallback, useState } from 'react';
import { useEpubParser } from '../../hooks/useEpubParser';
import { FiUpload } from 'react-icons/fi';

export function EpubUploader() {
  const { parseFile, parsing, error } = useEpubParser();
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (file.name.endsWith('.epub')) {
        parseFile(file);
      }
    },
    [parseFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div
      className="flex flex-col items-center justify-center h-full p-8"
      style={{ fontFamily: 'var(--font-ui)' }}
    >
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => document.getElementById('epub-input')?.click()}
        className="w-full max-w-md transition-all duration-200 cursor-pointer"
        style={{
          border: `2px dashed ${dragOver ? 'var(--accent-primary)' : 'var(--border-color)'}`,
          borderRadius: '8px',
          padding: '3rem 2rem',
          textAlign: 'center',
          backgroundColor: dragOver ? 'var(--accent-subtle)' : 'transparent',
        }}
      >
        <FiUpload
          size={40}
          className="mx-auto mb-4"
          style={{ color: 'var(--ink-muted)' }}
        />
        <p
          className="mb-2"
          style={{
            fontSize: '1.1rem',
            color: 'var(--ink-secondary)',
            fontWeight: 500,
          }}
        >
          导入双语 EPUB
        </p>
        <p
          className="text-sm"
          style={{ color: 'var(--ink-muted)' }}
        >
          拖拽文件到此处，或点击选择
        </p>
        <input
          id="epub-input"
          type="file"
          accept=".epub"
          onChange={handleInput}
          className="hidden"
        />
      </div>

      {parsing && (
        <div
          className="mt-8 flex items-center gap-3"
          style={{ color: 'var(--accent-primary)' }}
        >
          <div
            className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"
          />
          <span className="text-sm" style={{ fontFamily: 'var(--font-ui)' }}>
            正在解析 EPUB 文件...
          </span>
        </div>
      )}

      {error && (
        <div
          className="mt-6 px-5 py-4 rounded"
          style={{
            backgroundColor: 'rgba(184, 74, 74, 0.08)',
            border: '1px solid rgba(184, 74, 74, 0.2)',
            color: 'var(--error-color)',
            fontSize: '0.9rem',
            maxWidth: '400px',
          }}
        >
          {error}
        </div>
      )}

      {/* Decorative element */}
      <div className="mt-12 text-center">
        <p
          className="text-xs opacity-30"
          style={{
            fontFamily: 'var(--font-body)',
            letterSpacing: '0.2em',
          }}
        >
          双語回訳 — 日本語学習ツール
        </p>
      </div>
    </div>
  );
}
