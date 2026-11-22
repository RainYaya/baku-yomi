import assert from 'node:assert/strict';
import test from 'node:test';
import {
  excerptFromHtml,
  filterFeed,
  mergeFeeds,
  normalizeNoteUrl,
  relativeNoteTime,
  unreadCount,
} from '../src/lib/note/feed';
import type { NoteFeedItem, NoteSource, NoteSourceCache } from '../src/types/note';

const NOW = Date.parse('2026-11-19T12:00:00+09:00');

function item(overrides: Partial<NoteFeedItem> = {}): NoteFeedItem {
  return {
    url: 'https://note.com/a/n/n1',
    title: 'タイトル',
    author: 'a',
    publishedAt: NOW,
    excerpt: '本文',
    sourceId: 'hashtag:エッセイ',
    ...overrides,
  };
}

function source(overrides: Partial<NoteSource> = {}): NoteSource {
  return {
    id: 'hashtag:エッセイ',
    kind: 'hashtag',
    key: 'エッセイ',
    label: '#エッセイ',
    enabled: true,
    addedAt: NOW,
    ...overrides,
  };
}

function cache(sourceId: string, items: NoteFeedItem[]): NoteSourceCache {
  return { sourceId, items, fetchedAt: NOW };
}

test('normalizeNoteUrl drops query, hash and trailing slash', () => {
  assert.equal(
    normalizeNoteUrl('https://NOTE.com/a/n/n1/?from=feed#comments'),
    'https://note.com/a/n/n1'
  );
  assert.equal(normalizeNoteUrl('  https://note.com/a/n/n1  '), 'https://note.com/a/n/n1');
  assert.equal(normalizeNoteUrl('not a url'), 'not a url');
});

test('mergeFeeds keeps enabled sources, dedupes by URL and sorts newest first', () => {
  const sources = [
    source(),
    source({ id: 'author:b', kind: 'author', key: 'b', label: 'b' }),
    source({
      id: 'hashtag:暮らし',
      key: '暮らし',
      label: '#暮らし',
      enabled: false,
    }),
  ];

  const merged = mergeFeeds(
    {
      'hashtag:エッセイ': cache('hashtag:エッセイ', [
        item({ url: 'https://note.com/a/n/n1?from=feed', publishedAt: NOW - 1000 }),
        item({ url: 'https://note.com/a/n/n2', publishedAt: NOW - 3000 }),
        item({
          url: 'https://note.com/a/n/blocked',
          title: '政治について',
          publishedAt: NOW - 500,
        }),
        item({ url: 'https://note.com/a/n/hidden', publishedAt: NOW - 400 }),
      ]),
      'author:b': cache('author:b', [
        item({
          url: 'https://note.com/a/n/n1',
          publishedAt: NOW - 9000,
          sourceId: 'author:b',
        }),
        item({
          url: 'https://note.com/a/n/n3',
          publishedAt: NOW - 2000,
          sourceId: 'author:b',
        }),
      ]),
      'hashtag:暮らし': cache('hashtag:暮らし', [
        item({ url: 'https://note.com/a/n/n4', sourceId: 'hashtag:暮らし' }),
      ]),
    },
    sources,
    {
      hiddenUrls: ['https://note.com/a/n/hidden?from=feed'],
      blockedKeywords: ['政治'],
    }
  );

  assert.deepEqual(
    merged.map((entry) => [entry.url, entry.sourceId]),
    [
      ['https://note.com/a/n/n1?from=feed', 'hashtag:エッセイ'],
      ['https://note.com/a/n/n3', 'author:b'],
      ['https://note.com/a/n/n2', 'hashtag:エッセイ'],
    ]
  );
});

test('mergeFeeds caps the merged feed at 120 items', () => {
  const items = Array.from({ length: 130 }, (_, index) =>
    item({
      url: `https://note.com/a/n/n${index}`,
      publishedAt: NOW - index,
    })
  );

  const merged = mergeFeeds(
    { 'hashtag:エッセイ': cache('hashtag:エッセイ', items) },
    [source()]
  );

  assert.equal(merged.length, 120);
  assert.equal(merged[0].url, 'https://note.com/a/n/n0');
  assert.equal(merged.at(-1)?.url, 'https://note.com/a/n/n119');
});

test('filterFeed drops hidden, blocked and disabled-source items', () => {
  const items = [
    item({ url: 'https://note.com/a/n/n1' }),
    item({ url: 'https://note.com/a/n/n2', title: '選挙の話' }),
    item({ url: 'https://note.com/a/n/n3' }),
    item({ url: 'https://note.com/a/n/n4', sourceId: 'author:b' }),
  ];

  const filtered = filterFeed(items, {
    hiddenUrls: ['https://note.com/a/n/n3#top'],
    blockedKeywords: ['選挙'],
    sources: [
      source(),
      source({ id: 'author:b', kind: 'author', key: 'b', label: 'b', enabled: false }),
    ],
  });

  assert.deepEqual(filtered.map((entry) => entry.url), ['https://note.com/a/n/n1']);
});

test('unreadCount ignores read and hidden-normalized URLs', () => {
  const items = [
    item({ url: 'https://note.com/a/n/n1' }),
    item({ url: 'https://note.com/a/n/n2' }),
  ];

  assert.equal(
    unreadCount(items, { 'https://note.com/a/n/n1?from=feed': NOW }),
    1
  );
  assert.equal(unreadCount([], {}), 0);
});

test('excerptFromHtml strips markup and decodes entities', () => {
  const excerpt = excerptFromHtml(
    '<p>朝の<strong>空気</strong>は &amp; とても&#39;いい&#39;。</p>'
  );
  assert.equal(excerpt, "朝の空気は & とても'いい'。");
  assert.equal(excerptFromHtml(`<p>${'あ'.repeat(200)}</p>`).length, 180);
});

test('relativeNoteTime uses Chinese buckets and falls back to a date', () => {
  assert.equal(relativeNoteTime(NOW - 30_000, NOW), '刚刚');
  assert.equal(relativeNoteTime(NOW - 5 * 60_000, NOW), '5 分钟前');
  assert.equal(relativeNoteTime(NOW - 3 * 3600_000, NOW), '3 小时前');
  assert.equal(relativeNoteTime(NOW - 2 * 86400_000, NOW), '2 天前');
  assert.match(relativeNoteTime(NOW - 40 * 86400_000, NOW), /^\d{4}\/\d{1,2}\/\d{1,2}$/);
});
