import { Hono } from 'hono';
import { generateText } from 'ai';
import { createProvider } from '../providers';

const ai = new Hono();

ai.post('/analyze', async (c) => {
  const body = await c.req.json();
  const { provider, apiKey, model, baseUrl, prompt } = body;

  if (!provider || !apiKey || !model || !prompt) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  try {
    const llm = createProvider(provider, apiKey, model, baseUrl);

    const result = await generateText({
      model: llm,
      prompt,
    });

    return c.json({ text: result.text });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

export default ai;
