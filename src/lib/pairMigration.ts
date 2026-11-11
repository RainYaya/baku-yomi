import type { Book } from '../types';
import { createPairId, legacyPairIndex } from './epub/pairId';

export interface PairMigrationRef {
  oldId: string;
  newId: string;
  japanese: string;
  bookId: string;
  chapterId: string;
}

/** Rewrite one book's pair ids to the globally unique `book-ch-p` shape. */
export function migrateBookPairIds(book: Book): Book {
  return {
    ...book,
    chapters: book.chapters.map((chapter, position) => {
      const chapterIndex = Number.isFinite(chapter.index) ? chapter.index : position;
      return {
        ...chapter,
        id: chapter.id || `${book.id}-ch${chapterIndex}`,
        index: chapterIndex,
        pairs: chapter.pairs.map((pair) => ({
          ...pair,
          id: createPairId(book.id, chapterIndex, pair.pairIndex),
          chapterIndex,
        })),
      };
    }),
  };
}

/**
 * Every legacy id plus the scoped ids that could replace it.
 *
 * A legacy id can match more than one book (`ch0-p0` exists everywhere), so
 * callers must disambiguate with text, current book, or a stable chapter id.
 */
export function buildPairMigrationMap(books: Book[]): PairMigrationRef[] {
  const refs: PairMigrationRef[] = [];

  for (const book of books) {
    book.chapters.forEach((chapter, position) => {
      const chapterIndex = Number.isFinite(chapter.index) ? chapter.index : position;
      for (const pair of chapter.pairs) {
        refs.push({
          oldId: `ch${chapterIndex}-p${pair.pairIndex}`,
          newId: createPairId(book.id, chapterIndex, pair.pairIndex),
          japanese: pair.japanese,
          bookId: book.id,
          chapterId: chapter.id,
        });
      }
    });
  }

  return refs;
}

/** Bookmarks already carry a chapter id, so their migration is exact. */
export function migrateBookmarkPairId(chapterId: string, pairId: string): string {
  const pairIndex = legacyPairIndex(pairId);
  return pairIndex == null ? pairId : `${chapterId}-p${pairIndex}`;
}

interface KeyedMigrationOptions<T> {
  currentBookId?: string | null;
  /** Analyses know the original Japanese, which can disambiguate two books. */
  matchJapanese?: (value: T) => string | undefined;
}

function splitHintSuffix(key: string): { base: string; suffix: string } {
  const index = key.indexOf('_hint');
  return index >= 0
    ? { base: key.slice(0, index), suffix: key.slice(index) }
    : { base: key, suffix: '' };
}

export function migrateKeyedRecord<T>(
  record: Record<string, T>,
  refs: PairMigrationRef[],
  options: KeyedMigrationOptions<T> = {}
): Record<string, T> {
  const byLegacyId = new Map<string, PairMigrationRef[]>();
  for (const ref of refs) {
    const list = byLegacyId.get(ref.oldId);
    if (list) list.push(ref);
    else byLegacyId.set(ref.oldId, [ref]);
  }

  const migrated: Record<string, T> = {};

  for (const [key, value] of Object.entries(record)) {
    const { base, suffix } = splitHintSuffix(key);
    if (legacyPairIndex(base) == null) {
      migrated[key] = value;
      continue;
    }

    const candidates = byLegacyId.get(base);
    if (!candidates || candidates.length === 0) {
      migrated[key] = value;
      continue;
    }

    let chosen: PairMigrationRef | undefined;

    if (options.matchJapanese) {
      const japanese = options.matchJapanese(value);
      if (japanese) {
        chosen = candidates.find((candidate) => candidate.japanese === japanese);
      }
    }

    if (!chosen && options.currentBookId) {
      chosen = candidates.find((candidate) => candidate.bookId === options.currentBookId);
    }

    chosen ??= candidates[0];
    migrated[`${chosen.newId}${suffix}`] = value;
  }

  return migrated;
}

export interface PracticeDataLike {
  translations?: Record<string, string>;
  analyses?: Record<string, unknown>;
  notes?: Record<string, string>;
  hints?: Record<string, string>;
}

export function migratePracticeData<T extends PracticeDataLike>(
  data: T,
  books: Book[],
  currentBookId: string | null
): T {
  const refs = buildPairMigrationMap(books);

  return {
    ...data,
    translations: migrateKeyedRecord(data.translations ?? {}, refs, { currentBookId }),
    analyses: migrateKeyedRecord(data.analyses ?? {}, refs, {
      currentBookId,
      matchJapanese: (value) =>
        (value as { originalJapanese?: string } | undefined)?.originalJapanese,
    }),
    notes: migrateKeyedRecord(data.notes ?? {}, refs, { currentBookId }),
    hints: migrateKeyedRecord(data.hints ?? {}, refs, { currentBookId }),
  };
}
