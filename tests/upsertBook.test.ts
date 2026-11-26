import assert from 'node:assert/strict';
import test from 'node:test';
import type { Book } from '../src/types';
import { upsertBook } from '../src/lib/library/books';

function book(id: string, title: string): Book {
  return { id, title, author: '', importedAt: 0, chapters: [] };
}

test('a new book is appended at the end', () => {
  const books = [book('a', 'A'), book('b', 'B')];

  const next = upsertBook(books, book('c', 'C'));

  assert.deepEqual(
    next.map((item) => item.id),
    ['a', 'b', 'c']
  );
});

test('an existing id is replaced in place instead of duplicated', () => {
  const books = [book('a', 'A'), book('b', 'B'), book('c', 'C')];

  const next = upsertBook(books, book('b', 'B 新'));

  assert.deepEqual(
    next.map((item) => item.id),
    ['a', 'b', 'c']
  );
  assert.equal(next[1].title, 'B 新');
});

test('replacing does not mutate the previous list', () => {
  const books = [book('a', 'A')];

  upsertBook(books, book('a', 'A2'));

  assert.equal(books[0].title, 'A');
});
