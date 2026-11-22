import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AnalysisResult, Book, ExplainAnswer, ExplainDepth } from '../types';
import { createDebouncedStorage } from '../lib/debouncedStorage';
import { migratePracticeData } from '../lib/pairMigration';
import {
  appendPracticeAttempt,
  attemptsFromLegacy,
  type PracticeAttempt,
} from '../lib/practice/journal';

/**
 * The practice store hydrates independently from the book store, so the
 * migration reads the persisted books directly instead of relying on which
 * store happens to finish first.
 */
function readPersistedBookState(): {
  books: Book[];
  currentBookId: string | null;
} {
  if (typeof window === 'undefined') return { books: [], currentBookId: null };
  try {
    const raw = window.localStorage.getItem('book-store');
    if (!raw) return { books: [], currentBookId: null };
    const parsed = JSON.parse(raw) as {
      state?: { books?: Book[]; currentBookId?: string | null };
    };
    return {
      books: parsed.state?.books ?? [],
      currentBookId: parsed.state?.currentBookId ?? null,
    };
  } catch {
    return { books: [], currentBookId: null };
  }
}

export interface SavedExplanation {
  answer: ExplainAnswer;
  fragment: string;
  depth: ExplainDepth;
}

interface PracticeState {
  translations: Record<string, string>;
  analyses: Record<string, AnalysisResult>;
  notes: Record<string, string>;
  hints: Record<string, string>;
  /** pairId:action -> last explanation, so reopening does not re-bill the model. */
  explanations: Record<string, SavedExplanation>;
  /** pairId -> submitted translations, newest last (max 10). */
  attempts: Record<string, PracticeAttempt[]>;

  setTranslation: (pairId: string, text: string) => void;
  setAnalysis: (pairId: string, result: AnalysisResult) => void;
  setNote: (pairId: string, text: string) => void;
  setHint: (pairId: string, text: string) => void;
  setExplanation: (key: string, saved: SavedExplanation) => void;
  getTranslation: (pairId: string) => string;
  getAnalysis: (pairId: string) => AnalysisResult | null;
  clearPracticeData: () => void;
}

export const usePracticeStore = create<PracticeState>()(
  persist(
    (set, get) => ({
      translations: {},
      analyses: {},
      notes: {},
      hints: {},
      explanations: {},
      attempts: {},

      setTranslation: (pairId, text) =>
        set((state) => ({
          translations: { ...state.translations, [pairId]: text },
        })),

      setAnalysis: (pairId, result) =>
        set((state) => {
          const attempt: PracticeAttempt = {
            translation:
              result.userTranslation || state.translations[pairId] || '',
            analysis: result,
            at: result.analyzedAt || Date.now(),
          };
          return {
            analyses: { ...state.analyses, [pairId]: result },
            attempts: {
              ...(state.attempts ?? {}),
              [pairId]: appendPracticeAttempt(
                state.attempts?.[pairId] ?? [],
                attempt
              ),
            },
          };
        }),

      setNote: (pairId, text) =>
        set((state) => ({
          notes: { ...state.notes, [pairId]: text },
        })),

      setHint: (pairId, text) =>
        set((state) => ({
          hints: { ...state.hints, [pairId]: text },
        })),

      setExplanation: (key, saved) =>
        set((state) => ({
          explanations: { ...(state.explanations ?? {}), [key]: saved },
        })),

      getTranslation: (pairId) => get().translations[pairId] ?? '',

      getAnalysis: (pairId) => get().analyses[pairId] ?? null,

      clearPracticeData: () =>
        set({
          translations: {},
          analyses: {},
          notes: {},
          hints: {},
          explanations: {},
          attempts: {},
        }),
    }),
    {
      name: 'practice-store',
      version: 2,
      // Typing in the composer updates this store on every keystroke.
      storage: createJSONStorage(() => createDebouncedStorage()),
      migrate: (persistedState: unknown, version: number) => {
        let saved = persistedState as Partial<PracticeState> | undefined;
        if (!saved) return saved as unknown as PracticeState;

        if (version < 1) {
          const { books, currentBookId } = readPersistedBookState();
          saved = migratePracticeData(saved as PracticeState, books, currentBookId);
        }

        if (version < 2) {
          saved = {
            ...saved,
            notes: saved.notes ?? {},
            hints: saved.hints ?? {},
            explanations: saved.explanations ?? {},
            attempts: attemptsFromLegacy(
              saved.analyses ?? {},
              saved.translations ?? {}
            ),
          };
        }

        return saved as PracticeState;
      },
    }
  )
);
