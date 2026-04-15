import { Hono } from 'hono';
import { generateText } from 'ai';
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

  if (!provider || !apiKey || !model || !prompt) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  try {
    const llm = createProvider(provider, apiKey, model, baseUrl);

    const result = await generateText({
      model: llm,
      prompt,
    });

    return c.json({ text: result.text });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

export default ai;
