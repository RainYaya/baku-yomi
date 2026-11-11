import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Book, Chapter, Collection, SentencePair } from '../types';
import { createDebouncedStorage } from '../lib/debouncedStorage';
import { buildTextChapters } from '../lib/import/textMaterial';
import { createBookId } from '../lib/id';
import { migrateBookPairIds } from '../lib/pairMigration';
import { buildDemoLibrary } from '../lib/seed/demoLibrary';

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
  // 复盘页“再练一次”的跨组件命令，和 scrollToPairId 一样是瞬时的
  practicePairId: string | null;
  collections: Collection[];
  /** Set once on first run so deleting the samples never brings them back. */
  seededAt: number | null;

  addBook: (book: Book) => void;
  seedDemoLibrary: () => void;
  removeBook: (id: string) => void;
  renameBook: (id: string, title: string) => void;
  createCollectionBook: (title: string) => string;
  appendTextChapter: (
    bookId: string,
    input: { title?: string; text: string }
  ) => { chapterIndex: number } | null;
  removeChapterFromBook: (bookId: string, chapterIndex: number) => void;
  moveChapterInBook: (bookId: string, from: number, to: number) => void;
  createCollection: (title: string) => string;
  removeCollection: (id: string) => void;
  assignBookCollection: (bookId: string, collectionId: string | null) => void;
  setCurrentBook: (id: string) => void;
  setCurrentChapter: (index: number) => void;
  getLastChapterIndexForBook: (bookId: string) => number;
  getCurrentBook: () => Book | null;
  getCurrentChapter: () => Chapter | null;
  updatePairChinese: (pairId: string, chinese: string) => void;
  updatePairTranslations: (
    bookId: string,
    translations: Array<{ pairId: string; chinese: string }>
  ) => void;
  setPairTranslationReviewed: (pairId: string, reviewed: boolean) => void;
  setReadingProgress: (chapterId: string, pairIndex: number) => void;
  getReadingProgress: (chapterId: string) => number;
  setScrollToPairId: (pairId: string | null) => void;
  setPracticePairId: (pairId: string | null) => void;
}

