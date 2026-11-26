import type { Book } from '../../types';

/**
 * Pairs with no Chinese text. The audio still reads the Japanese fine, but
 * back-translation practice compares against the translation, so a book with
 * untranslated pairs makes an audiobook you can listen to but not practise on.
 */
export function untranslatedPairs(book: Book): number {
  let missing = 0;
  for (const chapter of book.chapters) {
    for (const pair of chapter.pairs) {
      if (!pair.chinese.trim()) missing += 1;
    }
  }
  return missing;
}
