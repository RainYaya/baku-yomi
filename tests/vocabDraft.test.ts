import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createManualVocabDraft,
  createVocabDraftFromEntry,
  createVocabDraftFromSelection,
  findDuplicateVocabEntry,
} from '../src/lib/vocab/draft';
import { buildVocabEntry } from '../src/lib/vocab/entry';

const pair = {
  japanese: '仕事として必要だと割り切って対応した。',
  chinese: '作为工作，我选择想开并应对。',
};

const selection = {
  text: '割り切って',
  pairId: 'pair-1',
  startOffset: 10,
  endOffset: 15,
};

test('selection draft keeps the article sentence, translation, and source', () => {
  const draft = createVocabDraftFromSelection({
    selection,
    pair,
    bookId: 'book-1',
    chapterId: 'chapter-1',
    chapterIndex: 2,
  });

  assert.equal(draft.word, '割り切って');
  assert.equal(draft.example, pair.japanese);
  assert.equal(draft.exampleTranslation, pair.chinese);
  assert.equal(draft.exampleSource, 'article');
  assert.deepEqual(draft.source, {
    bookId: 'book-1',
    chapterId: 'chapter-1',
    chapterIndex: 2,
    pairId: 'pair-1',
    startOffset: 10,
    endOffset: 15,
  });
});

test('manual draft starts empty and intends an AI example', () => {
  const draft = createManualVocabDraft('  割り切る  ');
  assert.equal(draft.word, '割り切る');
  assert.equal(draft.example, '');
  assert.equal(draft.exampleSource, 'ai');
  assert.equal(draft.source, undefined);
});

test('duplicate lookup matches the same word and example after trimming', () => {
  const entries = [
    { id: 'v1', word: '割り切る', example: ' 仕事だと割り切る。 ' },
  ];
  assert.equal(
    findDuplicateVocabEntry(entries, ' 割り切る ', '仕事だと割り切る。')?.id,
    'v1'
  );
});

test('duplicate lookup allows the same word in a different sentence', () => {
  const entries = [
    { id: 'v1', word: '割り切る', example: '仕事だと割り切る。' },
  ];
  assert.equal(findDuplicateVocabEntry(entries, '割り切る', '別の文。'), null);
});

test('duplicate lookup ignores an empty example', () => {
  const entries = [{ id: 'v1', word: '割り切る', example: '' }];
  assert.equal(findDuplicateVocabEntry(entries, '割り切る', ''), null);
});

test('entry draft keeps every editable field and its source', () => {
  const entry = buildVocabEntry({
    draft: createVocabDraftFromSelection({
      selection,
      pair,
      bookId: 'book-1',
      chapterId: 'chapter-1',
      chapterIndex: 2,
    }),
    fields: {
      word: '割り切って',
      reading: 'わりきって',
      meaning: '想开',
      synonyms: [{ word: '受け入れる', nuance: '纳得' }],
      core: '感情に区切りをつける',
      example: pair.japanese,
      exampleTranslation: pair.chinese,
      exampleSource: 'article',
    },
    now: 1000,
  });

  const draft = createVocabDraftFromEntry(entry);

  assert.equal(draft.word, entry.word);
  assert.equal(draft.reading, entry.reading);
  assert.equal(draft.meaning, entry.meaning);
  assert.deepEqual(draft.synonyms, entry.synonyms);
  assert.equal(draft.core, entry.core);
  assert.equal(draft.example, entry.example);
  assert.equal(draft.exampleTranslation, entry.exampleTranslation);
  assert.equal(draft.exampleSource, 'article');
  assert.deepEqual(draft.source, entry.source);
});

test('buildVocabEntry keeps the article example and source', () => {
  const draft = createVocabDraftFromSelection({
    selection,
    pair,
    bookId: 'book-1',
    chapterId: 'chapter-1',
    chapterIndex: 2,
  });

  const entry = buildVocabEntry({
    draft,
    fields: {
      word: '割り切って',
      reading: 'わりきって',
      meaning: '想开',
      synonyms: [{ word: '受け入れる', nuance: '纳得' }],
      core: '感情に区切りをつけ、現実的に前へ進む',
      example: draft.example,
      exampleSource: 'article',
    },
    now: 1000,
  });

  assert.match(entry.id, /^vocab-/);
  assert.equal(entry.createdAt, 1000);
  assert.equal(entry.updatedAt, 1000);
  assert.equal(entry.exampleSource, 'article');
  assert.deepEqual(entry.source, draft.source);
  assert.equal(entry.status, 'new');
});

test('buildVocabEntry keeps the original creation time when editing', () => {
  const draft = createManualVocabDraft('割り切る');
  const entry = buildVocabEntry({
    draft,
    id: 'vocab-1',
    createdAt: 500,
    now: 1000,
    fields: {
      word: '割り切る',
      example: '仕事だと割り切る。',
      exampleSource: 'ai',
      status: 'known',
    },
  });

  assert.equal(entry.id, 'vocab-1');
  assert.equal(entry.createdAt, 500);
  assert.equal(entry.updatedAt, 1000);
  assert.equal(entry.status, 'known');
});
