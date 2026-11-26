import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { createTtsRoute } from '../server/routes/tts';

const BASE = 'http://worker.test';

function appWith(fetcher: typeof fetch) {
  const app = new Hono();
  app.route('/api', createTtsRoute({ worker: () => BASE, fetcher }));
  return app;
}

test('GET /api/tts/jobs lists the worker jobs', async () => {
  const calls: string[] = [];
  const app = appWith((async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
    return Response.json({ jobs: [{ id: 'job-1', audioId: 'tts-a' }] });
  }) as typeof fetch);

  const response = await app.request('/api/tts/jobs');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    jobs: [{ id: 'job-1', audioId: 'tts-a' }],
  });
  assert.deepEqual(calls, [`GET ${BASE}/jobs`]);
});

test('POST /api/tts/jobs passes a 409 and its job through', async () => {
  const app = appWith((async () =>
    Response.json(
      { job: { id: 'job-running', audioId: 'tts-a', status: 'running' } },
      { status: 409 }
    )) as typeof fetch);

  const response = await app.request('/api/tts/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ book: { id: 'a', title: 't', chapters: [] } }),
  });

  assert.equal(response.status, 409);
  const body = (await response.json()) as { job: { id: string } };
  assert.equal(body.job.id, 'job-running');
});

test('GET /api/tts/jobs reports an unreachable worker as 502', async () => {
  const app = appWith((async () => {
    throw new Error('ECONNREFUSED');
  }) as typeof fetch);

  const response = await app.request('/api/tts/jobs');
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'tts_worker_unreachable' });
});
