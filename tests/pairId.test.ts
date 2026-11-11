import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPairId,
  legacyPairIndex,
  scopePairIds,
} from '../src/lib/epub/pairId';
import type { SentencePair } from '../src/types';

const pair = (pairIndex: number): SentencePair => ({
  id: `ch0-p${pairIndex}`,
  japanese: `文${pairIndex}`,
  chinese: '',
  chapterIndex: 0,
  pairIndex,
});

test('createPairId scopes the id to the book', () => {
  assert.equal(createPairId('book-a', 2, 7), 'book-a-ch2-p7');
  assert.notEqual(
    createPairId('book-a', 0, 0),
    createPairId('book-b', 0, 0)
  );
});

test('scopePairIds rewrites every pair without dropping fields', () => {
  const scoped = scopePairIds([pair(0), pair(1)], 'book-a', 3);
  assert.deepEqual(
    scoped.map((item) => item.id),
    ['book-a-ch3-p0', 'book-a-ch3-p1']
  );
  assert.equal(scoped[0].japanese, '文0');
  assert.equal(scoped[0].chapterIndex, 3);
});

test('legacyPairIndex only matches the old book-less shape', () => {
  assert.equal(legacyPairIndex('ch0-p12'), 12);
  assert.equal(legacyPairIndex('book-a-ch0-p12'), null);
  assert.equal(legacyPairIndex('ch0-p'), null);
});
