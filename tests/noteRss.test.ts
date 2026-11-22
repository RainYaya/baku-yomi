import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { noteRssUrl, parseNoteRss } from '../server/note/rss';

const authorXml = readFileSync(
  new URL('./fixtures/note/author.rss.xml', import.meta.url),
  'utf8'
);
const hashtagXml = readFileSync(
  new URL('./fixtures/note/hashtag.rss.xml', import.meta.url),
  'utf8'
);

test('noteRssUrl builds author and hashtag feed URLs', () => {
  assert.equal(
    noteRssUrl({ kind: 'author', key: 'seoyun' }),
    'https://note.com/seoyun/rss'
  );
  assert.equal(
    noteRssUrl({ kind: 'hashtag', key: 'エッセイ' }),
    'https://note.com/hashtag/%E3%82%A8%E3%83%83%E3%82%BB%E3%82%A4/rss'
  );
});

test('parseNoteRss reads author items, CDATA, entities and dates', () => {
  const items = parseNoteRss(authorXml, { kind: 'author', key: 'seoyun' });

  assert.equal(items.length, 2);
  assert.equal(items[0].title, '朝の散歩と、小さな発見');
  assert.equal(items[0].url, 'https://note.com/seoyun/n/n1234abcd');
  assert.equal(items[0].author, 'seoyun');
  assert.equal(items[0].publishedAt, Date.parse('Tue, 18 Nov 2026 09:00:00 +0900'));
  assert.equal(items[0].excerpt, '朝の空気はひんやりしていて、& とても気持ちがいい。');
  assert.equal(items[0].sourceId, 'author:seoyun');

  assert.equal(items[1].title, 'CDATA と実体 & のテスト');
  assert.equal(items[1].url, 'https://note.com/seoyun/n/n5678efgh');
  assert.equal(items[1].excerpt, '夕飯は<カレー>にした。 おいしかった。');
});

test('parseNoteRss reads a namespaced creator from a hashtag feed', () => {
  const items = parseNoteRss(hashtagXml, { kind: 'hashtag', key: 'エッセイ' });

  assert.equal(items.length, 1);
  assert.equal(items[0].author, 'mika');
  assert.equal(items[0].excerpt, '毎日の暮らしで見つけた工夫をまとめます。');
  assert.equal(items[0].sourceId, 'hashtag:エッセイ');
});

test('parseNoteRss skips unusable items instead of throwing', () => {
  assert.deepEqual(parseNoteRss('<rss><channel><item></item></channel></rss>', {
    kind: 'hashtag',
    key: '暮らし',
  }), []);

  assert.deepEqual(parseNoteRss('not xml at all', {
    kind: 'author',
    key: 'seoyun',
  }), []);
});
