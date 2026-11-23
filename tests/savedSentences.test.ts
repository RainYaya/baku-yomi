import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addSavedSentence,
  isSentenceSaved,
  removeSavedSentence,
  toggleSavedSentence,
  type SavedSentenceInput,
} from '../src/lib/saved/sentences';

function input(overrides: Partial<SavedSentenceInput> = {}): SavedSentenceInput {
  return {
    bookId: 'book-1',
    bookTitle: '無職転生 1',
    chapterIndex: 2,
    chapterTitle: '第三話',
    pairId: 'book-1-ch2-p5',
    japanese: '目の前に崖がある。',
    chinese: '面前有一道悬崖。',
    ...overrides,
  };
}

test('saves a sentence with a snapshot of its text and place', () => {
  const list = addSavedSentence([], input(), 1000);

  assert.equal(list.length, 1);
  const [saved] = list;
  assert.equal(saved.bookId, 'book-1');
  assert.equal(saved.pairId, 'book-1-ch2-p5');
  assert.equal(saved.japanese, '目の前に崖がある。');
  assert.equal(saved.chinese, '面前有一道悬崖。');
  assert.equal(saved.createdAt, 1000);
  assert.ok(saved.id.startsWith('sv-'));
});

test('puts the newest sentence first', () => {
  let list = addSavedSentence([], input({ pairId: 'a', japanese: '一つ目。' }), 1000);
  list = addSavedSentence(list, input({ pairId: 'b', japanese: '二つ目。' }), 2000);

  assert.deepEqual(
    list.map((sentence) => sentence.pairId),
    ['b', 'a']
  );
});

test('saving the same pair twice keeps one entry and refreshes the text', () => {
  let list = addSavedSentence([], input(), 1000);
  list = addSavedSentence(list, input({ japanese: '書き直した。' }), 2000);

  assert.equal(list.length, 1);
  assert.equal(list[0].japanese, '書き直した。');
  assert.equal(list[0].createdAt, 1000);
});

test('toggling adds, then removes, the same pair', () => {
  const added = toggleSavedSentence([], input(), 1000);
  assert.equal(added.length, 1);

  const removed = toggleSavedSentence(added, input(), 2000);
  assert.deepEqual(removed, []);
});

test('removes by id and reports what is saved', () => {
  const list = addSavedSentence([], input(), 1000);
  assert.equal(isSentenceSaved(list, 'book-1-ch2-p5'), true);
  assert.equal(isSentenceSaved(list, 'other-pair'), false);

  assert.deepEqual(removeSavedSentence(list, list[0].id), []);
});

test('keeps entries whose book no longer exists', () => {
  const list = addSavedSentence([], input(), 1000);
  // Nothing here filters by library membership: the snapshot is the reason the
  // entry can still be read after the book is deleted.
  assert.equal(list[0].bookTitle, '無職転生 1');
});
