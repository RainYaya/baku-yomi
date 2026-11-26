import { Hono } from 'hono';

/**
 * The browser only ever talks to this server. When a TTS worker is configured
 * (the LAN machine that runs ffmpeg and the speech model), these routes forward
 * to it; without one they report the feature as unavailable.
 */
const TIMEOUT_MS = 5000;

function workerFromEnv(): string | null {
  const value = process.env.BAKU_TTS_WORKER?.trim();
  return value ? value.replace(/\/+$/, '') : null;
}

export interface TtsRouteOptions {
  /** Resolve the worker base URL per request; null disables the feature. */
  worker?: () => string | null;
  fetcher?: typeof fetch;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function createTtsRoute(options: TtsRouteOptions = {}) {
  const resolveWorker = options.worker ?? workerFromEnv;
  const fetcher = options.fetcher ?? fetch;
  const route = new Hono();

  async function forward(
    path: string,
    init: { method: string; body?: string; contentType?: string }
  ): Promise<Response> {
    const base = resolveWorker();
    if (!base) {
      return Response.json(
        { error: 'tts_worker_not_configured' },
        { status: 503 }
      );
    }

    const headers: Record<string, string> = {};
    if (init.contentType) headers['Content-Type'] = init.contentType;

    try {
      const response = await fetcher(`${base}${path}`, {
        method: init.method,
        headers,
        body: init.body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await response.text();
      return new Response(body, {
        status: response.status,
        headers: {
          'Content-Type':
            response.headers.get('content-type') ?? 'application/json',
        },
      });
    } catch {
      return Response.json(
        { error: 'tts_worker_unreachable' },
        { status: 502 }
      );
    }
  }

  route.get('/tts/status', async (c) => {
    const base = resolveWorker();
    if (!base) return c.json({ available: false });

    try {
      const response = await fetcher(`${base}/health`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return c.json({ available: false });
      const body = (await response.json()) as {
        model?: unknown;
        voice?: unknown;
      };
      return c.json({
        available: true,
        model: text(body.model),
        voice: text(body.voice),
      });
    } catch {
      return c.json({ available: false });
    }
  });

  route.get('/tts/config', () =>
    forward('/config', { method: 'GET' })
  );

  route.get('/tts/jobs', () => forward('/jobs', { method: 'GET' }));

  route.post('/tts/jobs', async (c) =>
    forward('/jobs', {
      method: 'POST',
      body: await c.req.text(),
      contentType: c.req.header('content-type') ?? 'application/json',
    })
  );

  route.get('/tts/jobs/:id', (c) =>
    forward(`/jobs/${encodeURIComponent(c.req.param('id'))}`, {
      method: 'GET',
    })
  );

  route.post('/tts/jobs/:id/cancel', (c) =>
    forward(`/jobs/${encodeURIComponent(c.req.param('id'))}/cancel`, {
      method: 'POST',
    })
  );

  return route;
}

export default createTtsRoute();
