import { useCallback } from 'react';
import { usePracticeStore } from '../stores/practiceSlice';
import { useSettingsStore } from '../stores/settingsSlice';
import { analyzeTranslation } from '../lib/ai/client';
import { isKeylessProvider } from '../types';

export function useAnalysis() {
  const setAnalysis = usePracticeStore((s) => s.setAnalysis);
  const aiProvider = useSettingsStore((s) => s.getActiveAIProvider());

  const analyze = useCallback(
    async (
      pairId: string,
      original: string,
      chinese: string,
      userTranslation: string
    ) => {
      // Keyless providers (B站免费) legitimately have no key; only demand one
      // from providers that need it.
      if (!aiProvider.apiKey && !isKeylessProvider(aiProvider.type)) {
        throw new Error('请先在设置中配置AI API Key');
      }
      if (!userTranslation.trim()) {
        throw new Error('请先输入你的日语回译');
      }

      const result = await analyzeTranslation(
        aiProvider,
        original,
        chinese,
        userTranslation,
        pairId
      );
      setAnalysis(pairId, result);
      return result;
    },
    [aiProvider, setAnalysis]
  );

  return { analyze };
}
