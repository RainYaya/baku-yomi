import type { Book, SentencePair } from '../../types';
import type { GeneratedMaterial } from '../ai/materialJson';
import { createBookId } from '../id';
import { createPairId } from '../epub/pairId';

/**
 * Save an AI scenario as an ordinary book. Everything downstream — reader,
 * translation, vocabulary, practice — only sees a normal chapter; the source
 * badge is how the library admits the material was generated.
 */
export function buildGeneratedBook(input: {
  scenario: string;
  material: GeneratedMaterial;
}): Book {
  const bookId = createBookId();
  const chapterIndex = 0;

  const pairs: SentencePair[] = input.material.lines.map((line, pairIndex) => ({
    id: createPairId(bookId, chapterIndex, pairIndex),
    japanese: line.japanese,
    chinese: line.chinese,
    chapterIndex,
    pairIndex,
  }));

  if (pairs.length === 0) {
    throw new Error('AI 返回的材料没有可用的句子。');
  }

  return {
    id: bookId,
    title: input.material.title,
    author: 'AI 情景',
    importedAt: Date.now(),
    source: {
      kind: 'ai',
      scenario: input.scenario.trim() || input.material.title,
    },
    chapters: [
      {
        id: `${bookId}-ch${chapterIndex}`,
        title: input.material.title,
        index: chapterIndex,
        pairs,
      },
    ],
  };
}
