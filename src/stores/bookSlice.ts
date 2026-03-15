import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Book, Chapter } from '../types';

interface BookState {
  books: Book[];
  currentBookId: string | null;
  currentChapterIndex: number;
  // chapterId -> pairIndex (last visible pair)
  readingProgress: Record<string, number>;

  addBook: (book: Book) => void;
  removeBook: (id: string) => void;
  setCurrentBook: (id: string) => void;
  setCurrentChapter: (index: number) => void;
  getCurrentBook: () => Book | null;
  getCurrentChapter: () => Chapter | null;
  updatePairChinese: (pairId: string, chinese: string) => void;
  setReadingProgress: (chapterId: string, pairIndex: number) => void;
  getReadingProgress: (chapterId: string) => number;
}

export const useBookStore = create<BookState>()(
  persist(
    (set, get) => ({
      books: [],
      currentBookId: null,
      currentChapterIndex: 0,
      readingProgress: {},

      addBook: (book) =>
        set((state) => ({
          books: [...state.books, book],
          currentBookId: book.id,
          currentChapterIndex: 0,
        })),

      removeBook: (id) =>
        set((state) => ({
          books: state.books.filter((b) => b.id !== id),
          currentBookId:
            state.currentBookId === id ? null : state.currentBookId,
        })),

      setCurrentBook: (id) =>
        set({ currentBookId: id, currentChapterIndex: 0 }),

      setCurrentChapter: (index) =>
        set({ currentChapterIndex: index }),

      getCurrentBook: () => {
        const { books, currentBookId } = get();
        return books.find((b) => b.id === currentBookId) ?? null;
      },

      getCurrentChapter: () => {
        const book = get().getCurrentBook();
        if (!book) return null;
        return book.chapters[get().currentChapterIndex] ?? null;
      },

      updatePairChinese: (pairId, chinese) =>
        set((state) => ({
          books: state.books.map((book) => ({
            ...book,
            chapters: book.chapters.map((ch) => ({
              ...ch,
              pairs: ch.pairs.map((p) =>
                p.id === pairId ? { ...p, chinese } : p
              ),
            })),
          })),
        })),

      setReadingProgress: (chapterId, pairIndex) =>
        set((state) => ({
          readingProgress: {
            ...state.readingProgress,
            [chapterId]: pairIndex,
          },
        })),

      getReadingProgress: (chapterId) =>
        get().readingProgress[chapterId] ?? 0,
    }),
    { name: 'book-store' }
  )
);
