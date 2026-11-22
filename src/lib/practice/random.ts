import type { AnalysisResult, Book, Chapter, SentencePair } from '../../types';
import { scoreOf } from '../analysis/score';
import { sourceGroup, type SourceGroup } from '../library/sources';

export const RANDOM_RECENT_LIMIT = 20;

export interface RandomFilters {
  sourceGroup?: SourceGroup | 'all';
  bookId?: string;
  onlyUnpracticed?: boolean;
  onlyWeak?: boolean;
}

export interface PracticePoolItem {
  pairId: string;
  pair: SentencePair;
  chapter: Chapter;
  book: Book;
  practiced: boolean;
  score: number | null;
}

/** Every readable sentence in every material, narrowed by the given filters. */
export function buildPracticePool(
  books: readonly Book[],
  filters: RandomFilters = {},
  analyses: Record<string, AnalysisResult> = {}
): PracticePoolItem[] {
  const pool: PracticePoolItem[] = [];

  for (const book of books) {
    if (
      filters.sourceGroup &&
      filters.sourceGroup !== 'all' &&
      sourceGroup(book) !== filters.sourceGroup
    ) {
      continue;
    }
    if (filters.bookId && book.id !== filters.bookId) continue;

    for (const chapter of book.chapters) {
      for (const pair of chapter.pairs) {
        if (!pair.japanese?.trim()) continue;

        const analysis = analyses[pair.id];
        if (filters.onlyUnpracticed && analysis) continue;
        if (filters.onlyWeak && (!analysis || scoreOf(analysis) >= 70)) continue;

        pool.push({
          pairId: pair.id,
          pair,
          chapter,
          book,
          practiced: Boolean(analysis),
          score: analysis ? scoreOf(analysis) : null,
        });
      }
    }
  }

  return pool;
}

/**
 * Pick one item, skipping the last 20 picks. With a tiny pool every sentence
 * may be recent; then the cycle restarts instead of returning nothing.
 */
export function pickRandom<T extends { pairId: string }>(
  pool: readonly T[],
  recent: readonly string[] = [],
  rng: () => number = Math.random
): T | null {
  if (pool.length === 0) return null;

  const recentIds = new Set(recent.slice(-RANDOM_RECENT_LIMIT));
  const candidates = pool.filter((item) => !recentIds.has(item.pairId));
  const source = candidates.length > 0 ? candidates : pool;

  const index = Math.min(
    source.length - 1,
    Math.max(0, Math.floor(rng() * source.length))
  );
  return source[index];
}
