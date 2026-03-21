import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const BOOKMARK_COLORS = [
  { id: 'red', label: '红色', bg: 'rgba(220, 38, 38, 0.15)', border: 'rgba(220, 38, 38, 0.3)' },
  { id: 'orange', label: '橙色', bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.3)' },
  { id: 'yellow', label: '黄色', bg: 'rgba(234, 179, 8, 0.15)', border: 'rgba(234, 179, 8, 0.3)' },
  { id: 'green', label: '绿色', bg: 'rgba(22, 163, 74, 0.15)', border: 'rgba(22, 163, 74, 0.3)' },
  { id: 'blue', label: '蓝色', bg: 'rgba(37, 99, 235, 0.15)', border: 'rgba(37, 99, 235, 0.3)' },
  { id: 'purple', label: '紫色', bg: 'rgba(147, 51, 234, 0.15)', border: 'rgba(147, 51, 234, 0.3)' },
];

export interface Bookmark {
  pairId: string;
  chapterId: string;
  colorId: string;
  createdAt: number;
}

interface BookmarkState {
  bookmarks: Bookmark[];
  addBookmark: (pairId: string, chapterId: string, colorId: string) => void;
  removeBookmark: (pairId: string) => void;
  updateBookmarkColor: (pairId: string, colorId: string) => void;
  getBookmark: (pairId: string) => Bookmark | undefined;
  getBookmarksByChapter: (chapterId: string) => Bookmark[];
}

export const useBookmarkStore = create<BookmarkState>()(
  persist(
    (set, get) => ({
      bookmarks: [],

      addBookmark: (pairId, chapterId, colorId) =>
        set((state) => ({
          bookmarks: [
            ...state.bookmarks.filter(b => b.pairId !== pairId),
            { pairId, chapterId, colorId, createdAt: Date.now() },
          ],
        })),

      removeBookmark: (pairId) =>
        set((state) => ({
          bookmarks: state.bookmarks.filter(b => b.pairId !== pairId),
        })),

      updateBookmarkColor: (pairId, colorId) =>
        set((state) => ({
          bookmarks: state.bookmarks.map(b =>
            b.pairId === pairId ? { ...b, colorId } : b
          ),
        })),

      getBookmark: (pairId) => {
        return get().bookmarks.find(b => b.pairId === pairId);
      },

      getBookmarksByChapter: (chapterId) => {
        return get().bookmarks.filter(b => b.chapterId === chapterId);
      },
    }),
    { name: 'baku-yomi-bookmarks' }
  )
);
