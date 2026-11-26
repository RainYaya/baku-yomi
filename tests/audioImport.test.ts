import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createAudioRoute } from '../server/routes/audio';

const TOKEN = 'test-import-token';

function setup(importToken: string | null | undefined = TOKEN) {
  const dir = mkdtempSync(join(tmpdir(), 'baku-audio-import-'));
  return { dir, app: createAudioRoute({ dir, importToken }) };
}

function importHeaders(token = TOKEN) {
  return { 'x-baku-import-token': token };
}

function manifest(bookId: string, files: string[]): string {
  return JSON.stringify({
    version: 1,
    book: {
      id: bookId,
      title: '样本书',
      author: '',
      importedAt: 0,
      chapters: [],
    },
    audio: {
      chapters: files.map((file, index) => ({
        index,
        file,
        startMs: 0,
        durationMs: 1000,
      })),
    },
  });
}

test('the import token is required', async () => {
  const { app } = setup();

  let response = await app.request('/audio/import/sample/ch000.opus', {
    method: 'PUT',
    body: 'audio',
  });
  assert.equal(response.status, 403);

  response = await app.request('/audio/import/sample/ch000.opus', {
    method: 'PUT',
    headers: importHeaders('wrong'),
    body: 'audio',
  });
  assert.equal(response.status, 403);
});

test('an unset token refuses every upload', async () => {
  const { app } = setup(null);
  const response = await app.request('/audio/import/sample/ch000.opus', {
    method: 'PUT',
    headers: importHeaders(''),
    body: 'audio',
  });
  assert.equal(response.status, 403);
});

test('writes files, then finish requires asset.json', async () => {
  const { dir, app } = setup();

  let response = await app.request('/audio/import/sample/ch000.opus', {
    method: 'PUT',
    headers: importHeaders(),
    body: '0123456789',
  });
  assert.equal(response.status, 200);
  assert.equal(
    readFileSync(join(dir, 'sample', 'ch000.opus'), 'utf8'),
    '0123456789'
  );

  response = await app.request('/audio/import/sample/finish', {
    method: 'POST',
    headers: importHeaders(),
  });
  assert.equal(response.status, 400);

  response = await app.request('/audio/import/sample/asset.json.next', {
    method: 'PUT',
    headers: importHeaders(),
    body: manifest('sample', ['ch000.opus']),
  });
  assert.equal(response.status, 200);

  response = await app.request('/audio/import/sample/finish', {
    method: 'POST',
    headers: importHeaders(),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, id: 'sample' });
  assert.equal(
    readFileSync(join(dir, 'sample', 'asset.json'), 'utf8'),
    manifest('sample', ['ch000.opus'])
  );
});

test('finish refuses a manifest that names a missing chapter', async () => {
  const { dir, app } = setup();

  await app.request('/audio/import/sample/ch000.opus', {
    method: 'PUT',
    headers: importHeaders(),
    body: '0123456789',
  });
  await app.request('/audio/import/sample/asset.json.next', {
    method: 'PUT',
    headers: importHeaders(),
    body: manifest('sample', ['ch000.opus', 'ch001.opus']),
  });

  const response = await app.request('/audio/import/sample/finish', {
    method: 'POST',
    headers: importHeaders(),
  });

  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string; detail: string };
  assert.equal(body.error, 'asset_invalid');
  assert.match(body.detail, /ch001\.opus/);
  assert.throws(() => readFileSync(join(dir, 'sample', 'asset.json'), 'utf8'));
});

test('finish refuses a manifest for a different book', async () => {
  const { dir, app } = setup();

  await app.request('/audio/import/sample/ch000.opus', {
    method: 'PUT',
    headers: importHeaders(),
    body: '0123456789',
  });
  await app.request('/audio/import/sample/asset.json.next', {
    method: 'PUT',
    headers: importHeaders(),
    body: manifest('other-book', ['ch000.opus']),
  });

  const response = await app.request('/audio/import/sample/finish', {
    method: 'POST',
    headers: importHeaders(),
  });

  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string };
  assert.equal(body.error, 'asset_invalid');
  assert.throws(() => readFileSync(join(dir, 'sample', 'asset.json'), 'utf8'));
});

test('a second publish drops the chapter files the new manifest no longer names', async () => {
  const { dir, app } = setup();

  for (const file of ['ch000-aaaa.opus', 'ch001-bbbb.opus']) {
    await app.request(`/audio/import/sample/${file}`, {
      method: 'PUT',
      headers: importHeaders(),
      body: 'audio',
    });
  }
  await app.request('/audio/import/sample/asset.json.next', {
    method: 'PUT',
    headers: importHeaders(),
    body: manifest('sample', ['ch000-aaaa.opus', 'ch001-bbbb.opus']),
  });
  await app.request('/audio/import/sample/finish', {
    method: 'POST',
    headers: importHeaders(),
  });

  await app.request('/audio/import/sample/ch000-cccc.opus', {
    method: 'PUT',
    headers: importHeaders(),
    body: 'audio',
  });
  await app.request('/audio/import/sample/asset.json.next', {
    method: 'PUT',
    headers: importHeaders(),
    body: manifest('sample', ['ch000-cccc.opus']),
  });
  const response = await app.request('/audio/import/sample/finish', {
    method: 'POST',
    headers: importHeaders(),
  });
  assert.equal(response.status, 200);

  assert.ok(readFileSync(join(dir, 'sample', 'ch000-cccc.opus')));
  assert.throws(() => readFileSync(join(dir, 'sample', 'ch000-aaaa.opus')));
  assert.throws(() => readFileSync(join(dir, 'sample', 'ch001-bbbb.opus')));
});

test('the manifest cannot be put in place before finish', async () => {
  const { app } = setup();

  const response = await app.request('/audio/import/sample/asset.json', {
    method: 'PUT',
    headers: importHeaders(),
    body: JSON.stringify({ version: 1 }),
  });

  assert.equal(response.status, 404);
});

test('rejects traversal, bad ids and non-asset file types', async () => {
  const { app } = setup();

  const paths = [
    '/audio/import/..%2Fescape/ch000.opus',
    '/audio/import/Sample/ch000.opus',
    '/audio/import/sample/..%2Fasset.json',
    '/audio/import/sample/notes.txt',
    '/audio/import/sample/',
  ];

  for (const path of paths) {
    const response = await app.request(path, {
      method: 'PUT',
      headers: importHeaders(),
      body: 'x',
    });
    assert.equal(response.status, 404, path);
  }
});
