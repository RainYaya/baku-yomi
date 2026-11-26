import assert from 'node:assert/strict';
import test from 'node:test';
import type { Book } from '../src/types';
import { untranslatedPairs } from '../src/lib/tts/readiness';

function book(chinese: string[]): Book {
  return {
    id: 'b',
    title: '书',
    author: '',
    importedAt: 0,
    chapters: [
      {
        id: 'c0',
        title: '一',
        index: 0,
        pairs: chinese.map((text, index) => ({
          id: `c0-p${index}`,
          japanese: 'こんにちは。',
          chinese: text,
          chapterIndex: 0,
          pairIndex: index,
        })),
      },
    ],
  };
}

test('counts pairs that would leave practice without a reference', () => {
  assert.equal(untranslatedPairs(book(['你好。', '', '   '])), 2);
});

test('a fully translated book needs no warning', () => {
  assert.equal(untranslatedPairs(book(['你好。', '再见。'])), 0);
});

test('a book with no chapters needs no warning', () => {
  assert.equal(
    untranslatedPairs({ id: 'x', title: 'x', author: '', importedAt: 0, chapters: [] }),
    0
  );
});
