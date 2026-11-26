import assert from 'node:assert/strict';
import test from 'node:test';
import type { Book } from '../src/types';
import {
  createTtsJob,
  fetchTtsConfig,
  fetchTtsJobs,
  pickActiveJob,
  pickLatestJob,
  type TtsJob,
} from '../src/lib/tts/workerApi';

function job(overrides: Partial<TtsJob>): TtsJob {
  return {
    id: 'job-1',
    audioId: 'tts-book-a',
    bookId: 'book-a',
    title: '书 A',
    model: 'omnivoice',
    voice: 'default',
    status: 'queued',
    chaptersTotal: 1,
    chaptersDone: 0,
    pairsTotal: 2,
    pairsDone: 0,
    createdAt: 1,
    ...overrides,
  };
}

const book: Book = {
  id: 'book-a',
  title: '书 A',
  author: '',
  importedAt: 0,
  chapters: [],
};

test('createTtsJob adopts the running job a 409 hands back', async () => {
  const fetcher = (async () =>
    Response.json({ job: job({ status: 'running' }) }, { status: 409 })) as typeof fetch;

  const created = await createTtsJob(
    book,
    { model: 'omnivoice', voice: 'default' },
    fetcher
  );

  assert.equal(created?.status, 'running');
  assert.equal(created?.id, 'job-1');
});

test('fetchTtsJobs keeps valid jobs and drops malformed rows', async () => {
  const fetcher = (async () =>
    Response.json({
      jobs: [job({ id: 'job-1' }), { id: 42 }, null, job({ id: 'job-2' })],
    })) as typeof fetch;

  const jobs = await fetchTtsJobs(fetcher);

  assert.deepEqual(
    jobs.map((item) => item.id),
    ['job-1', 'job-2']
  );
});

test('fetchTtsJobs drops a job whose status is unknown', async () => {
  const fetcher = (async () =>
    Response.json({
      jobs: [
        job({ id: 'ok' }),
        { ...job({ id: 'bad' }), status: 'exploded' },
        { ...job({ id: 'worse' }), status: undefined },
      ],
    })) as typeof fetch;

  const jobs = await fetchTtsJobs(fetcher);

  // The dialog indexes its labels by status; an unknown one would render a
  // blank row and count as neither running nor finished.
  assert.deepEqual(
    jobs.map((item) => item.id),
    ['ok']
  );
});

test('pickLatestJob returns the newest job for the asset whatever its status', () => {
  const jobs = [
    job({ id: 'done-old', status: 'done', createdAt: 10 }),
    job({ id: 'failed-new', status: 'failed', createdAt: 30 }),
    job({ id: 'other-book', audioId: 'tts-book-b', createdAt: 40 }),
  ];

  assert.equal(pickLatestJob(jobs, 'tts-book-a')?.id, 'failed-new');
  assert.equal(pickLatestJob(jobs, 'tts-nothing'), null);
});

test('fetchTtsJobs returns an empty list when the worker is unreachable', async () => {
  const fetcher = (async () => {
    throw new Error('ECONNREFUSED');
  }) as typeof fetch;

  assert.deepEqual(await fetchTtsJobs(fetcher), []);
});

test('pickActiveJob returns the newest active job for the asset only', () => {
  const jobs = [
    job({ id: 'old', status: 'done', createdAt: 10 }),
    job({ id: 'failed', status: 'failed', createdAt: 20 }),
    job({ id: 'other-book', audioId: 'tts-book-b', createdAt: 30 }),
    job({ id: 'running', status: 'running', createdAt: 40 }),
    job({ id: 'queued', status: 'queued', createdAt: 35 }),
  ];

  assert.equal(pickActiveJob(jobs, 'tts-book-a')?.id, 'running');
});

test('pickActiveJob returns null when nothing is active', () => {
  const jobs = [job({ id: 'done', status: 'done', createdAt: 10 })];

  assert.equal(pickActiveJob(jobs, 'tts-book-a'), null);
});

test('fetchTtsConfig passes the advertised models and voices through', async () => {
  const fetcher = (async () =>
    Response.json({
      model: 'omnivoice',
      voice: 'default',
      bitrate: '48k',
      models: ['omnivoice', 'other'],
      voices: ['default', 'narrator'],
    })) as typeof fetch;

  const config = await fetchTtsConfig(fetcher);

  assert.deepEqual(config, {
    model: 'omnivoice',
    voice: 'default',
    bitrate: '48k',
    models: ['omnivoice', 'other'],
    voices: ['default', 'narrator'],
  });
});

test('fetchTtsConfig tolerates a worker that lists nothing', async () => {
  const fetcher = (async () =>
    Response.json({ model: 'omnivoice', voice: 'default' })) as typeof fetch;

  const config = await fetchTtsConfig(fetcher);

  assert.deepEqual(config?.models, []);
  assert.deepEqual(config?.voices, []);
});
