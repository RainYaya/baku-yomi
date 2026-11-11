import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Book } from '../src/types';
import {
  buildPairMigrationMap,
  migrateBookPairIds,
  migrateBookmarkPairId,
  migrateKeyedRecord,
  migratePracticeData,
} from '../src/lib/pairMigration';

function book(id: string, japanese: string): Book {
  return {
    id,
    title: id,
    author: '',
    importedAt: 0,
    chapters: [
      {
        id: `${id}-ch0`,
        title: '第一章',
        index: 0,
        pairs: [
          {
            id: 'ch0-p0',
            japanese,
            chinese: '',
            chapterIndex: 0,
            pairIndex: 0,
          },
        ],
      },
    ],
  };
}

test('migrateBookPairIds makes colliding legacy ids unique', () => {
  const a = migrateBookPairIds(book('book-a', 'A'));
  const b = migrateBookPairIds(book('book-b', 'B'));

  assert.equal(a.chapters[0].pairs[0].id, 'book-a-ch0-p0');
  assert.equal(b.chapters[0].pairs[0].id, 'book-b-ch0-p0');
  assert.notEqual(
    a.chapters[0].pairs[0].id,
    b.chapters[0].pairs[0].id
  );
});

test('ambiguous legacy practice keys prefer the current book', () => {
  const books = [book('book-a', 'A'), book('book-b', 'B')];
  const refs = buildPairMigrationMap(books);

  const migrated = migrateKeyedRecord(
    { 'ch0-p0': 'my draft' },
    refs,
    { currentBookId: 'book-b' }
  );

  assert.deepEqual(migrated, { 'book-b-ch0-p0': 'my draft' });
});

test('analysis text disambiguates an old key across books', () => {
  const books = [book('book-a', 'A'), book('book-b', 'B')];
  const refs = buildPairMigrationMap(books);

  const migrated = migrateKeyedRecord(
    { 'ch0-p0': { originalJapanese: 'B', score: 80 } },
    refs,
    {
      currentBookId: 'book-a',
      matchJapanese: (value) => value.originalJapanese,
    }
  );

  assert.deepEqual(migrated, {
    'book-b-ch0-p0': { originalJapanese: 'B', score: 80 },
  });
});

test('hint suffixes survive pair id migration', () => {
  const books = [book('book-a', 'A')];
  const refs = buildPairMigrationMap(books);

  const migrated = migrateKeyedRecord(
    { 'ch0-p0_hint': 'hint text' },
    refs,
    { currentBookId: 'book-a' }
  );

  assert.deepEqual(migrated, { 'book-a-ch0-p0_hint': 'hint text' });
});

test('modern scoped ids are left untouched', () => {
  const books = [book('book-a', 'A')];
  const refs = buildPairMigrationMap(books);

  const migrated = migrateKeyedRecord(
    { 'book-a-ch0-p0': 'already scoped' },
    refs,
    { currentBookId: 'book-a' }
  );

  assert.deepEqual(migrated, { 'book-a-ch0-p0': 'already scoped' });
});

test('bookmarks migrate from their exact chapter id', () => {
  assert.equal(
    migrateBookmarkPairId('book-a-ch4', 'ch4-p9'),
    'book-a-ch4-p9'
  );
  assert.equal(
    migrateBookmarkPairId('book-a-ch4', 'book-a-ch4-p9'),
    'book-a-ch4-p9'
  );
});

test('migratePracticeData rewrites every practice map', () => {
  const books = [book('book-a', 'A')];
  const migrated = migratePracticeData(
    {
      translations: { 'ch0-p0': 'draft' },
      analyses: { 'ch0-p0': { originalJapanese: 'A', score: 90 } },
      notes: { 'ch0-p0': 'note' },
      hints: { 'ch0-p0_hint': 'hint' },
    },
    books,
    'book-a'
  );

  assert.deepEqual(migrated.translations, { 'book-a-ch0-p0': 'draft' });
  assert.deepEqual(migrated.analyses, {
    'book-a-ch0-p0': { originalJapanese: 'A', score: 90 },
  });
  assert.deepEqual(migrated.notes, { 'book-a-ch0-p0': 'note' });
  assert.deepEqual(migrated.hints, { 'book-a-ch0-p0_hint': 'hint' });
});
