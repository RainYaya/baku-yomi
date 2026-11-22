import type { AnalysisResult, Book, Chapter, ErrorCategory, SentencePair } from '../../types';
import { scoreOf } from '../analysis/score';
import { errorCategoriesOf } from '../analysis/errorCategories';
import { sourceGroup, type SourceGroup } from '../library/sources';

export const MAX_ATTEMPTS_PER_SENTENCE = 10;

export interface PracticeAttempt {
  translation: string;
  analysis: AnalysisResult;
  at: number;
}

export type ScoreBand = 'all' | 'weak' | 'mid' | 'good';
export type JournalSort = 'recent' | 'score';

export interface JournalEntry {
  pairId: string;
  pair: SentencePair;
  chapter: Chapter;
  book: Book;
  analysis: AnalysisResult;
  translation: string;
  score: number;
  /** Oldest first. */
  attempts: PracticeAttempt[];
  attemptCount: number;
  latestAt: number;
}

export interface JournalFilters {
  bookId?: string;
  source?: SourceGroup | 'all';
  band?: ScoreBand;
  error?: ErrorCategory | 'all';
  query?: string;
  since?: number;
  until?: number;
  sortBy?: JournalSort;
}

export interface JournalSummary {
  totalAttempts: number;
  uniqueSentences: number;
  materials: number;
  weak: number;
  thisWeek: number;
}

/** Keep a per-sentence history bounded; the latest analysis stays in `analyses`. */
export function appendPracticeAttempt(
  attempts: readonly PracticeAttempt[],
  attempt: PracticeAttempt
): PracticeAttempt[] {
  return [...attempts, attempt].slice(-MAX_ATTEMPTS_PER_SENTENCE);
}

/** v1 stores only the latest analysis; seed one attempt per analyzed sentence. */
export function attemptsFromLegacy(
  analyses: Record<string, AnalysisResult>,
  translations: Record<string, string>
): Record<string, PracticeAttempt[]> {
  const attempts: Record<string, PracticeAttempt[]> = {};

  for (const [pairId, analysis] of Object.entries(analyses)) {
    attempts[pairId] = [
      {
        translation:
          analysis.userTranslation || translations[pairId] || '',
        analysis,
        at: analysis.analyzedAt ?? 0,
      },
    ];
  }

  return attempts;
}

/**
 * One entry per practiced sentence across every material, note included.
 * `analyses` is the latest result; `attempts` is the history.
 */
export function buildJournalEntries(
  books: readonly Book[],
  analyses: Record<string, AnalysisResult>,
  translations: Record<string, string>,
  attempts: Record<string, PracticeAttempt[]>
): JournalEntry[] {
  const entries: JournalEntry[] = [];

  for (const book of books) {
    for (const chapter of book.chapters) {
      for (const pair of chapter.pairs) {
        const latestAnalysis = analyses[pair.id];
        const history = attempts[pair.id] ?? [];
        const analysis = latestAnalysis ?? history.at(-1)?.analysis;
        if (!analysis) continue;

        const ordered = [...history]
          .sort((a, b) => a.at - b.at)
          .slice(-MAX_ATTEMPTS_PER_SENTENCE);
        const synthetic =
          ordered.length === 0
            ? [
                {
                  translation:
                    analysis.userTranslation || translations[pair.id] || '',
                  analysis,
                  at: analysis.analyzedAt ?? 0,
                },
              ]
            : ordered;
        const latestAttempt = synthetic.at(-1);

        entries.push({
          pairId: pair.id,
          pair,
          chapter,
          book,
          analysis,
          translation:
            translations[pair.id] ?? latestAttempt?.translation ?? '',
          score: scoreOf(analysis),
          attempts: synthetic,
          attemptCount: synthetic.length,
          latestAt: Math.max(
            analysis.analyzedAt ?? 0,
            latestAttempt?.at ?? 0
          ),
        });
      }
    }
  }

  return entries.sort((a, b) => b.latestAt - a.latestAt);
}

function inBand(score: number, band: ScoreBand): boolean {
  if (band === 'all') return true;
  if (band === 'weak') return score < 70;
  if (band === 'mid') return score >= 70 && score < 85;
  return score >= 85;
}

export function filterJournalEntries(
  entries: readonly JournalEntry[],
  filters: JournalFilters = {}
): JournalEntry[] {
  const lower = filters.query?.trim().toLowerCase() ?? '';
  const filtered = entries.filter((entry) => {
    if (filters.bookId && entry.book.id !== filters.bookId) return false;
    if (
      filters.source &&
      filters.source !== 'all' &&
      sourceGroup(entry.book) !== filters.source
    ) {
      return false;
    }
    if (!inBand(entry.score, filters.band ?? 'all')) return false;
    if (
      filters.error &&
      filters.error !== 'all' &&
      !errorCategoriesOf(entry.analysis).includes(filters.error)
    ) {
      return false;
    }
    if (filters.since !== undefined && entry.latestAt < filters.since) return false;
    if (filters.until !== undefined && entry.latestAt > filters.until) return false;

    if (!lower) return true;
    const haystack = [
      entry.pair.japanese,
      entry.pair.chinese,
      entry.translation,
      entry.book.title,
      entry.chapter.title,
      ...entry.attempts.map((attempt) => attempt.translation),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(lower);
  });

  if (filters.sortBy === 'score') {
    return [...filtered].sort(
      (a, b) => a.score - b.score || b.latestAt - a.latestAt
    );
  }
  return [...filtered].sort((a, b) => b.latestAt - a.latestAt);
}

export function journalSummary(
  entries: readonly JournalEntry[],
  now = Date.now()
): JournalSummary {
  const weekStart = now - 7 * 86400_000;
  return {
    totalAttempts: entries.reduce((sum, entry) => sum + entry.attempts.length, 0),
    uniqueSentences: entries.length,
    materials: new Set(entries.map((entry) => entry.book.id)).size,
    weak: entries.filter((entry) => entry.score < 70).length,
    thisWeek: entries.reduce(
      (sum, entry) =>
        sum + entry.attempts.filter((attempt) => attempt.at >= weekStart).length,
      0
    ),
  };
}
