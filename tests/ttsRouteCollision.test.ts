import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import legacyTts from '../server/tts/index';

/**
 * `server/index.ts` mounts the legacy speech router under `/api` (at `/tts`)
 * before the audiobook generation proxy, which also lives under `/api/tts`.
 * A `/:provider` catch-all there would take `/tts/jobs` for a synthesis call
 * to a provider named "jobs" and the browser would never reach the worker.
 */
test('the legacy speech router leaves /tts/jobs to the generation proxy', async () => {
  // Same nesting as `server/index.ts`: the legacy router rides inside the `ai`
  // sub-app mounted at `/api`, and the generation proxy is mounted after it.
  const ai = new Hono();
  ai.route('/tts', legacyTts);

  const app = new Hono();
  app.route('/api', ai);

  let reached = false;
  app.route('/api', new Hono().post('/tts/jobs', (c) => {
    reached = true;
    return c.json({ enqueued: true }, 201);
  }));

  const response = await app.request('/api/tts/jobs', {
    method: 'POST',
    body: JSON.stringify({ book: { id: 'b', title: 't', chapters: [] } }),
    headers: { 'Content-Type': 'application/json' },
  });

  assert.equal(response.status, 201);
  assert.equal(reached, true);
  assert.deepEqual(await response.json(), { enqueued: true });
});
