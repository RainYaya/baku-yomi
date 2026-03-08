import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import ai from './routes/ai';

const app = new Hono();

app.use('/*', cors());
app.route('/api', ai);

app.get('/health', (c) => c.json({ status: 'ok' }));

const port = 3003;
console.log(`Server running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
