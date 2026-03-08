import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AIProviderConfig } from '../types';

interface SettingsState {
  aiProvider: AIProviderConfig;
  blindMode: boolean;
  showFurigana: boolean;
  setAIProvider: (config: Partial<AIProviderConfig>) => void;
  setBlindMode: (enabled: boolean) => void;
  toggleBlindMode: () => void;
  toggleFurigana: () => void;
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

      setAIProvider: (config) =>
        set((state) => ({
          aiProvider: { ...state.aiProvider, ...config },
        })),

      setBlindMode: (enabled) => set({ blindMode: enabled }),

      toggleBlindMode: () =>
        set((state) => ({ blindMode: !state.blindMode })),

      toggleFurigana: () =>
        set((state) => ({ showFurigana: !state.showFurigana })),
    }),
    { name: 'settings-store' }
  )
);
