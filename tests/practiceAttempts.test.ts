import assert from 'node:assert/strict';
import test from 'node:test';
import { usePracticeStore } from '../src/stores/practiceSlice';
import {
  MAX_ATTEMPTS_PER_SENTENCE,
  attemptsFromLegacy,
} from '../src/lib/practice/journal';
import type { AnalysisResult } from '../src/types';

function analysis(
  pairId: string,
  score: number,
  at: number,
  userTranslation = ''
): AnalysisResult {
  return {
    pairId,
    userTranslation,
    originalJapanese: '原文',
    score,
    errors: [],
    strengths: [],
    suggestions: [],
    rawMarkdown: '',
    analyzedAt: at,
  };
}

function reset() {
  usePracticeStore.setState({
    translations: {},
    analyses: {},
    notes: {},
    hints: {},
    explanations: {},
    attempts: {},
  });
}

test('setAnalysis appends an attempt and keeps the last ten', () => {
  reset();
  const store = usePracticeStore.getState();

  for (let index = 0; index < 12; index += 1) {
    store.setTranslation('book-ch0-p0', `draft-${index}`);
    store.setAnalysis(
      'book-ch0-p0',
      analysis('book-ch0-p0', index, 1_000 + index, `submitted-${index}`)
    );
  }

  const state = usePracticeStore.getState();
  const attempts = state.attempts['book-ch0-p0'];

  assert.equal(attempts.length, MAX_ATTEMPTS_PER_SENTENCE);
  assert.equal(attempts[0].translation, 'submitted-2');
  assert.equal(attempts.at(-1)?.translation, 'submitted-11');
  assert.equal(attempts.at(-1)?.at, 1_011);
  assert.equal(state.analyses['book-ch0-p0'].score, 11);
});

test('setAnalysis falls back to the translation draft when the result has none', () => {
  reset();
  const store = usePracticeStore.getState();

  store.setTranslation('book-ch0-p1', 'typed translation');
  store.setAnalysis('book-ch0-p1', analysis('book-ch0-p1', 70, 2_000));

  const attempt = usePracticeStore.getState().attempts['book-ch0-p1'][0];
  assert.equal(attempt.translation, 'typed translation');
});

test('attemptsFromLegacy seeds one attempt per old analysis', () => {
  const attempts = attemptsFromLegacy(
    {
      a: analysis('a', 55, 1_000, 'from result'),
      b: analysis('b', 80, 2_000),
    },
    { a: 'from store', b: 'stored b' }
  );

  assert.deepEqual(Object.keys(attempts).sort(), ['a', 'b']);
  assert.equal(attempts.a.length, 1);
  assert.equal(attempts.a[0].translation, 'from result');
  assert.equal(attempts.a[0].at, 1_000);
  assert.equal(attempts.b[0].translation, 'stored b');
});

test('clearPracticeData also clears attempt history', () => {
  reset();
  usePracticeStore.getState().setAnalysis('a', analysis('a', 50, 1_000));
  assert.equal(usePracticeStore.getState().attempts.a.length, 1);

  usePracticeStore.getState().clearPracticeData();
  assert.deepEqual(usePracticeStore.getState().attempts, {});
});
