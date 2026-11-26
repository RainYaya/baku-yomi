import assert from 'node:assert/strict';
import test from 'node:test';
import { synthesizeSpeech } from '../worker/tts';

const baseUrl = 'http://speech.test';

function captureHeaders(): {
  fetcher: typeof fetch;
  headers: () => Record<string, string>;
} {
  let seen: Record<string, string> = {};
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen = (init?.headers ?? {}) as Record<string, string>;
    return new Response(Buffer.from([0, 1, 2, 3]), { status: 200 });
  }) as typeof fetch;
  return { fetcher, headers: () => seen };
}

test('the share PIN travels in the header VoiceStudio checks', async () => {
  const capture = captureHeaders();

  await synthesizeSpeech({
    baseUrl,
    pin: '123456',
    model: 'tts-1',
    voice: 'alloy',
    text: 'こんにちは。',
    fetchImpl: capture.fetcher,
  });

  assert.equal(capture.headers()['X-OmniVoice-Pin'], '123456');
});

test('no PIN header is sent when the server does not ask for one', async () => {
  const capture = captureHeaders();

  await synthesizeSpeech({
    baseUrl,
    model: 'omnivoice',
    voice: 'default',
    text: 'こんにちは。',
    fetchImpl: capture.fetcher,
  });

  assert.equal(capture.headers()['X-OmniVoice-Pin'], undefined);
});
