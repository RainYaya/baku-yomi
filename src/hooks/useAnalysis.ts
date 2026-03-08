import { useCallback } from 'react';
import { usePracticeStore } from '../stores/practiceSlice';
import { useSettingsStore } from '../stores/settingsSlice';
import { analyzeTranslation } from '../lib/ai/client';

export function useAnalysis() {
  const { setAnalysis, setAnalyzing, analyzingPairId } = usePracticeStore();
  const aiProvider = useSettingsStore((s) => s.aiProvider);

  const analyze = useCallback(
    async (
      pairId: string,
      original: string,
      chinese: string,
      userTranslation: string
    ) => {
      if (!aiProvider.apiKey) {
        throw new Error('请先在设置中配置AI API Key');
      }
      if (!userTranslation.trim()) {
        throw new Error('请先输入你的日语回译');
      }

      setAnalyzing(pairId);
      try {
        const result = await analyzeTranslation(
          aiProvider,
          original,
          chinese,
          userTranslation,
          pairId
        );
        setAnalysis(pairId, result);
        return result;
      } catch (e) {
        setAnalyzing(null);
        throw e;
      }
    },
    [aiProvider, setAnalysis, setAnalyzing]
  );

  return { analyze, analyzingPairId };
}
