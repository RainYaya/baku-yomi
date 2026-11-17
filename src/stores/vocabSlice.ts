import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { VocabEntry, VocabStatus } from '../types';
import { createDebouncedStorage } from '../lib/debouncedStorage';

interface VocabState {
  entries: VocabEntry[];
  addEntry: (entry: VocabEntry) => void;
  updateEntry: (id: string, patch: Partial<VocabEntry>) => void;
  removeEntry: (id: string) => void;
  setStatus: (id: string, status: VocabStatus) => void;
  clearVocab: () => void;
}

export const useVocabStore = create<VocabState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (entry) =>
        set((state) => ({ entries: [entry, ...state.entries] })),
      updateEntry: (id, patch) =>
        set((state) => ({
          entries: state.entries.map((entry) =>
            entry.id === id
              ? { ...entry, ...patch, updatedAt: Date.now() }
              : entry
          ),
        })),
      removeEntry: (id) =>
        set((state) => ({
          entries: state.entries.filter((entry) => entry.id !== id),
        })),
      setStatus: (id, status) =>
        set((state) => ({
          entries: state.entries.map((entry) =>
            entry.id === id
              ? { ...entry, status, updatedAt: Date.now() }
              : entry
          ),
        })),
      clearVocab: () => set({ entries: [] }),
    }),
    {
      name: 'vocab-store',
      version: 1,
      storage: createJSONStorage(() => createDebouncedStorage()),
    }
  )
);
