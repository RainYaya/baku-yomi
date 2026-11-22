import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractNoteArticle } from '../server/note/article';

const okHtml = readFileSync(
  new URL('./fixtures/note/article.html', import.meta.url),
  'utf8'
);
const paidHtml = readFileSync(
  new URL('./fixtures/note/article-paid.html', import.meta.url),
  'utf8'
);
const emptyHtml = readFileSync(
  new URL('./fixtures/note/article-empty.html', import.meta.url),
  'utf8'
);

test('extractNoteArticle reads JSON-LD metadata and note-body paragraphs', () => {
  const article = extractNoteArticle(okHtml, 'https://note.com/onniilgi/n/nspring');

  assert.equal(article.status, 'ok');
  assert.equal(article.title, '春の台所から');
  assert.equal(article.author, 'onniilgi');
  assert.equal(article.publishedAt, Date.parse('2026-04-02T08:15:00+09:00'));
  assert.deepEqual(article.tags, ['暮らし', '料理', '春']);
  assert.deepEqual(article.paragraphs, [
    '三月の終わり、台所の窓を開けると、まだ冷たい風が入ってくる。',
    'それでも日差しだけは春で、野菜の色が少しずつ明るくなっていく。',
    '朝ごはんの支度',
    '卵をひとつ',
    'トーストとコーヒー',
    '焦がしたバターの匂いが部屋に広がる。',
    'しばらくぼんやりしてから、窓を閉めた。',
  ]);
  assert.equal(article.text, article.paragraphs.join('\n'));
  assert.ok(!article.text.includes('サポート'));
  assert.ok(!article.text.includes('フッター'));
  assert.ok(!article.text.includes('__note'));
  assert.ok(!article.text.includes('1'));
});

test('extractNoteArticle marks paywalled articles as partial and drops the paywall block', () => {
  const article = extractNoteArticle(
    paidHtml,
    'https://note.com/paidwriter/n/npaid'
  );

  assert.equal(article.status, 'partial');
  assert.equal(article.author, 'paidwriter');
  assert.equal(article.paragraphs.length, 1);
  assert.ok(article.paragraphs[0].startsWith('この記事では'));
  assert.ok(!article.text.includes('有料'));
});

test('extractNoteArticle returns empty when there is no public body', () => {
  const article = extractNoteArticle(emptyHtml, 'https://note.com/x/n/nempty');

  assert.equal(article.status, 'empty');
  assert.deepEqual(article.paragraphs, []);
  assert.equal(article.text, '');
});

test('extractNoteArticle falls back to the article element', () => {
  const html = `<html><head><title>予備の記事</title></head><body>
    <article><p>${'フォールバックの本文です。'.repeat(8)}</p></article>
  </body></html>`;

  const article = extractNoteArticle(html, 'https://note.com/x/n/nfallback');

  assert.equal(article.status, 'ok');
  assert.equal(article.title, '予備の記事');
  assert.equal(article.paragraphs.length, 1);
  assert.ok(article.paragraphs[0].includes('フォールバックの本文'));
});
