import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractArticle } from '../server/routes/fetchUrl';

const fixture = readFileSync(
  new URL('./fixtures/fetch/article.html', import.meta.url),
  'utf8'
);

test('extractArticle keeps the body and returns the title separately', () => {
  const { title, text } = extractArticle(fixture);

  assert.equal(title, '記事タイトル');
  assert.match(text, /これは本文の最初の段落です/);
  assert.match(text, /二つ目の段落です/);
});

test('extractArticle drops navigation, title duplicate, share, related links and footer', () => {
  const { text } = extractArticle(fixture);

  assert.doesNotMatch(text, /ホーム|ログイン/);
  assert.doesNotMatch(text, /記事タイトル/);
  assert.doesNotMatch(text, /Share|印刷する|ブックマーク/);
  assert.doesNotMatch(text, /関連記事|別の記事へのリンク/);
  assert.doesNotMatch(text, /著作権|無断転載/);
});

test('extractArticle treats zero-width separators as line breaks', () => {
  const html = `<html><head><title>区切り</title></head><body><article><div>${'最初の段落です。'.repeat(5)}\u200b${'二番目の段落です。'.repeat(5)}</div></article></body></html>`;

  const { text } = extractArticle(html);

  assert.ok(text.split('\n').length >= 2);
  assert.doesNotMatch(text, /\u200b/);
});

test('extractArticle keeps line breaks marked by <br>', () => {
  const html = `<html><head><title>改行</title></head><body><article><p>${'最初の段落です。'.repeat(5)}<br>${'二番目の段落です。'.repeat(5)}</p></article></body></html>`;

  const { text } = extractArticle(html);

  assert.deepEqual(text.split('\n').filter(Boolean), [
    '最初の段落です。'.repeat(5),
    '二番目の段落です。'.repeat(5),
  ]);
});

test('extractArticle drops a trailing recommendation block', () => {
  const html = `<html><head><title>おすすめ</title></head><body><article><p>${'本文です。'.repeat(20)}</p><p>◯こちらもおすすめ音楽で落ち着くのもいいですよね。</p></article></body></html>`;

  const { text } = extractArticle(html);

  assert.doesNotMatch(text, /こちらもおすすめ/);
});

test('extractArticle still returns readable text for a page without an article tag', () => {
  const { title, text } = extractArticle(
    '<html><head><title>短文</title></head><body><p>本文だけのページです。</p></body></html>'
  );

  assert.equal(title, '短文');
  assert.match(text, /本文だけのページです/);
});
