import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AIProviderConfig, AIProviderType } from '../types';

export type LayoutMode = 'alternating' | 'parallel';
export type TTSProviderType = 'microsoft' | 'voicevox';

export interface AIProviderProfile extends AIProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
}

interface SettingsState {
  aiProviders: AIProviderProfile[];
  activeAIProviderId: string;
  ttsProvider: TTSProviderType;
  blindMode: boolean;
  showFurigana: boolean;
  keywordMode: boolean;
  layoutMode: LayoutMode;
  fontZoom: number;
  voicevoxSpeakerId: number;
  voicevoxSpeed: number;
  voicevoxPitch: number;
  voicevoxVolume: number;
  voicevoxPrefetchWindow: number;
  voicevoxCacheLimitMB: number;
  getActiveAIProvider: () => AIProviderConfig;
  setTtsProvider: (provider: TTSProviderType) => void;
  addAIProvider: (type?: AIProviderType) => void;
  removeAIProvider: (id: string) => void;
  setActiveAIProviderId: (id: string) => void;
  updateAIProvider: (id: string, config: Partial<AIProviderProfile>) => void;
  setBlindMode: (enabled: boolean) => void;
  toggleBlindMode: () => void;
  toggleFurigana: () => void;
  toggleKeywordMode: () => void;
  setLayoutMode: (mode: LayoutMode) => void;
  changeFontZoom: (direction: 1 | -1) => void;
  setVoicevoxSpeakerId: (speakerId: number) => void;
  setVoicevoxSpeed: (speed: number) => void;
  setVoicevoxPitch: (pitch: number) => void;
  setVoicevoxVolume: (volume: number) => void;
  setVoicevoxPrefetchWindow: (window: number) => void;
  setVoicevoxCacheLimitMB: (mb: number) => void;
}

const makeProvider = (id: string, type: AIProviderType = 'openai'): AIProviderProfile => ({
  id,
  name: `供应商 ${id.slice(-4)}`,
  type,
  apiKey: '',
  model: type === 'anthropic' ? 'claude-sonnet-4-20250514' : type === 'google' ? 'gemini-2.0-flash' : 'gpt-4o',
  enabled: true,
});

const DEFAULT_PROVIDER_ID = 'provider-default';
const FALLBACK_AI_PROVIDER: AIProviderConfig = {
  type: 'openai',
  apiKey: '',
  model: 'gpt-4o',
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      aiProviders: [
        {
          id: DEFAULT_PROVIDER_ID,
          name: '默认供应商',
          type: 'openai',
          apiKey: '',
          model: 'gpt-4o',
          enabled: true,
        },
      ],
      activeAIProviderId: DEFAULT_PROVIDER_ID,
      ttsProvider: 'voicevox' as TTSProviderType,
      blindMode: false,
      showFurigana: true,
      keywordMode: false,
      layoutMode: 'alternating' as LayoutMode,
      fontZoom: 1,
      voicevoxSpeakerId: 1,
      voicevoxSpeed: 1,
      voicevoxPitch: 0,
      voicevoxVolume: 1,
      voicevoxPrefetchWindow: 4,
      voicevoxCacheLimitMB: 80,

      getActiveAIProvider: () => {
        const state = get();
        const active =
          state.aiProviders.find((p) => p.id === state.activeAIProviderId && p.enabled) ??
          state.aiProviders.find((p) => p.enabled) ??
          state.aiProviders[0];

        return active ?? FALLBACK_AI_PROVIDER;
      },

      addAIProvider: (type = 'openai') =>
        set((state) => {
          const id = `provider-${Date.now()}`;
          const next = makeProvider(id, type);
          return {
            aiProviders: [...state.aiProviders, next],
            activeAIProviderId: id,
          };
        }),

      removeAIProvider: (id) =>
        set((state) => {
          const remaining = state.aiProviders.filter((p) => p.id !== id);
          if (remaining.length === 0) {
            const fallback = makeProvider(DEFAULT_PROVIDER_ID, 'openai');
            return { aiProviders: [fallback], activeAIProviderId: fallback.id };
          }

          const nextActive =
            state.activeAIProviderId === id ? remaining[0].id : state.activeAIProviderId;

          return {
            aiProviders: remaining,
            activeAIProviderId: nextActive,
          };
        }),

      setActiveAIProviderId: (id) => set({ activeAIProviderId: id }),

      setTtsProvider: (provider) => set({ ttsProvider: provider }),

      updateAIProvider: (id, config) =>
        set((state) => ({
          aiProviders: state.aiProviders.map((p) => (p.id === id ? { ...p, ...config } : p)),
        })),

      setBlindMode: (enabled) => set({ blindMode: enabled }),

      toggleBlindMode: () => set((state) => ({ blindMode: !state.blindMode })),

      toggleFurigana: () => set((state) => ({ showFurigana: !state.showFurigana })),

      toggleKeywordMode: () => set((state) => ({ keywordMode: !state.keywordMode })),

      setLayoutMode: (mode) => set({ layoutMode: mode }),

      changeFontZoom: (direction) =>
        set((state) => {
          const next = state.fontZoom + direction * 0.1;
          return { fontZoom: Math.max(0.8, Math.min(1.4, Math.round(next * 10) / 10)) };
        }),

      setVoicevoxSpeakerId: (speakerId) => set({ voicevoxSpeakerId: speakerId }),
      setVoicevoxSpeed: (speed) => set({ voicevoxSpeed: Math.max(0.5, Math.min(2, speed)) }),
      setVoicevoxPitch: (pitch) => set({ voicevoxPitch: Math.max(-0.15, Math.min(0.15, pitch)) }),
      setVoicevoxVolume: (volume) => set({ voicevoxVolume: Math.max(0.2, Math.min(2, volume)) }),
      setVoicevoxPrefetchWindow: (window) =>
        set({ voicevoxPrefetchWindow: Math.max(1, Math.min(10, Math.round(window))) }),
      setVoicevoxCacheLimitMB: (mb) =>
        set({ voicevoxCacheLimitMB: Math.max(16, Math.min(512, Math.round(mb))) }),
    }),
    {
      name: 'settings-store',
      version: 2,
      migrate: (persistedState: unknown) => {
        const state = persistedState as {
          aiProvider?: AIProviderConfig;
          aiProviders?: AIProviderProfile[];
          activeAIProviderId?: string;
          [k: string]: unknown;
        };

        if (state.aiProviders && state.aiProviders.length > 0) {
          return state;
        }

        const legacy = state.aiProvider;
        const migratedProvider: AIProviderProfile = {
          id: DEFAULT_PROVIDER_ID,
          name: '默认供应商',
          type: legacy?.type ?? 'openai',
          apiKey: legacy?.apiKey ?? '',
          model: legacy?.model ?? 'gpt-4o',
          baseUrl: legacy?.baseUrl,
          enabled: true,
        };

        return {
          ...state,
          aiProviders: [migratedProvider],
          activeAIProviderId: state.activeAIProviderId ?? DEFAULT_PROVIDER_ID,
        };
      },
    }
  )
);
