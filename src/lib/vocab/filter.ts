import type { VocabEntry, VocabStatus } from '../../types';

export interface VocabFilter {
  query?: string;
  bookId?: string;
  chapterId?: string;
  status?: VocabStatus;
}

function matchesQuery(entry: VocabEntry, query: string): boolean {
  const haystack = [
    entry.word,
    entry.reading,
    entry.meaning,
    entry.core,
    entry.example,
    entry.exampleTranslation,
    ...entry.synonyms.flatMap((synonym) => [synonym.word, synonym.nuance]),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return haystack.includes(query);
}

/** Filter without mutating the stored list; newest first. */
export function filterVocabEntries(
  entries: readonly VocabEntry[],
  filter: VocabFilter = {}
): VocabEntry[] {
  const query = filter.query?.trim().toLowerCase() ?? '';

  return entries
    .filter((entry) => {
      if (filter.bookId && entry.source?.bookId !== filter.bookId) return false;
      if (filter.chapterId && entry.source?.chapterId !== filter.chapterId) {
        return false;
      }
      if (filter.status && entry.status !== filter.status) return false;
      if (query && !matchesQuery(entry, query)) return false;
      return true;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}
