import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AIProviderConfig } from '../types';

export type LayoutMode = 'alternating' | 'parallel';

interface SettingsState {
  aiProvider: AIProviderConfig;
  blindMode: boolean;
  showFurigana: boolean;
  keywordMode: boolean;
  layoutMode: LayoutMode;
  fontZoom: number;
  setAIProvider: (config: Partial<AIProviderConfig>) => void;
  setBlindMode: (enabled: boolean) => void;
  toggleBlindMode: () => void;
  toggleFurigana: () => void;
  toggleKeywordMode: () => void;
  setLayoutMode: (mode: LayoutMode) => void;
  changeFontZoom: (direction: 1 | -1) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      aiProvider: {
        type: 'openai',
        apiKey: '',
        model: 'gpt-4o',
      },
      blindMode: false,
      showFurigana: true,
      keywordMode: false,
      layoutMode: 'alternating' as LayoutMode,
      fontZoom: 1,

      setAIProvider: (config) =>
        set((state) => ({
          aiProvider: { ...state.aiProvider, ...config },
        })),

      setBlindMode: (enabled) => set({ blindMode: enabled }),

      toggleBlindMode: () =>
        set((state) => ({ blindMode: !state.blindMode })),

      toggleFurigana: () =>
        set((state) => ({ showFurigana: !state.showFurigana })),

      toggleKeywordMode: () =>
        set((state) => ({ keywordMode: !state.keywordMode })),

      setLayoutMode: (mode) => set({ layoutMode: mode }),

      changeFontZoom: (direction) =>
        set((state) => {
          const next = state.fontZoom + direction * 0.1;
          return { fontZoom: Math.max(0.8, Math.min(1.4, Math.round(next * 10) / 10)) };
        }),
    }),
    { name: 'settings-store' }
  )
);
