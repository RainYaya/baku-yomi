export type PasteDestination = 'new' | 'existing';

/**
 * Which book a pasted article should be appended to, if any.
 *
 * `targetBookId` is set when the dialog was opened from a book's chapter
 * menu; that book always wins. Otherwise the home dialog can either create a
 * new book or append to the book the user picked.
 */
export function resolvePasteTargetId(input: {
  targetBookId?: string;
  destination: PasteDestination;
  selectedBookId?: string;
  books: ReadonlyArray<{ id: string }>;
}): string | undefined {
  if (input.targetBookId) return input.targetBookId;
  if (input.destination !== 'existing') return undefined;
  if (
    input.selectedBookId &&
    input.books.some((book) => book.id === input.selectedBookId)
  ) {
    return input.selectedBookId;
  }
  return input.books[0]?.id;
}
