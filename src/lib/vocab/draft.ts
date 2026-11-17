import type { VocabDraft, VocabEntry } from '../../types';

export interface VocabSelectionInput {
  selection: {
    text: string;
    pairId: string;
    startOffset: number;
    endOffset: number;
  };
  pair: { japanese: string; chinese: string };
  bookId: string;
  chapterId: string;
  chapterIndex: number;
}

/** The selected word plus the sentence it was read in. */
export function createVocabDraftFromSelection(
  input: VocabSelectionInput
): VocabDraft {
  const translation = input.pair.chinese.trim();
  return {
    word: input.selection.text.trim(),
    example: input.pair.japanese.trim(),
    exampleTranslation: translation || undefined,
    exampleSource: 'article',
    source: {
      bookId: input.bookId,
      chapterId: input.chapterId,
      chapterIndex: input.chapterIndex,
      pairId: input.selection.pairId,
      startOffset: input.selection.startOffset,
      endOffset: input.selection.endOffset,
    },
  };
}

/** A hand-added word. An empty example asks the model for one. */
export function createManualVocabDraft(word = ''): VocabDraft {
  return { word: word.trim(), example: '', exampleSource: 'ai' };
}

/** Re-open a saved entry in the same editable shape a new word uses. */
export function createVocabDraftFromEntry(entry: VocabEntry): VocabDraft {
  return {
    word: entry.word,
    reading: entry.reading,
    meaning: entry.meaning,
    synonyms: entry.synonyms,
    core: entry.core,
    example: entry.example,
    exampleTranslation: entry.exampleTranslation,
    exampleSource: entry.exampleSource,
    source: entry.source,
  };
}

/** The same word in the same sentence is the same encounter. */
export function findDuplicateVocabEntry<
  T extends { id: string; word: string; example: string },
>(entries: readonly T[], word: string, example: string): T | null {
  const targetWord = word.trim();
  const targetExample = example.trim();
  if (!targetWord || !targetExample) return null;
  return (
    entries.find(
      (entry) =>
        entry.word.trim() === targetWord && entry.example.trim() === targetExample
    ) ?? null
  );
}
