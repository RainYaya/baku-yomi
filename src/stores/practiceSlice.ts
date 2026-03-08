import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AnalysisResult } from '../types';

interface PracticeState {
  // Map of pairId -> user's translation text
  translations: Record<string, string>;
  // Map of pairId -> analysis result
  analyses: Record<string, AnalysisResult>;
  // Currently analyzing pair ID
  analyzingPairId: string | null;

  setTranslation: (pairId: string, text: string) => void;
  setAnalysis: (pairId: string, result: AnalysisResult) => void;
  setAnalyzing: (pairId: string | null) => void;
  getTranslation: (pairId: string) => string;
  getAnalysis: (pairId: string) => AnalysisResult | null;
  clearPracticeData: (bookId: string) => void;
}

export const usePracticeStore = create<PracticeState>()(
  persist(
    (set, get) => ({
      translations: {},
      analyses: {},
      analyzingPairId: null,

      setTranslation: (pairId, text) =>
        set((state) => ({
          translations: { ...state.translations, [pairId]: text },
        })),

      setAnalysis: (pairId, result) =>
        set((state) => ({
          analyses: { ...state.analyses, [pairId]: result },
          analyzingPairId: null,
        })),

      setAnalyzing: (pairId) =>
        set({ analyzingPairId: pairId }),

      getTranslation: (pairId) => get().translations[pairId] ?? '',

      getAnalysis: (pairId) => get().analyses[pairId] ?? null,

      clearPracticeData: (_bookId) =>
        set({ translations: {}, analyses: {} }),
    }),
    { name: 'practice-store' }
  )
);
