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
    <div className="uploader-page">
      <div className="uploader-copy">
        <div className="uploader-kicker">IMPORT</div>
        <h2 className="uploader-title">把第一本双语 EPUB 放进书架。</h2>
        <p className="uploader-text">
          这是一个偏工具站、偏安静的阅读界面。导入之后，你会得到书架、章节目录、回译练习和朗读工作区。
        </p>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => document.getElementById('epub-input')?.click()}
        className="uploader-dropzone"
        style={{
          borderColor: dragOver ? 'var(--accent)' : 'var(--line)',
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
        <div className="uploader-status">
          <div
            className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"
          />
          <span className="text-sm" style={{ fontFamily: 'var(--font-ui)' }}>
            正在解析 EPUB 文件...
          </span>
        </div>
      )}

      {error && (
        <div className="uploader-error">
          {error}
        </div>
      )}

      <div className="uploader-footer">
        <p className="text-xs opacity-30" style={{ fontFamily: 'var(--font-body)', letterSpacing: '0.2em' }}>
          双語回訳 — 日本語学習ツール
        </p>
      </div>
    </div>
  );
}
