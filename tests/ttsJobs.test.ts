import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { Book } from '../src/types/book';
import { CancelledError } from '../worker/cancelled';
import {
  createJobManager,
  type JobRunner,
  type TtsJob,
} from '../worker/jobs';

function tempWorkdir(): string {
  return mkdtempSync(join(tmpdir(), 'baku-tts-jobs-'));
}

function testBook(id: string): Book {
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

const input = (id: string) => ({
  book: testBook(id),
  model: 'model-a',
  voice: 'voice-a',
  bitrate: '32k',
});

test('a queued job runs once and records its result', async () => {
  const workdir = tempWorkdir();
  const seen: string[] = [];
  const run: JobRunner = async (_input, job, hooks) => {
    seen.push(job.status);
    hooks.updateProgress({
      pairsDone: 1,
      chaptersDone: 1,
      currentChapterTitle: '第一章',
    });
    return { files: ['/tmp/a.opus'] };
  };

  const manager = await createJobManager({ workdir, run });
  const job = await manager.enqueue(input('book-1'));

  assert.equal(job.status, 'queued');
  assert.equal(job.audioId, 'tts-book-1');
  assert.equal(job.pairsTotal, 1);

  await manager.whenIdle();

  const done = manager.get(job.id);
  assert.ok(done);
  assert.equal(done.status, 'done');
  assert.deepEqual(seen, ['running']);
  assert.equal(done.pairsDone, 1);
  assert.equal(done.chaptersDone, 1);
  assert.deepEqual(done.files, ['/tmp/a.opus']);
  assert.ok(done.startedAt !== undefined);
  assert.ok(done.finishedAt !== undefined);

  const saved = JSON.parse(
    readFileSync(join(workdir, 'jobs.json'), 'utf8')
  ) as TtsJob[];
  assert.equal(saved.find((item) => item.id === job.id)?.status, 'done');
});

test('a workdir deleted while the worker runs is recreated, not fatal', async () => {
  const workdir = tempWorkdir();
  const manager = await createJobManager({
    workdir,
    run: async () => ({ files: [] }),
  });

  rmSync(workdir, { recursive: true, force: true });

  const job = await manager.enqueue(input('book-gone'));
  await manager.whenIdle();

  assert.equal(manager.get(job.id)?.status, 'done');
  assert.ok(readFileSync(join(workdir, 'jobs.json'), 'utf8').includes(job.id));
});

test('a throwing runner marks the job failed with its message', async () => {
  const workdir = tempWorkdir();
  const run: JobRunner = async () => {
    throw new Error('speech server is down');
  };

  const manager = await createJobManager({ workdir, run });
  const job = await manager.enqueue(input('book-2'));
  await manager.whenIdle();

  const failed = manager.get(job.id);
  assert.ok(failed);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'speech server is down');
  assert.ok(failed.finishedAt !== undefined);
});

test('the job history keeps the newest fifty entries', async () => {
  const workdir = tempWorkdir();
  const manager = await createJobManager({
    workdir,
    run: async () => ({ files: [] }),
  });

  let newest = '';
  for (let index = 0; index < 55; index++) {
    const job = await manager.enqueue(input(`book-many-${index}`));
    newest = job.id;
    await manager.whenIdle();
  }

  const saved = JSON.parse(
    readFileSync(join(workdir, 'jobs.json'), 'utf8')
  ) as TtsJob[];

  assert.equal(saved.length, 50);
  assert.equal(saved.at(-1)?.id, newest);
  assert.equal(saved.some((job) => job.bookId === 'book-many-0'), false);
});

test('cancelling a running job stops it before the next pair', async () => {
  const workdir = tempWorkdir();
  let release: () => void = () => {};
  let markStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });

  const run: JobRunner = async (_input, _job, hooks) => {
    markStarted();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    if (hooks.isCancelled()) throw new CancelledError();
    return { files: [] };
  };

  const manager = await createJobManager({ workdir, run });
  const job = await manager.enqueue(input('book-3'));
  await started;

  assert.equal(manager.get(job.id)?.status, 'running');
  const cancelled = await manager.cancel(job.id);
  assert.equal(cancelled?.status, 'cancelled');

  release();
  await manager.whenIdle();

  const final = manager.get(job.id);
  assert.ok(final);
  assert.equal(final.status, 'cancelled');
  assert.equal(final.error, undefined);
});

test('only one job runs at a time and later jobs keep their order', async () => {
  const workdir = tempWorkdir();
  const order: string[] = [];
  let releaseFirst: () => void = () => {};
  let markFirstStarted: () => void = () => {};
  const firstStarted = new Promise<void>((resolve) => {
    markFirstStarted = resolve;
  });

  const run: JobRunner = async (jobInput) => {
    order.push(`start:${jobInput.book.id}`);
    if (jobInput.book.id === 'book-4') {
      markFirstStarted();
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
    }
    order.push(`done:${jobInput.book.id}`);
    return { files: [] };
  };

  const manager = await createJobManager({ workdir, run });
  const first = await manager.enqueue(input('book-4'));
  const second = await manager.enqueue(input('book-5'));

  await firstStarted;
  assert.deepEqual(order, ['start:book-4']);
  assert.equal(manager.get(first.id)?.status, 'running');
  assert.equal(manager.get(second.id)?.status, 'queued');

  releaseFirst();
  await manager.whenIdle();

  assert.deepEqual(order, [
    'start:book-4',
    'done:book-4',
    'start:book-5',
    'done:book-5',
  ]);
  assert.equal(manager.get(first.id)?.status, 'done');
  assert.equal(manager.get(second.id)?.status, 'done');
});

test('cancelling a queued job never starts it', async () => {
  const workdir = tempWorkdir();
  const started: string[] = [];
  let release: () => void = () => {};
  let markFirstStarted: () => void = () => {};
  const firstStarted = new Promise<void>((resolve) => {
    markFirstStarted = resolve;
  });

  const run: JobRunner = async (jobInput) => {
    started.push(jobInput.book.id);
    if (jobInput.book.id === 'book-6') {
      markFirstStarted();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    return { files: [] };
  };

  const manager = await createJobManager({ workdir, run });
  await manager.enqueue(input('book-6'));
  const queued = await manager.enqueue(input('book-7'));

  await firstStarted;
  const cancelled = await manager.cancel(queued.id);
  assert.equal(cancelled?.status, 'cancelled');

  release();
  await manager.whenIdle();

  assert.deepEqual(started, ['book-6']);
  assert.equal(manager.get(queued.id)?.status, 'cancelled');
});
