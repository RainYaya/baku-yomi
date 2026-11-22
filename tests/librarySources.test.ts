import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Book, BookSource } from '../src/types';
import {
  booksInGroup,
  isNoteBook,
  sourceGroup,
  sourceLabel,
  visibleBooks,
} from '../src/lib/library/sources';

function book(id: string, source?: BookSource): Book {
  return {
    id,
    title: id,
    author: 'tester',
    chapters: [],
    importedAt: 1,
    source,
  };
}

const epub = book('epub', { kind: 'epub' });
const text = book('text', { kind: 'text' });
const url = book('url', { kind: 'url', url: 'https://example.com' });
const collection = book('collection', { kind: 'collection' });
const note = book('note-book', { kind: 'note' });
const ai = book('ai', { kind: 'ai', scenario: '在便利店' });
const subtitle = book('subtitle', { kind: 'subtitle', fileName: 'ep1.srt' });
const unknown = book('unknown');
const books = [epub, text, url, collection, note, ai, subtitle, unknown];

test('sourceGroup maps every source kind to a library group', () => {
  assert.equal(sourceGroup(epub), 'book');
  assert.equal(sourceGroup(text), 'book');
  assert.equal(sourceGroup(url), 'link');
  assert.equal(sourceGroup(collection), 'collection');
  assert.equal(sourceGroup(note), 'note');
  assert.equal(sourceGroup(ai), 'ai');
  assert.equal(sourceGroup(subtitle), 'subtitle');
  assert.equal(sourceGroup(unknown), 'book');
});

test('sourceLabel gives the Chinese badge for each source', () => {
  assert.equal(sourceLabel(epub), 'EPUB');
  assert.equal(sourceLabel(text), '粘贴');
  assert.equal(sourceLabel(url), '链接');
  assert.equal(sourceLabel(collection), '合集');
  assert.equal(sourceLabel(note), 'note');
  assert.equal(sourceLabel(ai), 'AI 情景');
  assert.equal(sourceLabel(subtitle), '字幕');
  assert.equal(sourceLabel(unknown), '书');
});

test('isNoteBook only matches the note source', () => {
  assert.equal(isNoteBook(note), true);
  assert.equal(isNoteBook(epub), false);
  assert.equal(isNoteBook(unknown), false);
});

test('visibleBooks removes note books from the flat library', () => {
  assert.deepEqual(
    visibleBooks(books).map((item) => item.id),
    ['epub', 'text', 'url', 'collection', 'ai', 'subtitle', 'unknown']
  );
});

test('booksInGroup filters by group and keeps all for all', () => {
  assert.equal(booksInGroup(books, 'all').length, books.length);
  assert.deepEqual(
    booksInGroup(books, 'book').map((item) => item.id),
    ['epub', 'text', 'unknown']
  );
  assert.deepEqual(
    booksInGroup(books, 'link').map((item) => item.id),
    ['url']
  );
  assert.deepEqual(
    booksInGroup(books, 'collection').map((item) => item.id),
    ['collection']
  );
  assert.deepEqual(
    booksInGroup(books, 'note').map((item) => item.id),
    ['note-book']
  );
  assert.deepEqual(
    booksInGroup(books, 'ai').map((item) => item.id),
    ['ai']
  );
  assert.deepEqual(
    booksInGroup(books, 'subtitle').map((item) => item.id),
    ['subtitle']
  );
});
