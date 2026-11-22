import assert from 'node:assert/strict';
import test from 'node:test';
import { NOTE_BOOK_ID, useBookStore } from '../src/stores/bookSlice';
import type { NoteChapterMeta } from '../src/types/book';

function reset() {
  useBookStore.setState({ books: [], currentBookId: null, currentChapterIndex: 0 });
}

function meta(overrides: Partial<NoteChapterMeta> = {}): NoteChapterMeta {
  return {
    url: 'https://note.com/seoyun/n/n1',
    author: 'seoyun',
    publishedAt: Date.now(),
    sourceKind: 'hashtag',
    sourceKey: 'エッセイ',
    tags: ['暮らし'],
    ...overrides,
  };
}

test('ensureNoteBook creates the hidden note book once', () => {
  reset();
  const first = useBookStore.getState().ensureNoteBook();
  const second = useBookStore.getState().ensureNoteBook();

  assert.equal(first, NOTE_BOOK_ID);
  assert.equal(second, NOTE_BOOK_ID);

  const books = useBookStore.getState().books;
  assert.equal(books.length, 1);
  assert.equal(books[0].source?.kind, 'note');
  assert.equal(books[0].chapters.length, 0);
  assert.equal(books[0].chapterSeq, 0);
});

test('appendNoteChapter adds note metadata and stable pair ids', () => {
  reset();
  const bookId = useBookStore.getState().ensureNoteBook();
  const note = meta();

  const result = useBookStore.getState().appendNoteChapter({
    bookId,
    title: '春の台所から',
    text: '三月の終わり、台所の窓を開けた。\nまだ冷たい風が入ってくる。',
    note,
  });

  assert.deepEqual(result, { chapterIndex: 0, created: true });

  const book = useBookStore.getState().books[0];
  const chapter = book.chapters[0];
  assert.equal(chapter.id, 'note-book-ch0');
  assert.equal(chapter.title, '春の台所から');
  assert.equal(chapter.index, 0);
  assert.equal(chapter.sourceUrl, 'https://note.com/seoyun/n/n1');
  assert.deepEqual(chapter.note, note);
  assert.deepEqual(
    chapter.pairs.map((pair) => [pair.id, pair.pairIndex, pair.chapterIndex]),
    [
      ['note-book-ch0-p0', 0, 0],
      ['note-book-ch0-p1', 1, 0],
    ]
  );
  assert.equal(chapter.pairs[0].japanese, '三月の終わり、台所の窓を開けた。');
});

test('appendNoteChapter dedupes by normalized URL', () => {
  reset();
  const bookId = useBookStore.getState().ensureNoteBook();

  useBookStore.getState().appendNoteChapter({
    bookId,
    title: '春の台所から',
    text: '三月の終わり、台所の窓を開けた。',
    note: meta(),
  });

  const again = useBookStore.getState().appendNoteChapter({
    bookId,
    title: '春の台所から',
    text: '三月の終わり、台所の窓を開けた。',
    note: meta({ url: 'https://note.com/seoyun/n/n1?from=feed#top' }),
  });

  assert.deepEqual(again, { chapterIndex: 0, created: false });
  assert.equal(useBookStore.getState().books[0].chapters.length, 1);
});

test('appending two articles keeps chapterSeq and pair ids disjoint', () => {
  reset();
  const bookId = useBookStore.getState().ensureNoteBook();

  const first = useBookStore.getState().appendNoteChapter({
    bookId,
    title: '一篇',
    text: '最初の段落。',
    note: meta(),
  });
  const second = useBookStore.getState().appendNoteChapter({
    bookId,
    title: '二篇',
    text: '二つ目の段落。',
    note: meta({ url: 'https://note.com/seoyun/n/n2' }),
  });

  assert.deepEqual(first, { chapterIndex: 0, created: true });
  assert.deepEqual(second, { chapterIndex: 1, created: true });

  const book = useBookStore.getState().books[0];
  assert.equal(book.chapterSeq, 2);
  assert.equal(book.chapters[1].id, 'note-book-ch1');

  const ids = book.chapters.flatMap((chapter) => chapter.pairs.map((pair) => pair.id));
  assert.deepEqual(ids, ['note-book-ch0-p0', 'note-book-ch1-p0']);
  assert.equal(new Set(ids).size, ids.length);
});
