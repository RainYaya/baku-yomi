import type { Chapter, NoteChapterMeta } from '../../types';
import { buildPairs } from '../epub/pairBuilder';
import { scopePairIds } from '../epub/pairId';
import { paragraphsFromText } from '../import/textMaterial';

export interface NoteChapterInput {
  bookId: string;
  title: string;
  text: string;
  note: NoteChapterMeta;
  /** Sequence in the book; also seeds pair ids so a deleted article's id space is not reused. */
  seq: number;
  index: number;
}

/** Build one ordinary Chapter from an opened note article. */
export function buildNoteChapter(input: NoteChapterInput): Chapter | null {
  const sentences = paragraphsFromText(input.text).map((text) => ({ text }));
  if (sentences.length === 0) return null;

  const pairs = scopePairIds(
    buildPairs(sentences, input.seq),
    input.bookId,
    input.seq
  ).map((pair) => ({ ...pair, chapterIndex: input.index }));

  return {
    id: `${input.bookId}-ch${input.seq}`,
    title: input.title.trim() || 'note',
    index: input.index,
    pairs,
    sourceUrl: input.note.url,
    note: input.note,
  };
}
