import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePasteTargetId } from '../src/lib/import/pasteDestination';

const books = [{ id: 'book-a' }, { id: 'book-b' }];

test('paste target: the dialog opened for a book always appends to it', () => {
  assert.equal(
    resolvePasteTargetId({
      targetBookId: 'book-b',
      destination: 'new',
      selectedBookId: 'book-a',
      books,
    }),
    'book-b'
  );
});

test('paste target: the new-book destination never appends', () => {
  assert.equal(
    resolvePasteTargetId({
      destination: 'new',
      selectedBookId: 'book-b',
      books,
    }),
    undefined
  );
});

test('paste target: an existing destination uses the selected book', () => {
  assert.equal(
    resolvePasteTargetId({
      destination: 'existing',
      selectedBookId: 'book-b',
      books,
    }),
    'book-b'
  );
});

test('paste target: a stale selection falls back to the first book', () => {
  assert.equal(
    resolvePasteTargetId({
      destination: 'existing',
      selectedBookId: 'deleted-book',
      books,
    }),
    'book-a'
  );
});

test('paste target: no books means no append target', () => {
  assert.equal(
    resolvePasteTargetId({
      destination: 'existing',
      selectedBookId: 'book-a',
      books: [],
    }),
    undefined
  );
});
