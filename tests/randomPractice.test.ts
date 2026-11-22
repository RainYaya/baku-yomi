import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPracticePool,
  pickRandom,
  RANDOM_RECENT_LIMIT,
} from '../src/lib/practice/random';
import type { AnalysisResult, Book, SentencePair } from '../src/types';

const NOW = Date.parse('2026-11-20T12:00:00+09:00');

function pair(id: string, japanese: string): SentencePair {
  return { id, japanese, chinese: '', chapterIndex: 0, pairIndex: 0 };
}

function book(
  id: string,
  kind: 'text' | 'note',
  pairs: SentencePair[]
): Book {
  return {
    id,
    title: id,
    author: 'author',
    importedAt: NOW,
    source: { kind },
    chapters: [{ id: `${id}-ch0`, title: '第一章', index: 0, pairs }],
  };
}

function analysis(pairId: string, score: number): AnalysisResult {
  return {
    pairId,
    userTranslation: '',
    originalJapanese: '',
    score,
    errors: [],
    strengths: [],
    suggestions: [],
    rawMarkdown: '',
    analyzedAt: NOW,
  };
}

const books = [
  book('a', 'text', [
    pair('a1', '朝の散歩。'),
    pair('a2', '   '),
    pair('a3', '台所の窓。'),
  ]),
  book('note-book', 'note', [pair('n1', 'note の文。')]),
];

test('buildPracticePool includes every non-empty sentence and skips empty ones', () => {
  const pool = buildPracticePool(books, {}, {});
  assert.deepEqual(pool.map((item) => item.pairId), ['a1', 'a3', 'n1']);
  assert.equal(pool[0].practiced, false);
  assert.equal(pool[0].score, null);
});

test('buildPracticePool filters by source and book', () => {
  assert.deepEqual(
    buildPracticePool(books, { sourceGroup: 'note' }, {}).map(
      (item) => item.pairId
    ),
    ['n1']
  );
  assert.deepEqual(
    buildPracticePool(books, { bookId: 'a' }, {}).map((item) => item.pairId),
    ['a1', 'a3']
  );
});

test('buildPracticePool filters unpracticed and weak sentences', () => {
  const analyses = {
    a1: analysis('a1', 55),
    a3: analysis('a3', 90),
  };

  assert.deepEqual(
    buildPracticePool(books, { onlyUnpracticed: true }, analyses).map(
      (item) => item.pairId
    ),
    ['n1']
  );
  assert.deepEqual(
    buildPracticePool(books, { onlyWeak: true }, analyses).map(
      (item) => item.pairId
    ),
    ['a1']
  );
  assert.deepEqual(
    buildPracticePool(
      books,
      { onlyWeak: true, onlyUnpracticed: true },
      analyses
    ),
    []
  );
});

test('pickRandom avoids the most recent picks', () => {
  const pool = buildPracticePool(books, {}, {});
  const recent = ['a1', 'n1'];

  assert.equal(pickRandom(pool, recent, () => 0)?.pairId, 'a3');
});

test('pickRandom only looks at the last twenty recent picks', () => {
  const old = book('old', 'text', [pair('old-0', '古い文。')]);
  const pool = buildPracticePool([old, ...books], {}, {});
  const recent = ['old-0', ...Array.from({ length: 20 }, (_, index) => `r-${index}`)];

  assert.equal(pickRandom(pool, recent, () => 0)?.pairId, 'old-0');
  assert.equal(RANDOM_RECENT_LIMIT, 20);
});

test('pickRandom returns null for an empty pool and falls back when all are recent', () => {
  assert.equal(pickRandom([], [], () => 0), null);

  const pool = buildPracticePool(books, {}, {});
  const allRecent = pool.map((item) => item.pairId);
  assert.ok(pickRandom(pool, allRecent, () => 0));
});

test('pickRandom uses the provided rng deterministically', () => {
  const pool = buildPracticePool(books, {}, {});
  assert.equal(pickRandom(pool, [], () => 0)?.pairId, 'a1');
  assert.equal(pickRandom(pool, [], () => 0.99)?.pairId, 'n1');
});
