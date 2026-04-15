import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import type { TTSProvider, SynthesisOptions } from './types';
import { VoicevoxProvider } from './voicevox';
import { MicrosoftTTSProvider } from './microsoft';

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------
const providers = new Map<string, TTSProvider>();
providers.set('voicevox', new VoicevoxProvider());
providers.set('microsoft', new MicrosoftTTSProvider());

const defaultProviderName = process.env.TTS_DEFAULT_PROVIDER ?? 'microsoft';

function getProvider(name?: string): TTSProvider {
  const key = name ?? defaultProviderName;
  const provider = providers.get(key);
  if (!provider) throw new Error(`Unknown TTS provider: ${key}`);
  return provider;
}

// ---------------------------------------------------------------------------
// Server-side TTS cache (shared across all providers)
// ---------------------------------------------------------------------------
type TtsCacheItem = {
  key: string;
  wav: Buffer;
  size: number;
  lastAccessAt: number;
};

const ttsCache = new Map<string, TtsCacheItem>();
const TTS_CACHE_MAX_BYTES = Number(process.env.TTS_CACHE_MAX_BYTES ?? 120 * 1024 * 1024);
let ttsCacheBytes = 0;
let ttsCacheHits = 0;
let ttsCacheMisses = 0;
let ttsCacheEvictions = 0;

function makeCacheKey(provider: string, text: string, speaker: number, options?: SynthesisOptions): string {
  const speed = options?.speedScale ?? 1;
  const pitch = options?.pitchScale ?? 0;
  const volume = options?.volumeScale ?? 1;
  return createHash('sha1').update(`${provider}::${speaker}::${speed}::${pitch}::${volume}::${text}`).digest('hex');
}

function evictIfNeeded(max = TTS_CACHE_MAX_BYTES): void {
  if (ttsCacheBytes <= max) return;
  const items = [...ttsCache.values()].sort((a, b) => a.lastAccessAt - b.lastAccessAt);
  for (const item of items) {
    ttsCache.delete(item.key);
    ttsCacheBytes -= item.size;
    ttsCacheEvictions += 1;
    if (ttsCacheBytes <= max) break;
  }
}

function readCache(key: string): Buffer | null {
  const item = ttsCache.get(key);
  if (!item) return null;
  item.lastAccessAt = Date.now();
  ttsCacheHits += 1;
  return item.wav;
}

function writeCache(key: string, wav: Buffer): void {
  const existing = ttsCache.get(key);
  if (existing) ttsCacheBytes -= existing.size;

  ttsCache.set(key, { key, wav, size: wav.byteLength, lastAccessAt: Date.now() });
  ttsCacheBytes += wav.byteLength;
  evictIfNeeded();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const tts = new Hono();

// Cache routes — must be registered before /:provider to avoid param match
tts.get('/cache/stats', (c) => {
  return c.json({
    items: ttsCache.size,
    totalBytes: ttsCacheBytes,
    maxBytes: TTS_CACHE_MAX_BYTES,
    hits: ttsCacheHits,
    misses: ttsCacheMisses,
    evictions: ttsCacheEvictions,
  });
});

tts.post('/cache/clear', (c) => {
  ttsCache.clear();
  ttsCacheBytes = 0;
  return c.json({ ok: true });
});

// Speakers list
tts.get('/:provider/speakers', async (c) => {
  const providerName = c.req.param('provider');

  try {
    const provider = getProvider(providerName);
    const speakers = await provider.getSpeakers();
    return c.json(speakers, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

// Synthesize — works for any provider
tts.post('/:provider', async (c) => {
  const providerName = c.req.param('provider');
  const body = await c.req.json();
  const { text, speaker = 1, options } = body ?? {};

  if (!text || typeof text !== 'string') {
    return c.json({ error: 'Missing required field: text' }, 400);
  }

  try {
    const provider = getProvider(providerName);
    const cacheKey = makeCacheKey(provider.name, text, speaker, options);
    const contentType = provider.name === 'microsoft' ? 'audio/mpeg' : 'audio/wav';

    const cached = readCache(cacheKey);
    if (cached) {
      return new Response(cached, {
        headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-TTS-Cache': 'HIT' },
      });
    }

    ttsCacheMisses += 1;
    const wav = await provider.synthesize(text, speaker, options);
    writeCache(cacheKey, wav);

    return new Response(wav, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-TTS-Cache': 'MISS' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

export default tts;
