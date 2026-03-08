import { useState, useCallback } from 'react';
import { parseEpubFile } from '../lib/epub/parser';
import { useBookStore } from '../stores/bookSlice';
import type { Book } from '../types';

export function useEpubParser() {
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addBook = useBookStore((s) => s.addBook);

  const parseFile = useCallback(
    async (file: File): Promise<Book | null> => {
      setParsing(true);
      setError(null);
      try {
        const book = await parseEpubFile(file);
        if (book.chapters.length === 0) {
          setError('未能从EPUB中提取到日中句对。请确认文件格式正确。');
          return null;
        }
        addBook(book);
        return book;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'EPUB解析失败';
        setError(msg);
        return null;
      } finally {
        setParsing(false);
      }
    },
    [addBook]
  );

  return { parseFile, parsing, error };
}
