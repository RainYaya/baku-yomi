import { useCallback, useState } from 'react';
import { useEpubParser } from '../../hooks/useEpubParser';
import { HiOutlineDocumentArrowUp } from 'react-icons/hi2';

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
    <div className="flex flex-col items-center justify-center h-full p-8">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        className={`w-full max-w-md border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer ${
          dragOver
            ? 'border-indigo-400 bg-indigo-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onClick={() => document.getElementById('epub-input')?.click()}
      >
        <HiOutlineDocumentArrowUp
          size={48}
          className="mx-auto text-gray-400 mb-4"
        />
        <p className="text-lg font-medium text-gray-600 mb-2">
          导入双语 EPUB
        </p>
        <p className="text-sm text-gray-400">
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
        <div className="mt-6 flex items-center gap-2 text-indigo-600">
          <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">正在解析EPUB文件...</span>
        </div>
      )}

      {error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm max-w-md">
          {error}
        </div>
      )}
    </div>
  );
}
