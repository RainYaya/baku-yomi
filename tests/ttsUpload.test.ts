import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CancelledError } from '../worker/cancelled';
import { uploadAsset } from '../worker/upload';

function twoFiles(): { dir: string; files: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'baku-upload-'));
  const first = join(dir, 'ch000-aaaa.opus');
  const second = join(dir, 'asset.json.next');
  writeFileSync(first, 'audio');
  writeFileSync(second, '{"version":1}');
  return { dir, files: [first, second] };
}

test('reports a missing BAKU_ROG_URL instead of pretending the upload worked', async () => {
  const { files } = twoFiles();

  await assert.rejects(
    uploadAsset('tts-book', files, { baseUrl: '', token: 't' }),
    /BAKU_ROG_URL/
  );
});

test('uploads every file in order and then finishes', async () => {
  const { files } = twoFiles();
  const calls: string[] = [];

  await uploadAsset('tts-book', files, {
    baseUrl: 'http://rog.test',
    token: 'secret',
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method} ${String(input)}`);
      assert.equal(
        (init?.headers as Record<string, string>)['x-baku-import-token'],
        'secret'
      );
      return Response.json({ ok: true });
    }) as typeof fetch,
  });

  assert.deepEqual(calls, [
    'PUT http://rog.test/api/audio/import/tts-book/ch000-aaaa.opus',
    'PUT http://rog.test/api/audio/import/tts-book/asset.json.next',
    'POST http://rog.test/api/audio/import/tts-book/finish',
  ]);
});

test('cancelling mid-upload stops before finish', async () => {
  const { files } = twoFiles();
  const calls: string[] = [];
  let uploads = 0;

  await assert.rejects(
    uploadAsset('tts-book', files, {
      baseUrl: 'http://rog.test',
      token: 'secret',
      isCancelled: () => uploads >= 1,
      fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(`${init?.method} ${String(input)}`);
        if (init?.method === 'PUT') uploads += 1;
        return Response.json({ ok: true });
      }) as typeof fetch,
    }),
    (error: unknown) => error instanceof CancelledError
  );

  assert.equal(
    calls.some((call) => call.startsWith('POST')),
    false
  );
});

test('a failed upload surfaces the server detail', async () => {
  const { files } = twoFiles();

  await assert.rejects(
    uploadAsset('tts-book', files, {
      baseUrl: 'http://rog.test',
      token: 'secret',
      fetchImpl: (async () =>
        Response.json({ error: 'forbidden' }, { status: 403 })) as typeof fetch,
    }),
    /HTTP 403.*forbidden/
  );
});
