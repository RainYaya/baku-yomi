import assert from 'node:assert/strict';
import test from 'node:test';
import { bookmarkedHtml, escapeHtml } from '../src/lib/textMarkup';

const colors = [
  { id: 'red', bg: 'rgba(220, 38, 38, 0.25)', border: 'rgba(220, 38, 38, 0.5)' },
];

test('escapeHtml neutralizes HTML in imported text', () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
  );
});

test('bookmarkedHtml escapes text outside and inside a mark', () => {
  const html = bookmarkedHtml(
    'a<img src=x>b',
    [
      {
        startOffset: 1,
        endOffset: 11,
        colorId: 'red',
      },
    ],
    colors
  );

  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
  assert.match(html, /<mark style=/);
});

test('bookmarkedHtml applies multiple marks without re-reading offsets', () => {
  const html = bookmarkedHtml(
    'abcdef',
    [
      { startOffset: 1, endOffset: 3, colorId: 'red' },
      { startOffset: 4, endOffset: 5, colorId: 'red' },
    ],
    colors
  );

  assert.equal(
    html,
    'a<mark style="background-color: rgba(220, 38, 38, 0.25); border-bottom: 2px solid rgba(220, 38, 38, 0.5);">bc</mark>d<mark style="background-color: rgba(220, 38, 38, 0.25); border-bottom: 2px solid rgba(220, 38, 38, 0.5);">e</mark>f'
  );
});
