import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSynonymsInput,
  formatVocabReading,
  parseSynonymsInput,
  splitVocabReading,
  splitVocabSentence,
  vocabSourceLabel,
} from '../src/lib/vocab/display';
import type { Book, VocabEntry } from '../src/types';

test('formatVocabReading uses Japanese brackets for kana and Latin brackets for foreign words', () => {
  assert.equal(formatVocabReading('割り切る', 'わりきる'), '割り切る【わりきる】');
  assert.equal(formatVocabReading('ローンチ', 'launch'), 'ローンチ（launch）');
  assert.equal(formatVocabReading('割り切る'), '割り切る');
});

test('splitVocabReading keeps the bracket with the reading so the list can mute it', () => {
  assert.deepEqual(splitVocabReading('割り切る', 'わりきる'), {
    word: '割り切る',
    reading: '【わりきる】',
  });
  assert.deepEqual(splitVocabReading('ローンチ', 'launch'), {
    word: 'ローンチ',
    reading: '（launch）',
  });
  assert.deepEqual(splitVocabReading('割り切る'), {
    word: '割り切る',
    reading: undefined,
  });
});

test('splitVocabSentence marks the first occurrence of the target', () => {
  assert.deepEqual(splitVocabSentence('仕事だと割り切ることにした。', '割り切る'), [
    { text: '仕事だと', target: false },
    { text: '割り切る', target: true },
    { text: 'ことにした。', target: false },
  ]);
});

test('splitVocabSentence leaves a sentence without the target unmarked', () => {
  assert.deepEqual(splitVocabSentence('仕事だと割り切って対応した。', '割り切る'), [
    { text: '仕事だと割り切って対応した。', target: false },
  ]);
});

test('synonyms round-trip through the editable text field', () => {
  const synonyms = [
    { word: '受け入れる', nuance: '纳得' },
    { word: '諦める', nuance: '断念' },
    { word: '切り替える' },
  ];
  const text = formatSynonymsInput(synonyms);
  assert.equal(text, '受け入れる（纳得）・諦める（断念）・切り替える');
  assert.deepEqual(parseSynonymsInput(text), synonyms);
});

test('parseSynonymsInput accepts commas and drops empty parts', () => {
  assert.deepEqual(parseSynonymsInput('受け入れる（纳得）, 諦める 、 '), [
    { word: '受け入れる', nuance: '纳得' },
    { word: '諦める' },
  ]);
});

test('vocabSourceLabel names the book and chapter, or says it was added by hand', () => {
  const books: Book[] = [
    {
      id: 'book-1',
      title: 'テストの本',
      author: '',
      chapters: [
        { id: 'chapter-1', title: '第三章', index: 2, pairs: [] },
      ],
      importedAt: 1,
    },
  ];
  const entry = {
    id: 'v1',
    word: '割り切る',
    example: '',
    exampleSource: 'ai',
    synonyms: [],
    status: 'new',
    createdAt: 1,
    updatedAt: 1,
    source: {
      bookId: 'book-1',
      chapterId: 'chapter-1',
      chapterIndex: 2,
      pairId: 'pair-1',
    },
  } satisfies VocabEntry;

  assert.equal(vocabSourceLabel(entry, books), 'テストの本 · 第三章');
  assert.equal(vocabSourceLabel({ ...entry, source: undefined }, books), '手动添加');
});
