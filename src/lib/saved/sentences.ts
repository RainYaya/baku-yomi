/**
 * Sentences the reader deliberately keeps. Unlike the practice journal, which
 * only holds what was already practiced, this list exists before the first
 * attempt — so it stores a snapshot of the text and where it came from.
 */
export interface SavedSentenceInput {
  bookId: string;
  bookTitle: string;
  chapterIndex: number;
  chapterTitle: string;
  pairId: string;
  japanese: string;
  chinese: string;
}

export interface SavedSentence extends SavedSentenceInput {
  id: string;
  createdAt: number;
}

function newId(now: number): string {
  return `sv-${now}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Save a pair, refreshing the snapshot when it is already kept. */
export function addSavedSentence(
  list: readonly SavedSentence[],
  input: SavedSentenceInput,
  now = Date.now()
): SavedSentence[] {
  const existing = list.find((sentence) => sentence.pairId === input.pairId);
  if (existing) {
    return list.map((sentence) =>
      sentence.pairId === input.pairId
        ? { ...sentence, ...input, createdAt: sentence.createdAt }
        : sentence
    );
  }

  return [{ ...input, id: newId(now), createdAt: now }, ...list];
}

export function removeSavedSentence(
  list: readonly SavedSentence[],
  id: string
): SavedSentence[] {
  return list.filter((sentence) => sentence.id !== id);
}

/** What the reader's star button does: keep it, or take it back. */
export function toggleSavedSentence(
  list: readonly SavedSentence[],
  input: SavedSentenceInput,
  now = Date.now()
): SavedSentence[] {
  if (isSentenceSaved(list, input.pairId)) {
    return list.filter((sentence) => sentence.pairId !== input.pairId);
  }
  return addSavedSentence(list, input, now);
}

export function isSentenceSaved(
  list: readonly SavedSentence[],
  pairId: string
): boolean {
  return list.some((sentence) => sentence.pairId === pairId);
}
