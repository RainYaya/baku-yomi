import assert from 'node:assert/strict';
import test from 'node:test';
import { readCatalog } from '../worker/catalog';

const baseUrl = 'http://speech.test';

test('catalog reads model and voice ids from the OpenAI-style lists', async () => {
  const seen: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    seen.push(url);
    if (url.endsWith('/v1/models')) {
      return Response.json({ data: [{ id: 'omnivoice' }, { id: 'other-tts' }] });
    }
    return Response.json({ data: [{ id: 'female-1' }, 'male-2'] });
  }) as typeof fetch;

  const catalog = await readCatalog({ baseUrl, fetcher });

  assert.deepEqual(catalog.models, ['omnivoice', 'other-tts']);
  assert.deepEqual(catalog.voices, ['female-1', 'male-2']);
  assert.equal(seen.length, 2);
});

test('a speech server without those endpoints yields empty lists', async () => {
  const fetcher = (async () =>
    new Response('nope', { status: 404 })) as typeof fetch;

  assert.deepEqual(await readCatalog({ baseUrl, fetcher }), {
    models: [],
    voices: [],
  });
});

test('the catalog gives up on a server that never answers', async () => {
  const fetcher = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      // AbortSignal.timeout is unref'd, so a ref'd timer keeps the loop alive
      // until the abort lands; without it the runner cancels the test.
      const signal = init?.signal as AbortSignal | undefined;
      const guard = setTimeout(() => reject(new Error('nothing aborted')), 1000);
      signal?.addEventListener('abort', () => {
        clearTimeout(guard);
        reject(new Error('aborted'));
      });
    })) as typeof fetch;

  const started = Date.now();
  const catalog = await readCatalog({ baseUrl, fetcher, timeoutMs: 50 });

  // VoiceStudio answers in about two seconds per list, so a budget that fired
  // early would blank the dropdowns; here it must fire at the configured 50ms.
  assert.deepEqual(catalog, { models: [], voices: [] });
  assert.ok(Date.now() - started < 900);
});

test('an unreachable speech server yields empty lists instead of throwing', async () => {
  const fetcher = (async () => {
    throw new Error('ECONNREFUSED');
  }) as typeof fetch;

  assert.deepEqual(await readCatalog({ baseUrl, fetcher }), {
    models: [],
    voices: [],
  });
});

test('the catalog keeps a bearer token when one is configured', async () => {
  let auth: string | null = null;
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string> | undefined;
    auth = headers?.Authorization ?? null;
    return Response.json({ data: [] });
  }) as typeof fetch;

  await readCatalog({ baseUrl, apiKey: 'secret', fetcher });

  assert.equal(auth, 'Bearer secret');
});

test('the catalog sends the share PIN with both list requests', async () => {
  const pins: Array<string | undefined> = [];
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string> | undefined;
    pins.push(headers?.['X-OmniVoice-Pin']);
    return Response.json({ data: [] });
  }) as typeof fetch;

  await readCatalog({ baseUrl, pin: '123456', fetcher });

  assert.deepEqual(pins, ['123456', '123456']);
});

test('voices are read from the shape VoiceStudio actually returns', async () => {
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/v1/models')) {
      return Response.json({
        object: 'list',
        data: [
          { id: 'tts-1', voicestudio: { kind: 'tts' } },
          { id: 'whisper-1', voicestudio: { kind: 'stt' } },
        ],
      });
    }
    return Response.json({
      voices: [
        { voice_id: 'alloy', name: 'Alloy' },
        { voice_id: 'narrator', name: 'Narrator' },
      ],
    });
  }) as typeof fetch;

  const catalog = await readCatalog({ baseUrl, fetcher });

  // Speech models only; the voice list lives under `voices`, not `data`.
  assert.deepEqual(catalog.models, ['tts-1']);
  assert.deepEqual(catalog.voices, ['alloy', 'narrator']);
});
