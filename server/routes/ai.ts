import { Hono } from 'hono';
import { streamText } from 'ai';
import { createProvider } from '../providers';
import tts from '../tts/index';

const ai = new Hono();

// Mount TTS sub-routes
ai.route('/tts', tts);

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter for /analyze (per-IP, per minute)
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30; // requests per window

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

// Sweep stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}, 5 * 60_000);

ai.post('/analyze', async (c) => {
  // Rate limit check
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const now = Date.now();
  let bucket = rateBuckets.get(ip);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }

  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX) {
    return c.json({ error: 'Rate limit exceeded. Try again shortly.' }, 429);
  }

  const body = await c.req.json();
  const { provider, apiKey, model, baseUrl, prompt } = body;

  // Keyless providers legitimately send an empty apiKey; only the fields that
  // every request needs are required here.
  if (!provider || !model || !prompt) {
    return c.json({ error: 'Missing required fields' }, 400);
  }
  if (!apiKey && provider !== 'bilibili-free') {
    return c.json({ error: 'Missing API key' }, 400);
  }

  try {
    const llm = createProvider(provider, apiKey, model, baseUrl);

    // The keyless endpoint is forced to stream (see providers.ts), and the
    // SDK's non-streaming `generateText` path does not reliably reassemble a
    // forced stream — it fails with "Failed to process successful response".
    // Consuming the stream directly gives the same assembled text and works
    // for both keyless and keyed providers.
    const result = streamText({ model: llm, prompt });
    let text = '';
    for await (const delta of result.textStream) text += delta;

    return c.json({ text });
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Unknown error';
    if (/didn't provide an API key|Missing API key|invalid_api_key/iu.test(raw)) {
      return c.json(
        { error: '当前供应商没有可用的 API Key。请在设置里改用「B站免费（无需 Key）」，或填入你自己的 Key。' },
        400
      );
    }
    if (/504|Gateway Time-?out/iu.test(raw)) {
      return c.json({ error: '模型响应超时，重试一次即可。' }, 504);
    }
    return c.json({ error: raw.split(String.fromCharCode(10))[0].slice(0, 160) }, 500);
  }
});

export default ai;
