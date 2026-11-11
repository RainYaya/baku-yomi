import type { Book, Chapter } from '../../types';
import { buildPairs } from '../epub/pairBuilder';
import { scopePairIds } from '../epub/pairId';
import { createBookId } from '../id';

export interface TextChapterInput {
  title: string;
  text: string;
}

/**
 * Split pasted text into chapters.
 *
 * Markdown-style headings become chapter titles. Without headings the whole
 * paste is one chapter, which is the safest default for an article or a
 * copied WeChat post.
 */
export function splitTextChapters(
  raw: string,
  fallbackTitle = '正文'
): TextChapterInput[] {
  const normalized = raw.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  const chapters: { title: string; lines: string[] }[] = [];
  let current: { title: string; lines: string[] } = {
    title: fallbackTitle,
    lines: [],
  };

  for (const line of normalized.split('\n')) {
    const heading = /^\s*#{1,3}\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (current.lines.join('').trim()) chapters.push(current);
      current = { title: heading[1].trim() || fallbackTitle, lines: [] };
    } else {
      current.lines.push(line);
    }
  }

  if (current.lines.join('').trim()) chapters.push(current);

  return chapters.map((chapter) => ({
    title: chapter.title || fallbackTitle,
    text: chapter.lines.join('\n').trim(),
  }));
}

/**
 * Turn a pasted block into paragraph units.
 *
 * If the paste already has blank lines, those are the paragraph boundaries.
 * Otherwise every non-empty line is a paragraph, which matches how articles
 * and WeChat posts are copied. Keeping adjacent lines as separate units is
 * also what lets the existing bilingual pairing detect JA/ZH alternation.
 */
export function paragraphsFromText(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  const hasBlankLines = /\n\s*\n/.test(normalized);
  const blocks = hasBlankLines
    ? normalized.split(/\n\s*\n+/)
    : normalized.split(/\n+/);

  return blocks
    .map((block) => block.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Build chapters for an existing book.
 *
 * `startSeq` keeps pair ids unique when articles are appended to a collection
 * book: a deleted article's index can be reused for display, but its id space
 * must not be, or old practice records could attach to a new article.
 */
export function buildTextChapters(input: {
  bookId: string;
  text: string;
  startSeq?: number;
  startIndex?: number;
  fallbackTitle?: string;
}): { chapters: Chapter[]; nextSeq: number } {
  const chapterInputs = splitTextChapters(input.text, input.fallbackTitle);
  const chapters: Chapter[] = [];
  let seq = input.startSeq ?? 0;
  let index = input.startIndex ?? 0;

  for (const chapterInput of chapterInputs) {
    const sentences = paragraphsFromText(chapterInput.text).map((text) => ({ text }));
    if (sentences.length === 0) continue;

    const pairs = scopePairIds(buildPairs(sentences, seq), input.bookId, seq).map(
      (pair) => ({ ...pair, chapterIndex: index })
    );

    chapters.push({
      id: `${input.bookId}-ch${seq}`,
      title: chapterInput.title || `第${index + 1}章`,
      index,
      pairs,
    });

    seq += 1;
    index += 1;
  }

  return { chapters, nextSeq: seq };
}

export function buildTextBook(input: {
  title: string;
  author?: string;
  text: string;
}): Book {
  const bookId = createBookId();
  const { chapters } = buildTextChapters({ bookId, text: input.text });

  if (chapters.length === 0) {
    throw new Error('没有可导入的正文。');
  }

  return {
    id: bookId,
    title: input.title.trim() || chapters[0].title || '未命名材料',
    author: input.author?.trim() || '未知作者',
    chapters,
    importedAt: Date.now(),
    source: { kind: 'text' },
  };
}
