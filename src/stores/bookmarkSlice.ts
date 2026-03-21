import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const BOOKMARK_COLORS = [
  { id: 'red', label: '红色', bg: 'rgba(220, 38, 38, 0.25)', border: 'rgba(220, 38, 38, 0.5)', textColor: 'rgb(220, 38, 38)' },
  { id: 'orange', label: '橙色', bg: 'rgba(249, 115, 22, 0.25)', border: 'rgba(249, 115, 22, 0.5)', textColor: 'rgb(249, 115, 22)' },
  { id: 'yellow', label: '黄色', bg: 'rgba(234, 179, 8, 0.25)', border: 'rgba(234, 179, 8, 0.5)', textColor: 'rgb(234, 179, 8)' },
  { id: 'green', label: '绿色', bg: 'rgba(22, 163, 74, 0.25)', border: 'rgba(22, 163, 74, 0.5)', textColor: 'rgb(22, 163, 74)' },
  { id: 'blue', label: '蓝色', bg: 'rgba(37, 99, 235, 0.25)', border: 'rgba(37, 99, 235, 0.5)', textColor: 'rgb(37, 99, 235)' },
  { id: 'purple', label: '紫色', bg: 'rgba(147, 51, 234, 0.25)', border: 'rgba(147, 51, 234, 0.5)', textColor: 'rgb(147, 51, 234)' },
];

export interface TextBookmark {
  id: string;
  pairId: string;
  chapterId: string;
  startOffset: number;
  endOffset: number;
  text: string;
  colorId: string;
  createdAt: number;
}

interface BookmarkState {
  bookmarks: TextBookmark[];
  scrollToBookmarkId: string | null;
  
  addBookmark: (bookmark: Omit<TextBookmark, 'id' | 'createdAt'>) => string;
  removeBookmark: (id: string) => void;
  updateBookmarkColor: (id: string, colorId: string) => void;
  getBookmarksByPair: (pairId: string) => TextBookmark[];
  getBookmarksByChapter: (chapterId: string) => TextBookmark[];
  getBookmarkById: (id: string) => TextBookmark | undefined;
  setScrollToBookmarkId: (id: string | null) => void;
}

export const useBookmarkStore = create<BookmarkState>()(
  persist(
    (set, get) => ({
      bookmarks: [],
      scrollToBookmarkId: null,

      addBookmark: (bookmark) => {
        const id = `bm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        set((state) => ({
          bookmarks: [...state.bookmarks, { ...bookmark, id, createdAt: Date.now() }],
        }));
        return id;
      },

      removeBookmark: (id) =>
        set((state) => ({
          bookmarks: state.bookmarks.filter(b => b.id !== id),
        })),

      updateBookmarkColor: (id, colorId) =>
        set((state) => ({
          bookmarks: state.bookmarks.map(b =>
            b.id === id ? { ...b, colorId } : b
          ),
        })),

      getBookmarksByPair: (pairId) => {
        return get().bookmarks.filter(b => b.pairId === pairId);
      },

      getBookmarksByChapter: (chapterId) => {
        return get().bookmarks.filter(b => b.chapterId === chapterId);
      },

      getBookmarkById: (id) => {
        return get().bookmarks.find(b => b.id === id);
      },

      setScrollToBookmarkId: (id) =>
        set({ scrollToBookmarkId: id }),
    }),
    { name: 'baku-yomi-bookmarks' }
  )
);
