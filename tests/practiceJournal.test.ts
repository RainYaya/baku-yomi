import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildJournalEntries,
  filterJournalEntries,
  journalSummary,
  type PracticeAttempt,
} from '../src/lib/practice/journal';
import type { AnalysisResult, Book, SentencePair } from '../src/types';

const NOW = Date.parse('2026-11-19T12:00:00+09:00');
const HOUR = 3600_000;
const DAY = 24 * HOUR;

function pair(id: string, japanese: string, chinese: string): SentencePair {
  return { id, japanese, chinese, chapterIndex: 0, pairIndex: 0 };
}

function book(
  id: string,
  title: string,
  kind: 'text' | 'note',
  pairs: SentencePair[]
): Book {
  return {
    id,
    title,
    author: 'author',
    importedAt: NOW,
    source: { kind },
    chapters: [{ id: `${id}-ch0`, title: '第一章', index: 0, pairs }],
  };
}

function analysis(
  pairId: string,
  score: number,
  at: number,
  userTranslation = '',
  category?: AnalysisResult['errors'][number]['category']
): AnalysisResult {
  return {
    pairId,
    userTranslation,
    originalJapanese: '',
    score,
    errors: category
      ? [{ category, userText: '', correctText: '', explanation: '' }]
      : [],
    strengths: [],
    suggestions: [],
    rawMarkdown: '',
    analyzedAt: at,
  };
}

function attempt(
  translation: string,
  score: number,
  at: number,
  pairId = 'p1'
): PracticeAttempt {
  return { translation, analysis: analysis(pairId, score, at), at };
}

const books = [
  book('a', '随筆', 'text', [
    pair('p1', '朝の散歩は気持ちがいい。', '早上散步很舒服。'),
    pair('p2', '台所の窓を開けた。', '打开了厨房的窗户。'),
  ]),
  book('note-book', 'note', 'note', [
    pair('n1', 'note の短い文です。', 'note 的短文。'),
  ]),
];

const analyses = {
  p1: analysis('p1', 55, NOW - HOUR, 'latest p1', '助詞'),
  p2: analysis('p2', 90, NOW - 2 * DAY, 'latest p2'),
  n1: analysis('n1', 65, NOW - 10 * DAY, 'latest n1', '語彙'),
};

const translations = {
  p1: 'translation one',
  p2: 'translation two',
  n1: 'translation note',
};

const attempts = {
  p1: [
    attempt('first try', 40, NOW - 3 * HOUR),
    attempt('second try', 55, NOW - HOUR),
  ],
  n1: [attempt('note try', 65, NOW - 10 * DAY, 'n1')],
};

test('buildJournalEntries includes every book, note included, newest first', () => {
  const entries = buildJournalEntries(books, analyses, translations, attempts);

  assert.deepEqual(entries.map((entry) => entry.pairId), ['p1', 'p2', 'n1']);
  assert.equal(entries[0].attemptCount, 2);
  assert.deepEqual(
    entries[0].attempts.map((item) => item.translation),
    ['first try', 'second try']
  );
  assert.equal(entries[0].translation, 'translation one');
  assert.equal(entries[0].book.id, 'a');

  const note = entries[2];
  assert.equal(note.book.id, 'note-book');
  assert.equal(note.book.source?.kind, 'note');
});

test('buildJournalEntries seeds one attempt for a sentence without history', () => {
  const entries = buildJournalEntries(books, analyses, translations, {});
  const p2 = entries.find((entry) => entry.pairId === 'p2');

  assert.equal(p2?.attemptCount, 1);
  assert.equal(p2?.attempts[0].translation, 'latest p2');
});

test('filterJournalEntries filters by book, source, band, error, date and search', () => {
  const entries = buildJournalEntries(books, analyses, translations, attempts);

  assert.deepEqual(
    filterJournalEntries(entries, { bookId: 'a' }).map((entry) => entry.pairId),
    ['p1', 'p2']
  );
  assert.deepEqual(
    filterJournalEntries(entries, { source: 'note' }).map((entry) => entry.pairId),
    ['n1']
  );
  assert.deepEqual(
    filterJournalEntries(entries, { band: 'weak' }).map((entry) => entry.pairId),
    ['p1', 'n1']
  );
  assert.deepEqual(
    filterJournalEntries(entries, { error: '語彙' }).map((entry) => entry.pairId),
    ['n1']
  );
  assert.deepEqual(
    filterJournalEntries(entries, { query: 'first try' }).map((entry) => entry.pairId),
    ['p1']
  );
  assert.deepEqual(
    filterJournalEntries(entries, { query: '厨房' }).map((entry) => entry.pairId),
    ['p2']
  );
  assert.deepEqual(
    filterJournalEntries(entries, { since: NOW - 2 * DAY }).map(
      (entry) => entry.pairId
    ),
    ['p1', 'p2']
  );
  assert.deepEqual(
    filterJournalEntries(entries, { until: NOW - 3 * DAY }).map(
      (entry) => entry.pairId
    ),
    ['n1']
  );
});

test('filterJournalEntries sorts by lowest score when asked', () => {
  const entries = buildJournalEntries(books, analyses, translations, attempts);
  assert.deepEqual(
    filterJournalEntries(entries, { sortBy: 'score' }).map(
      (entry) => entry.score
    ),
    [55, 65, 90]
  );
});

test('journalSummary counts attempts, sentences, materials, weak and this week', () => {
  const entries = buildJournalEntries(books, analyses, translations, attempts);
  assert.deepEqual(journalSummary(entries, NOW), {
    totalAttempts: 4,
    uniqueSentences: 3,
    materials: 2,
    weak: 2,
    thisWeek: 3,
  });
});
