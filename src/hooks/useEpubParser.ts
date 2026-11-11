import { useCallback, useRef } from 'react';
import { parseEpubFile } from '../lib/epub/parser';
import { useBookStore } from '../stores/bookSlice';
import type { Book } from '../types';
import { useMachine } from '../machines/react';
import { importMachine } from '../machines/import';

export function useEpubParser() {
  const { state, send } = useMachine(importMachine);
  const addBook = useBookStore((s) => s.addBook);
  const parsingRef = useRef(false);

  const parseFile = useCallback(
    async (file: File): Promise<Book | null> => {
      if (parsingRef.current) return null;
      parsingRef.current = true;
      send({ type: 'PARSE', fileName: file.name });

      try {
        const book = await parseEpubFile(file);
        if (book.chapters.length === 0) {
          send({
            type: 'FAIL',
            message: '未能从EPUB中提取到日中句对。请确认文件格式正确。',
          });
          return null;
        }
        addBook(book);
        send({ type: 'SUCCESS', bookId: book.id });
        return book;
      } catch (e) {
        send({
          type: 'FAIL',
          message: e instanceof Error ? e.message : 'EPUB解析失败',
        });
        return null;
      } finally {
        parsingRef.current = false;
      }
    },
    [addBook, send]
  );

  return {
    parseFile,
    parsing: state.status === 'parsing',
    error: state.status === 'error' ? state.message : null,
    status: state.status,
    fileName: 'fileName' in state ? state.fileName : null,
  };
}
