import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 24000;
const MIN_MS = 300;
const MAX_MS = 6000;
const MS_PER_CHAR = 90;
const TONE_HZ = 440;
const AMPLITUDE = 0.08;

/** `BAKU_MOCK_TTS_DELAY_MS` slows each reply so a long job can be observed. */
function replyDelayMs(): number {
  const value = Number(process.env.BAKU_MOCK_TTS_DELAY_MS ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * A valid 16-bit mono 24kHz WAV holding a quiet 440Hz tone whose length is
 * roughly 90ms per character. Good enough to exercise the whole generate →
 * encode → upload pipeline without a real speech model.
 */
export function toneWav(text: string): Buffer {
  const chars = Array.from(text).length;
  const durationMs = Math.min(MAX_MS, Math.max(MIN_MS, chars * MS_PER_CHAR));
  const samples = Math.round((durationMs / 1000) * SAMPLE_RATE);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const peak = AMPLITUDE * 32767;
  for (let index = 0; index < samples; index++) {
    const value = Math.round(
      Math.sin((2 * Math.PI * TONE_HZ * index) / SAMPLE_RATE) * peak
    );
    buffer.writeInt16LE(value, 44 + index * 2);
  }

  return buffer;
}

export function createMockTtsApp(): Hono {
  const app = new Hono();

  app.get('/v1/models', (c) =>
    c.json({ data: [{ id: 'mock-voice' }, { id: 'mock-voice-fast' }] })
  );

  app.get('/v1/audio/voices', (c) =>
    c.json({
      data: [{ id: 'default' }, { id: 'narrator' }, { id: 'child' }],
    })
  );

  app.post('/v1/audio/speech', async (c) => {
    const body = await c.req
      .json<{ input?: unknown }>()
      .catch(() => ({ input: '' }));
    const input = typeof body.input === 'string' ? body.input : '';
    const delay = replyDelayMs();
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return c.body(new Uint8Array(toneWav(input)), 200, {
      'Content-Type': 'audio/wav',
    });
  });

  return app;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const port = Number(process.env.BAKU_MOCK_TTS_PORT ?? 3901);
  serve({ fetch: createMockTtsApp().fetch, port, hostname: '0.0.0.0' });
  console.log(`Mock TTS listening on http://0.0.0.0:${port}`);
}