function withPairUpdate(
  book: Book,
  pairId: string,
  update: (pair: SentencePair) => SentencePair
): Book {
  return {
    ...book,
    chapters: book.chapters.map((chapter) => ({
      ...chapter,
      pairs: chapter.pairs.map((pair) => (pair.id === pairId ? update(pair) : pair)),
    })),
  };
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
      practicePairId: null,
      collections: [],
      seededAt: null,

      addBook: (book) =>
        set((state) => ({
          books: [...state.books, book],
          currentBookId: book.id,
          currentChapterIndex: 0,
        })),

      /**
       * Runs after rehydration. A brand-new visitor gets a small readable
       * shelf; an existing library is left alone but marked as seeded so the
       * samples never appear later.
       */
      seedDemoLibrary: () => {
        const state = get();
        if (state.seededAt !== null) return;
        const demoBooks = state.books.length === 0 ? buildDemoLibrary() : [];
        set({
          books: [...state.books, ...demoBooks],
          seededAt: Date.now(),
        });
      },

      createCollection: (title) => {
        const trimmed = title.trim();
        if (!trimmed) return '';
        const id = `collection-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        set((state) => ({
          collections: [
            ...state.collections,
            { id, title: trimmed, createdAt: Date.now() },
          ],
        }));
        return id;
      },

      removeCollection: (id) =>
        set((state) => ({
          collections: state.collections.filter((collection) => collection.id !== id),
          books: state.books.map((book) =>
            book.collectionId === id ? { ...book, collectionId: undefined } : book
          ),
        })),

      assignBookCollection: (bookId, collectionId) =>
        set((state) => ({
          books: state.books.map((book) =>
            book.id === bookId
              ? { ...book, collectionId: collectionId ?? undefined }
              : book
          ),
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

      /**
       * A collection is a book whose chapters are manually added articles.
       * It has no subscription and no refresh; the user adds each piece.
       */
      createCollectionBook: (title) => {
        const trimmed = title.trim();
        if (!trimmed) return '';
        const id = createBookId();
        const book: Book = {
          id,
          title: trimmed,
          author: '合集',
          chapters: [],
          importedAt: Date.now(),
          source: { kind: 'collection' },
          chapterSeq: 0,
        };
        set((state) => ({
          books: [...state.books, book],
          currentBookId: id,
          currentChapterIndex: 0,
        }));
        return id;
      },

      appendTextChapter: (bookId, input) => {
        const book = get().books.find((item) => item.id === bookId);
        if (!book) return null;
        const startSeq =
          book.chapterSeq ??
          book.chapters.reduce(
            (max, chapter) => Math.max(max, chapter.index + 1),
            0
          );
        const { chapters, nextSeq } = buildTextChapters({
          bookId,
          text: input.text,
          startSeq,
          startIndex: book.chapters.length,
          fallbackTitle: input.title?.trim() || undefined,
        });
        if (chapters.length === 0) return null;

        set((state) => ({
          books: state.books.map((item) =>
            item.id === bookId
              ? {
                  ...item,
                  chapters: [...item.chapters, ...chapters],
                  chapterSeq: nextSeq,
                }
              : item
          ),
        }));
        return { chapterIndex: book.chapters.length };
      },

      removeChapterFromBook: (bookId, chapterIndex) =>
        set((state) => {
          const book = state.books.find((item) => item.id === bookId);
          if (!book) return {};
          const removed = book.chapters[chapterIndex];
          const chapters = book.chapters
            .filter((_, index) => index !== chapterIndex)
            .map((chapter, index) => ({ ...chapter, index }));

          const readingProgress = { ...state.readingProgress };
          if (removed) delete readingProgress[removed.id];

          let currentChapterIndex = state.currentChapterIndex;
          let lastChapterIndexByBook = state.lastChapterIndexByBook;
          if (state.currentBookId === bookId) {
            const currentId = book.chapters[state.currentChapterIndex]?.id;
            const kept = chapters.findIndex((chapter) => chapter.id === currentId);
            currentChapterIndex =
              kept >= 0 ? kept : Math.max(0, Math.min(chapterIndex, chapters.length - 1));
            lastChapterIndexByBook = {
              ...lastChapterIndexByBook,
              [bookId]: currentChapterIndex,
            };
          }

          return {
            books: state.books.map((item) =>
              item.id === bookId ? { ...item, chapters } : item
            ),
            readingProgress,
            currentChapterIndex,
            lastChapterIndexByBook,
          };
        }),

      moveChapterInBook: (bookId, from, to) =>
        set((state) => {
          const book = state.books.find((item) => item.id === bookId);
          if (!book) return {};
          if (to < 0 || to >= book.chapters.length || from === to) return {};

          const chapters = [...book.chapters];
          const [moved] = chapters.splice(from, 1);
          chapters.splice(to, 0, moved);
          const reindexed = chapters.map((chapter, index) => ({ ...chapter, index }));

          let currentChapterIndex = state.currentChapterIndex;
          let lastChapterIndexByBook = state.lastChapterIndexByBook;
          if (state.currentBookId === bookId) {
            const currentId = book.chapters[state.currentChapterIndex]?.id;
            const kept = reindexed.findIndex((chapter) => chapter.id === currentId);
            currentChapterIndex = kept >= 0 ? kept : to;
            lastChapterIndexByBook = {
              ...lastChapterIndexByBook,
              [bookId]: currentChapterIndex,
            };
          }

          return {
            books: state.books.map((item) =>
              item.id === bookId ? { ...item, chapters: reindexed } : item
            ),
            currentChapterIndex,
            lastChapterIndexByBook,
          };
        }),

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
        set((state) => {
          // Pair ids are globally unique after migration, but scoping the
          // write to the open book is a second guard against legacy data
          // that still contains colliding `ch0-p0` ids.
          if (!state.currentBookId) return {};
          return {
            books: state.books.map((book) =>
              book.id === state.currentBookId
                ? withPairUpdate(book, pairId, (pair) => ({
                    ...pair,
                    chinese,
                    translationSource: 'human',
                    translationReviewed: true,
                    translatedAt: Date.now(),
                  }))
                : book
            ),
          };
        }),

      updatePairTranslations: (bookId, translations) =>
        set((state) => {
          const byId = new Map(translations.map((item) => [item.pairId, item.chinese] as const));
          if (byId.size === 0) return {};
          const now = Date.now();
          return {
            books: state.books.map((book) =>
              book.id !== bookId
                ? book
                : {
                    ...book,
                    chapters: book.chapters.map((chapter) => ({
                      ...chapter,
                      pairs: chapter.pairs.map((pair) => {
                        const chinese = byId.get(pair.id);
                        if (chinese === undefined) return pair;
                        return {
                          ...pair,
                          chinese,
                          translationSource: 'ai',
                          translationReviewed: false,
                          translatedAt: now,
                        };
                      }),
                    })),
                  }
            ),
          };
        }),

      setPairTranslationReviewed: (pairId, reviewed) =>
        set((state) => {
          // Prefer the open book; fall back to a global search so the action
          // still works from a practice view that has no selection context.
          const preferred = state.currentBookId;
          const ordered = preferred
            ? [
                ...state.books.filter((book) => book.id === preferred),
                ...state.books.filter((book) => book.id !== preferred),
              ]
            : state.books;
          const target = ordered.find((book) =>
            book.chapters.some((chapter) => chapter.pairs.some((pair) => pair.id === pairId))
          );
          if (!target) return {};
          return {
            books: state.books.map((book) =>
              book.id === target.id
                ? withPairUpdate(book, pairId, (pair) => ({
                    ...pair,
                    translationReviewed: reviewed,
                  }))
                : book
            ),
          };
        }),

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

      setPracticePairId: (pairId) =>
        set({ practicePairId: pairId }),
    }),
    {
      name: 'book-store',
      version: 1,
      storage: createJSONStorage(() => createDebouncedStorage()),
      // `scrollToPairId` / `practicePairId` are transient cross-component
      // commands, not durable data. Persisting them would replay a stale
      // jump after reload.
      partialize: (state) => ({
        books: state.books,
        currentBookId: state.currentBookId,
        currentChapterIndex: state.currentChapterIndex,
        readingProgress: state.readingProgress,
        lastReadAt: state.lastReadAt,
        lastChapterIndexByBook: state.lastChapterIndexByBook,
        collections: state.collections,
        seededAt: state.seededAt,
      }),
      migrate: (persistedState: unknown, version: number) => {
        const saved = persistedState as Partial<BookState> | undefined;
        if (!saved || version >= 1) return saved as BookState;
        return {
          ...saved,
          books: (saved.books ?? []).map(migrateBookPairIds),
        } as BookState;
      },
      merge: (persisted, current) => {
        const saved = persisted as Partial<BookState> | undefined;
        return {
          ...current,
          ...saved,
          scrollToPairId: null,
          practicePairId: null,
        };
      },
      onRehydrateStorage: () => (state, error) => {
        if (!error) state?.seedDemoLibrary();
      },
    }
  )
);
