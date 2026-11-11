import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorCategoriesOf } from '../src/lib/analysis/errorCategories';
import type { AnalysisResult } from '../src/types';

function analysis(overrides: Partial<AnalysisResult>): AnalysisResult {
  return {
    pairId: 'book-ch0-p0',
    userTranslation: '',
    originalJapanese: '',
    score: 80,
    errors: [],
    strengths: [],
    suggestions: [],
    rawMarkdown: '',
    analyzedAt: 0,
    ...overrides,
  };
}

test('reads categories from structured errors first', () => {
  const result = analysis({
    errors: [
      {
        category: '助詞',
        userText: 'は',
        correctText: 'が',
        explanation: '',
      },
    ],
    rawMarkdown: '【错误与差异分析】\n#### 1. 時態：過去形の誤用',
  });

  assert.deepEqual(errorCategoriesOf(result), ['助詞', '時制']);
});

test('detects Chinese and traditional labels in the error section', () => {
  const result = analysis({
    rawMarkdown: [
      '【综合评分】70/100',
      '【错误与差异分析】',
      '#### 1. 時態：過去形の誤用',
      '#### 2. 词汇：用词不自然',
      '#### 3. 語順：语序需要调整',
      '【优点】',
      '文法の説明は分かりやすい。',
    ].join('\n'),
  });

  assert.deepEqual(errorCategoriesOf(result).sort(), ['時制', '語彙', '語順'].sort());
});

test('does not read category words from the strengths section', () => {
  const result = analysis({
    rawMarkdown: [
      '【错误与差异分析】',
      '#### 1. 语序：需要调整',
      '【优点】',
      '词汇丰富，表达自然。',
    ].join('\n'),
  });

  assert.deepEqual(errorCategoriesOf(result), ['語順']);
});

test('falls back to the whole markdown when the section is missing', () => {
  const result = analysis({ rawMarkdown: '助詞の使い方に注意。' });
  assert.deepEqual(errorCategoriesOf(result), ['助詞']);
});
