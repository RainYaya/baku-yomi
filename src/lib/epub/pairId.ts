import type { SentencePair } from '../../types';

/**
 * Pair ids used to be `ch{chapterIndex}-p{pairIndex}`, which is only unique
 * inside one book. Two books both have a `ch0-p0`, so edits and practice
 * records written through that id could land in the wrong book.
 *
 * New ids include the book id and are safe to use as global storage keys.
 */
export function createPairId(
  bookId: string,
  chapterIndex: number,
  pairIndex: number
): string {
  return `${bookId}-ch${chapterIndex}-p${pairIndex}`;
}

export function scopePairIds(
  pairs: SentencePair[],
  bookId: string,
  chapterIndex: number
): SentencePair[] {
  return pairs.map((pair) => ({
    ...pair,
    id: createPairId(bookId, chapterIndex, pair.pairIndex),
    chapterIndex,
  }));
}

/** Extract the pair index from the legacy `ch0-p0` shape. */
export function legacyPairIndex(pairId: string): number | null {
  const match = /^ch\d+-p(\d+)$/.exec(pairId);
  return match ? Number(match[1]) : null;
}
