import type { Book } from '../../types';

/**
 * Replace the book with the same id, or append it. Regenerating an
 * audiobook reuses the source book's id, so a plain append would leave two
 * shelf cards sharing one id.
 */
export function upsertBook(books: readonly Book[], book: Book): Book[] {
  const index = books.findIndex((item) => item.id === book.id);
  if (index === -1) return [...books, book];
  const next = [...books];
  next[index] = book;
  return next;
}
