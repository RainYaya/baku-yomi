import assert from 'node:assert/strict';
import test from 'node:test';
import { readAudioAsset } from '../src/lib/audio/asset';

function asset(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    book: {
      id: 'audiobook-mushoku-01',
      title: '無職転生 1',
      author: '理不尽な孫の手',
      importedAt: 1700000000000,
      chapters: [
        {
          id: 'audiobook-mushoku-01-ch0',
          title: '第一章',
          index: 0,
          pairs: [
            {
              id: 'audiobook-mushoku-01-ch0-p0',
              japanese: 'おはよう。',
              chinese: '',
              chapterIndex: 0,
              pairIndex: 0,
              startMs: 0,
              endMs: 2000,
            },
          ],
        },
      ],
    },
    audio: {
      chapters: [
        {
          index: 0,
          file: 'ch000.opus',
          startMs: 0,
          durationMs: 60000,
        },
      ],
    },
    ...overrides,
  };
}

test('reads an audio asset into a book with playable chapter files', () => {
  const book = readAudioAsset(JSON.parse(JSON.stringify(asset())), {
    base: '/api/audio/mushoku-01',
  });

  assert.ok(book);
  assert.equal(book.id, 'audiobook-mushoku-01');
  assert.equal(book.source?.kind, 'audiobook');
  assert.deepEqual(book.audio, {
    base: '/api/audio/mushoku-01',
    chapters: [
      { index: 0, file: 'ch000.opus', startMs: 0, durationMs: 60000 },
    ],
  });
  assert.equal(book.chapters[0].pairs[0].startMs, 0);
});

test('rejects an asset without a version or book', () => {
  assert.equal(readAudioAsset({ book: asset().book }, { base: '/a' }), null);
  assert.equal(readAudioAsset({ version: 1 }, { base: '/a' }), null);
  assert.equal(readAudioAsset(null, { base: '/a' }), null);
});

test('drops audio chapters that are malformed instead of losing the book', () => {
  const raw = asset();
  raw.audio.chapters = [
    { index: 0, file: 'ch000.opus', startMs: 0, durationMs: 60000 },
    { index: 'x', file: 42 },
  ];
  const book = readAudioAsset(raw, { base: '/api/audio/mushoku-01' });

  assert.ok(book);
  assert.equal(book.audio?.chapters.length, 1);
});

test('rejects a book whose chapters are not an array', () => {
  const raw = asset();
  raw.book.chapters = 'nope';
  assert.equal(readAudioAsset(raw, { base: '/a' }), null);
});
