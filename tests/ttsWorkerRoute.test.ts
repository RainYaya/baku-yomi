import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { Book } from '../src/types/book';
import { createJobManager, type JobRunner } from '../worker/jobs';
import { createWorkerApp } from '../worker/index';
import type { WorkerEnv } from '../worker/env';

function book(id: string): Book {
  return {
    id,
    title: `书 ${id}`,
    author: '作者',
    importedAt: 0,
    chapters: [
      {
        id: `${id}-ch0`,
        title: '第一章',
        index: 0,
        pairs: [
          {
            id: `${id}-p0`,
            japanese: 'こんにちは。',
            chinese: '',
            chapterIndex: 0,
            pairIndex: 0,
          },
        ],
      },
    ],
  };
}

function env(workdir: string): WorkerEnv {
  return {
    voicestudioUrl: 'http://127.0.0.1:1',
    voicestudioKey: '',
    model: 'omnivoice',
    voice: 'default',
    bitrate: '32k',
    port: 0,
    workdir,
    rogUrl: '',
    importToken: '',
  };
}

async function appWith(workdir: string, run: JobRunner) {
  const manager = await createJobManager({ workdir, run });
  const { app } = await createWorkerApp({ env: env(workdir), manager });
  return { app, manager };
}

const post = (app: Awaited<ReturnType<typeof appWith>>['app'], id: string) =>
  app.request('/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ book: book(id) }),
  });

test('starting a book that is already running returns that job instead of a second one', async () => {
  const workdir = mkdtempSync(join(tmpdir(), 'baku-tts-route-'));
  let release: () => void = () => {};
  let markStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const run: JobRunner = async () => {
    markStarted();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return { files: [] };
  };

  const { app, manager } = await appWith(workdir, run);

  const first = await post(app, 'book-dup');
  assert.equal(first.status, 201);
  const firstJob = (await first.json()) as { job: { id: string } };
  await started;

  const second = await post(app, 'book-dup');
  assert.equal(second.status, 409);
  const secondJob = (await second.json()) as { job: { id: string; status: string } };
  assert.equal(secondJob.job.id, firstJob.job.id);
  assert.equal(secondJob.job.status, 'running');
  assert.equal(manager.list().length, 1);

  release();
  await manager.whenIdle();
});

test('a chapter without a pairs array is refused instead of crashing', async () => {
  const workdir = mkdtempSync(join(tmpdir(), 'baku-tts-route-'));
  const { app } = await appWith(workdir, async () => ({ files: [] }));

  const response = await app.request('/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      book: { id: 'b', title: 't', chapters: [{ id: 'c', title: 'c', index: 0 }] },
    }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'invalid_book' });
});

test('after a job finishes the same book can be generated again', async () => {
  const workdir = mkdtempSync(join(tmpdir(), 'baku-tts-route-'));
  const run: JobRunner = async () => ({ files: [] });

  const { app, manager } = await appWith(workdir, run);
  const first = await post(app, 'book-again');
  assert.equal(first.status, 201);
  await manager.whenIdle();

  const second = await post(app, 'book-again');
  assert.equal(second.status, 201);
  await manager.whenIdle();

  const jobs = manager.list();
  assert.equal(jobs.length, 2);
  assert.ok(jobs.every((job) => job.status === 'done'));
});
