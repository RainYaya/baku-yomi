import type { AnalysisResult } from '../../types';

/** A score that also works for analyses stored before the score regex was widened. */
export function scoreOf(result: AnalysisResult): number {
  if (result.score > 0) return result.score;

  const match =
    result.rawMarkdown.match(/【[^】]*(?:评分|評価)[^】]*】\s*(\d{1,3})/) ??
    result.rawMarkdown.match(/(\d{1,3})\s*\/\s*100/);
  if (!match) return 0;

  const score = Number(match[1]);
  return Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0;
}
