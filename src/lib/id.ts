/** Time plus randomness so two imports in the same millisecond stay distinct. */
export function createBookId(): string {
  return `book-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
