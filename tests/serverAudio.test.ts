import assert from 'node:assert/strict';
import test from 'node:test';
import {
  listServerAudio,
  loadServerAudio,
} from '../src/lib/audio/serverAssets';

function jsonFetcher(body: unknown, ok = true): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
}

const ASSET = {
  version: 1,
  book: {
    id: 'mushoku-02',
    title: '無職転生 2',
    author: '理不尽な孫の手',
    chapters: [
      {
        index: 0,
        id: 'mushoku-02-ch0',
        title: '第一話',
        pairs: [{ id: 'p0', japanese: 'はい。', chinese: '', chapterIndex: 0, pairIndex: 0 }],
      },
    ],
  },
  audio: {
    chapters: [{ index: 0, file: 'ch000.opus', startMs: 0, durationMs: 1000 }],
  },
};

test('lists the audiobook assets a server holds', async () => {
  const assets = await listServerAudio(
    jsonFetcher({
      assets: [
        {
          id: 'mushoku-02',
          title: '無職転生 2',
          author: '理不尽な孫の手',
          durationMs: 1000,
          sizeBytes: 2048,
        },
      ],
    })
  );

  assert.equal(assets.length, 1);
  assert.deepEqual(assets[0], {
    id: 'mushoku-02',
    title: '無職転生 2',
    author: '理不尽な孫の手',
    durationMs: 1000,
    sizeBytes: 2048,
  });
});

test('a failed or malformed list is an empty list, not a throw', async () => {
  assert.deepEqual(await listServerAudio(jsonFetcher({}, false)), []);
  assert.deepEqual(await listServerAudio(jsonFetcher({ nope: true })), []);
  const broken = (async () => new Response('not json')) as typeof fetch;
  assert.deepEqual(await listServerAudio(broken), []);
});

test('loads an asset as a book whose audio base is the asset directory', async () => {
  const book = await loadServerAudio('mushoku-02', jsonFetcher(ASSET));

  assert.ok(book);
  assert.equal(book.id, 'mushoku-02');
  assert.equal(book.title, '無職転生 2');
  assert.equal(book.audio?.base, '/api/audio/mushoku-02');
  assert.equal(book.audio?.chapters[0].file, 'ch000.opus');
  assert.equal(book.chapters.length, 1);
});

test('refuses ids that would escape the asset directory, without fetching', async () => {
  let called = false;
  const fetcher = (async () => {
    called = true;
    return new Response('{}');
  }) as typeof fetch;

  assert.equal(await loadServerAudio('../secrets', fetcher), null);
  assert.equal(called, false);
});

test('a missing or malformed asset is null', async () => {
  assert.equal(await loadServerAudio('mushoku-02', jsonFetcher({}, false)), null);
  assert.equal(await loadServerAudio('mushoku-02', jsonFetcher({ version: 7 })), null);
});
