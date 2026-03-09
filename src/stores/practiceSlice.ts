import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AnalysisResult } from '../types';

interface PracticeState {
  translations: Record<string, string>;
  analyses: Record<string, AnalysisResult>;
  notes: Record<string, string>;
  analyzingPairId: string | null;

  setTranslation: (pairId: string, text: string) => void;
  setAnalysis: (pairId: string, result: AnalysisResult) => void;
  setAnalyzing: (pairId: string | null) => void;
  setNote: (pairId: string, text: string) => void;
  getTranslation: (pairId: string) => string;
  getAnalysis: (pairId: string) => AnalysisResult | null;
  clearPracticeData: (bookId: string) => void;
}

export const usePracticeStore = create<PracticeState>()(
  persist(
    (set, get) => ({
      translations: {},
      analyses: {},
      notes: {},
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

      setNote: (pairId, text) =>
        set((state) => ({
          notes: { ...state.notes, [pairId]: text },
        })),

      getTranslation: (pairId) => get().translations[pairId] ?? '',

      getAnalysis: (pairId) => get().analyses[pairId] ?? null,

      clearPracticeData: (_bookId) =>
        set({ translations: {}, analyses: {}, notes: {} }),
    }),
    { name: 'practice-store' }
  )
);
