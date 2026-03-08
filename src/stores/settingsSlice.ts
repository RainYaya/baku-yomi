import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AIProviderConfig } from '../types';

interface SettingsState {
  aiProvider: AIProviderConfig;
  blindMode: boolean;
  setAIProvider: (config: Partial<AIProviderConfig>) => void;
  setBlindMode: (enabled: boolean) => void;
  toggleBlindMode: () => void;
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

      setAIProvider: (config) =>
        set((state) => ({
          aiProvider: { ...state.aiProvider, ...config },
        })),

      setBlindMode: (enabled) => set({ blindMode: enabled }),

      toggleBlindMode: () =>
        set((state) => ({ blindMode: !state.blindMode })),
    }),
    { name: 'settings-store' }
  )
);
