import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import ai from './routes/ai';

const isProd = process.env.NODE_ENV === 'production';

const app = new Hono();

// CORS: restrict to known origin in production, allow all in dev
if (isProd) {
  const allowedOrigin = process.env.CORS_ORIGIN;
  if (allowedOrigin) {
    app.use('/*', cors({ origin: allowedOrigin }));
  }
  // No CORS middleware in prod without explicit origin = same-origin only
} else {
  app.use('/*', cors());
}

app.route('/api', ai);

app.get('/health', (c) => c.json({ status: 'ok' }));

// Production: serve built frontend from dist/
if (isProd) {
  app.use('/*', serveStatic({ root: './dist' }));
  // SPA fallback: serve index.html for any unmatched route
  app.get('/*', serveStatic({ root: './dist', path: 'index.html' }));
}

const port = Number(process.env.PORT ?? 3003);
console.log(`Server running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
