import type { Book, VocabEntry, VocabSynonym } from '../../types';

export interface VocabReadingParts {
  word: string;
  /** Brackets included, so the list can render it in a quieter style. */
  reading?: string;
}

/** Split 割り切る【わりきる】 into the word and its bracketed reading. */
export function splitVocabReading(word: string, reading?: string): VocabReadingParts {
  const trimmed = reading?.trim();
  if (!trimmed) return { word, reading: undefined };
  return /^[ぁ-ゖァ-ヺー\s]+$/.test(trimmed)
    ? { word, reading: `【${trimmed}】` }
    : { word, reading: `（${trimmed}）` };
}

/** 割り切る【わりきる】 for kana, ローンチ（launch） for a foreign reading. */
export function formatVocabReading(word: string, reading?: string): string {
  const parts = splitVocabReading(word, reading);
  return parts.reading ? `${parts.word}${parts.reading}` : parts.word;
}

export interface VocabSentencePart {
  text: string;
  target: boolean;
}

/** Split the example around the first occurrence of the word, so the card can
 * underline it without touching the stored sentence. */
export function splitVocabSentence(
  example: string,
  word: string
): VocabSentencePart[] {
  const target = word.trim();
  if (!target) return [{ text: example, target: false }];

  const index = example.indexOf(target);
  if (index < 0) return [{ text: example, target: false }];

  const parts: VocabSentencePart[] = [];
  if (index > 0) parts.push({ text: example.slice(0, index), target: false });
  parts.push({ text: target, target: true });
  const rest = example.slice(index + target.length);
  if (rest) parts.push({ text: rest, target: false });
  return parts;
}

export function formatSynonymsInput(synonyms: VocabSynonym[] = []): string {
  return synonyms
    .map((synonym) => (synonym.nuance ? `${synonym.word}（${synonym.nuance}）` : synonym.word))
    .join('・');
}

export function parseSynonymsInput(value: string): VocabSynonym[] {
  return value
    .split(/[・,，、]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.+?)[（(]([^（）()]*)[）)]$/);
      return match
        ? { word: match[1].trim(), nuance: match[2].trim() || undefined }
        : { word: part };
    });
}

export function vocabSourceLabel(
  entry: VocabEntry,
  books: readonly Book[]
): string {
  if (!entry.source) return '手动添加';
  const source = entry.source;
  const book = books.find((item) => item.id === source.bookId);
  if (!book) return '原文已删除';
  const chapter = book.chapters.find((item) => item.id === source.chapterId);
  return chapter ? `${book.title} · ${chapter.title}` : book.title;
}
