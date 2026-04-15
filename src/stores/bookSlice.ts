import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Book, Chapter } from '../types';

interface BookState {
  books: Book[];
  currentBookId: string | null;
  currentChapterIndex: number;
  // chapterId -> pairIndex (last visible pair)
  readingProgress: Record<string, number>;
  // chapterId -> timestamp
  lastReadAt: Record<string, number>;
  // bookId -> last chapter index
  lastChapterIndexByBook: Record<string, number>;
  // 用于书签跳转
  scrollToPairId: string | null;

  addBook: (book: Book) => void;
  removeBook: (id: string) => void;
  renameBook: (id: string, title: string) => void;
  setCurrentBook: (id: string) => void;
  setCurrentChapter: (index: number) => void;
  getLastChapterIndexForBook: (bookId: string) => number;
  getCurrentBook: () => Book | null;
  getCurrentChapter: () => Chapter | null;
  updatePairChinese: (pairId: string, chinese: string) => void;
  setReadingProgress: (chapterId: string, pairIndex: number) => void;
  getReadingProgress: (chapterId: string) => number;
  setScrollToPairId: (pairId: string | null) => void;
}

export const useBookStore = create<BookState>()(
  persist(
    (set, get) => ({
      books: [],
      currentBookId: null,
      currentChapterIndex: 0,
      readingProgress: {},
      lastReadAt: {},
      lastChapterIndexByBook: {},
      scrollToPairId: null,

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

      renameBook: (id, title) =>
        set((state) => ({
          books: state.books.map((b) => (b.id === id ? { ...b, title: title.trim() || b.title } : b)),
        })),

      setCurrentBook: (id) =>
        set((state) => ({
          currentBookId: id,
          currentChapterIndex: Math.max(0, state.lastChapterIndexByBook[id] ?? 0),
        })),

      setCurrentChapter: (index) =>
        set((state) => {
          const currentBook = state.books.find((b) => b.id === state.currentBookId);
          if (!currentBook) {
            return { currentChapterIndex: index };
          }
          return {
            currentChapterIndex: index,
            lastChapterIndexByBook: {
              ...state.lastChapterIndexByBook,
              [currentBook.id]: index,
            },
          };
        }),

      getLastChapterIndexForBook: (bookId) =>
        Math.max(0, get().lastChapterIndexByBook[bookId] ?? 0),

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
          lastReadAt: {
            ...state.lastReadAt,
            [chapterId]: Date.now(),
          },
        })),

      getReadingProgress: (chapterId) =>
        get().readingProgress[chapterId] ?? 0,

      setScrollToPairId: (pairId) =>
        set({ scrollToPairId: pairId }),
    }),
    { name: 'book-store' }
  )
);
