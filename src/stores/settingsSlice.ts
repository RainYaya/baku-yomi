import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AIProviderConfig } from '../types';

interface SettingsState {
  aiProvider: AIProviderConfig;
  blindMode: boolean;
  showFurigana: boolean;
  keywordMode: boolean;
  setAIProvider: (config: Partial<AIProviderConfig>) => void;
  setBlindMode: (enabled: boolean) => void;
  toggleBlindMode: () => void;
  toggleFurigana: () => void;
  toggleKeywordMode: () => void;
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
    }),
    { name: 'settings-store' }
  )
);
