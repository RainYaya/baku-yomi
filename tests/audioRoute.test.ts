import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createAudioRoute, parseRange } from '../server/routes/audio';

const ASSET = {
  version: 1,
  book: {
    id: 'audiobook-sample',
    title: '样本书',
    author: '作者',
    importedAt: 0,
    chapters: [],
  },
  audio: {
    chapters: [
      { index: 0, file: 'ch000.opus', startMs: 0, durationMs: 60000 },
    ],
  },
};

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'baku-audio-test-'));
  mkdirSync(join(dir, 'sample'));
  writeFileSync(join(dir, 'sample', 'asset.json'), JSON.stringify(ASSET));
  writeFileSync(join(dir, 'sample', 'ch000.opus'), Buffer.from('0123456789'));
  return { dir, app: createAudioRoute({ dir }) };
}

test('lists assets that have a readable asset.json', async () => {
  const { app } = setup();
  const response = await app.request('/audio/list');
  assert.equal(response.status, 200);

  const body = (await response.json()) as {
    assets: { id: string; title: string; sizeBytes: number }[];
  };
  assert.deepEqual(
    body.assets.map((asset) => [asset.id, asset.title, asset.sizeBytes]),
    [['sample', '样本书', 10]]
  );
});

test('serves asset.json', async () => {
  const { app } = setup();
  const response = await app.request('/audio/sample/asset.json');
  assert.equal(response.status, 200);
  const body = (await response.json()) as { version: number };
  assert.equal(body.version, 1);
});

test('serves the whole file with a 200 when no range is asked for', async () => {
  const { app } = setup();
  const response = await app.request('/audio/sample/ch000.opus');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/ogg');
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(Buffer.from(await response.arrayBuffer()).toString(), '0123456789');
});

test('answers a byte range with 206 and the requested slice', async () => {
  const { app } = setup();
  const response = await app.request('/audio/sample/ch000.opus', {
    headers: { range: 'bytes=2-5' },
  });

  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(Buffer.from(await response.arrayBuffer()).toString(), '2345');
});

test('treats an unsatisfiable range as a whole-file response', async () => {
  const { app } = setup();
  const response = await app.request('/audio/sample/ch000.opus', {
    headers: { range: 'bytes=99-120' },
  });
  assert.equal(response.status, 200);
});

test('refuses traversal, unknown ids and non-audio files', async () => {
  const { app } = setup();
  for (const path of [
    '/audio/sample/..%2Fasset.json',
    '/audio/../sample/asset.json',
    '/audio/missing/asset.json',
    '/audio/sample/notes.txt',
  ]) {
    const response = await app.request(path);
    assert.equal(response.status, 404, path);
  }
});

test('parseRange understands open-ended and suffix ranges', () => {
  assert.deepEqual(parseRange('bytes=0-', 10), { start: 0, end: 9 });
  assert.deepEqual(parseRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.deepEqual(parseRange('bytes=4-', 10), { start: 4, end: 9 });
  assert.equal(parseRange('bytes=5-4', 10), null);
  assert.equal(parseRange('nonsense', 10), null);
});
