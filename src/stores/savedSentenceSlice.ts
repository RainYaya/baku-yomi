import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createDebouncedStorage } from '../lib/debouncedStorage';
import {
  addSavedSentence,
  isSentenceSaved,
  removeSavedSentence,
  toggleSavedSentence,
  type SavedSentence,
  type SavedSentenceInput,
} from '../lib/saved/sentences';

interface SavedSentenceState {
  sentences: SavedSentence[];
  /** Save the pair, refreshing its text when it is already kept. */
  save: (input: SavedSentenceInput) => void;
  /** Star button: save if missing, remove if kept. Returns whether it is kept. */
  toggle: (input: SavedSentenceInput) => boolean;
  remove: (id: string) => void;
  isSaved: (pairId: string) => boolean;
}

export const useSavedSentenceStore = create<SavedSentenceState>()(
  persist(
    (set, get) => ({
      sentences: [],

      save: (input) =>
        set((state) => ({
          sentences: addSavedSentence(state.sentences, input),
        })),

      toggle: (input) => {
        const willBeSaved = !isSentenceSaved(get().sentences, input.pairId);
        set((state) => ({
          sentences: toggleSavedSentence(state.sentences, input),
        }));
        return willBeSaved;
      },

      remove: (id) =>
        set((state) => ({
          sentences: removeSavedSentence(state.sentences, id),
        })),

      isSaved: (pairId) => isSentenceSaved(get().sentences, pairId),
    }),
    {
      name: 'saved-sentences',
      version: 1,
      storage: createJSONStorage(() => createDebouncedStorage()),
    }
  )
);
