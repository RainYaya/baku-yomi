import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Book } from '../src/types/book';
import { toAudioId } from './audioId';
import { CancelledError } from './cancelled';
import { readCatalog } from './catalog';
import { readEnv, type WorkerEnv } from './env';
import { generateAsset } from './generate';
import {
  createJobManager,
  type JobManager,
  type JobRunner,
} from './jobs';
import { uploadAsset } from './upload';

function isBook(value: unknown): value is Book {
  if (typeof value !== 'object' || value === null) return false;
  const book = value as Partial<Book>;
  return (
    typeof book.id === 'string' &&
    typeof book.title === 'string' &&
    Array.isArray(book.chapters) &&
    // Every chapter is read for its pairs while counting and synthesizing;
    // refuse the payload here so a malformed book is a 400, not a crash.
    book.chapters.every(
      (chapter) => typeof chapter === 'object' && chapter !== null && Array.isArray(chapter.pairs)
    )
  );
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function createRunner(env: WorkerEnv): JobRunner {
  return async (input, _job, hooks) => {
    const result = await generateAsset({
      workdir: env.workdir,
      book: input.book,
      audioId: input.audioId,
      baseUrl: env.voicestudioUrl,
      apiKey: env.voicestudioKey,
      pin: env.pin,
      model: input.model,
      voice: input.voice,
      bitrate: input.bitrate,
      onProgress: hooks.updateProgress,
      isCancelled: hooks.isCancelled,
    });

    // Cancel is honoured through the encode loops too; never publish a book
    // the user already stopped.
    if (hooks.isCancelled()) throw new CancelledError();

    await uploadAsset(input.audioId, result.files, {
      baseUrl: env.rogUrl,
      token: env.importToken,
      isCancelled: hooks.isCancelled,
    });

    return { files: result.files };
  };
}

export interface WorkerAppOptions {
  env?: WorkerEnv;
  manager?: JobManager;
}

export async function createWorkerApp(options: WorkerAppOptions = {}) {
  const env = options.env ?? readEnv();
  const manager =
    options.manager ??
    (await createJobManager({ workdir: env.workdir, run: createRunner(env) }));

  const app = new Hono();

  app.get('/health', (c) =>
    c.json({ ok: true, model: env.model, voice: env.voice })
  );

  app.get('/config', async (c) => {
    const catalog = await readCatalog({
      baseUrl: env.voicestudioUrl,
      apiKey: env.voicestudioKey,
      pin: env.pin,
    });
    return c.json({
      model: env.model,
      voice: env.voice,
      bitrate: env.bitrate,
      models: catalog.models,
      voices: catalog.voices,
    });
  });

  app.get('/jobs', (c) => c.json({ jobs: manager.list() }));

  app.get('/jobs/:id', (c) => {
    const job = manager.get(c.req.param('id'));
    return job ? c.json({ job }) : c.json({ error: 'not_found' }, 404);
  });

  app.post('/jobs', async (c) => {
    const body = await c.req
      .json<{ book?: unknown; model?: unknown; voice?: unknown; bitrate?: unknown }>()
      .catch(() => null);
    if (!body || !isBook(body.book)) {
      return c.json({ error: 'invalid_book' }, 400);
    }

    // Two jobs writing the same asset would race on the same output files and
    // make the client import the book twice. Hand back the live one instead.
    const active = manager.findActive(toAudioId(body.book.id));
    if (active) {
      return c.json({ job: active }, 409);
    }

    const job = await manager.enqueue({
      book: body.book,
      model: text(body.model, env.model),
      voice: text(body.voice, env.voice),
      bitrate: text(body.bitrate, env.bitrate),
    });
    return c.json({ job }, 201);
  });

  app.post('/jobs/:id/cancel', async (c) => {
    const job = await manager.cancel(c.req.param('id'));
    return job ? c.json({ job }) : c.json({ error: 'not_found' }, 404);
  });

  return { app, manager, env };
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
  const env = readEnv();
  const { app } = await createWorkerApp({ env });
  serve({ fetch: app.fetch, port: env.port, hostname: '0.0.0.0' });
  console.log(`TTS worker listening on http://0.0.0.0:${env.port}`);
}
