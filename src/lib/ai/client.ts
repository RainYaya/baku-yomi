import type { AIProviderConfig, AnalysisResult } from '../../types';
import { buildAnalysisPrompt, buildHintPrompt, buildBacktranslateHintPrompt } from './prompts';

export async function generateBacktranslateHints(
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

/**
 * 优化译文 - 将机翻译文改写成适合回译的版本
 */
export async function optimizeTranslationForBacktranslation(
  config: AIProviderConfig,
  original: string,
  chinese: string
): Promise<string> {
  const prompt = buildBacktranslateHintPrompt(original, chinese);

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
    throw new Error(`AI optimization failed: ${err}`);
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

  // Extract score. The keyless model sometimes translates the section heading
  // (総合評価 / 综合评分), so accept either and fall back to N/100.
  const scoreMatch =
    rawMarkdown.match(/【[^】]*(?:评分|評価)[^】]*】\s*(\d{1,3})/) ??
    rawMarkdown.match(/(\d{1,3})\s*\/\s*100/);
  const score = scoreMatch
    ? Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10)))
    : 0;

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
