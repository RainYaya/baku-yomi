import type { AIProviderConfig, AnalysisResult } from '../../types';
import { buildAnalysisPrompt, buildHintPrompt } from './prompts';

export async function generateHints(
  config: AIProviderConfig,
  original: string,
  chinese: string
): Promise<string> {
  const prompt = buildHintPrompt(original, chinese);

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: config.type,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      prompt,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI hint generation failed: ${err}`);
  }

  const data = await response.json();
  return data.text;
}

export async function analyzeTranslation(
  config: AIProviderConfig,
  original: string,
  chinese: string,
  userTranslation: string,
  pairId: string
): Promise<AnalysisResult> {
  const prompt = buildAnalysisPrompt(original, chinese, userTranslation);

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: config.type,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      prompt,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI analysis failed: ${err}`);
  }

  const data = await response.json();
  const rawMarkdown: string = data.text;

  // Extract score
  const scoreMatch = rawMarkdown.match(/【総合評価】\s*(\d+)/);
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

  return {
    pairId,
    userTranslation,
    originalJapanese: original,
    score,
    errors: [],
    strengths: [],
    suggestions: [],
    rawMarkdown,
    analyzedAt: Date.now(),
  };
}
