import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoLibrary } from '../src/lib/seed/demoLibrary';

test('builds a small first-run shelf with stable ids', () => {
  const first = buildDemoLibrary();
  const second = buildDemoLibrary();

  assert.equal(first.length, 3);
  assert.deepEqual(
    first.map((book) => book.id),
    ['seed-asa-short', 'seed-neko', 'seed-meros']
  );
  assert.deepEqual(
    first.map((book) => book.id),
    second.map((book) => book.id)
  );
  assert.ok(first.every((book) => book.demo === true));
});

test('seeds the collection with five articles and a reusable chapter sequence', () => {
  const collection = buildDemoLibrary()[0];

  assert.equal(collection.source?.kind, 'collection');
  assert.equal(collection.chapters.length, 5);
  assert.equal(collection.chapterSeq, 5);
  assert.deepEqual(
    collection.chapters.map((chapter) => chapter.title),
    ['朝の光', '言葉の温度', '道草', '雨の日', '手紙']
  );
});

test('every seeded pair is bilingual and globally unique', () => {
  const books = buildDemoLibrary();
  const ids = new Set<string>();

  for (const book of books) {
    for (const chapter of book.chapters) {
      assert.ok(chapter.pairs.length > 0, `${book.id} / ${chapter.title} is empty`);
      for (const pair of chapter.pairs) {
        assert.ok(pair.japanese.trim(), `${pair.id} has no Japanese`);
        assert.ok(pair.chinese.trim(), `${pair.id} has no Chinese`);
        assert.equal(pair.translationSource, 'imported');
        assert.ok(!ids.has(pair.id), `duplicate pair id ${pair.id}`);
        ids.add(pair.id);
      }
    }
  }
});
