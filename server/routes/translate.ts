import { Hono } from 'hono';
import { streamText } from 'ai';
import { createProvider } from '../providers';
import { buildTranslationPrompt, type TranslationSentence } from '../../src/lib/ai/translatePrompts';
import { parseTranslationResponse } from '../../src/lib/ai/translateJson';

const translate = new Hono();

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}, 5 * 60_000);

translate.post('/translate', async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const now = Date.now();
  let bucket = rateBuckets.get(ip);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }

  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX) {
    return c.json({ error: '翻译请求过于频繁，请稍后再试。' }, 429);
  }

  const body = await c.req.json();
  const {
    provider,
    apiKey,
    model,
    baseUrl,
    sentences,
    contextBefore,
    contextAfter,
    targetLanguage,
  } = body;

  if (!provider || !model || !Array.isArray(sentences) || sentences.length === 0) {
    return c.json({ error: '缺少翻译参数。' }, 400);
  }
  if (!apiKey && provider !== 'bilibili-free') {
    return c.json({ error: '当前供应商没有可用的 API Key。' }, 400);
  }
  if (sentences.length > 50) {
    return c.json({ error: '单次翻译最多 50 句。' }, 400);
  }

  const cleaned: TranslationSentence[] = sentences
    .filter(
      (item: unknown): item is TranslationSentence =>
        Boolean(
          item &&
            typeof item === 'object' &&
            typeof (item as TranslationSentence).id === 'string' &&
            typeof (item as TranslationSentence).text === 'string' &&
            (item as TranslationSentence).text.trim()
        )
    )
    .map((item: TranslationSentence) => ({
      id: item.id.trim(),
      text: item.text.trim(),
    }));

  if (cleaned.length === 0) {
    return c.json({ error: '没有可翻译的句子。' }, 400);
  }

  const prompt = buildTranslationPrompt(
    cleaned,
    Array.isArray(contextBefore) ? contextBefore : [],
    Array.isArray(contextAfter) ? contextAfter : [],
    typeof targetLanguage === 'string' ? targetLanguage : '简体中文'
  );

  try {
    const llm = createProvider(provider, apiKey, model, baseUrl);
    let parsed: ReturnType<typeof parseTranslationResponse> = [];

    // The keyless model occasionally answers a batch in prose instead of the
    // requested JSON. One silent retry costs far less than surfacing an
    // alignment error for a batch that would parse on the second try.
    for (let attempt = 0; attempt < 2 && parsed.length === 0; attempt += 1) {
      const result = streamText({
        model: llm,
        prompt,
        // The upstream gateway dies at ~30s; giving up a little later keeps a
        // stalled stream from holding the request open indefinitely.
        abortSignal: AbortSignal.timeout(45_000),
      });
      let text = '';
      for await (const delta of result.textStream) text += delta;
      parsed = parseTranslationResponse(text);
    }
    const byId = new Map(parsed.map((item) => [item.id, item.chinese] as const));
    const translations = cleaned
      .filter((item) => byId.has(item.id))
      .map((item) => ({ id: item.id, chinese: byId.get(item.id) ?? '' }));
    const missing = cleaned
      .filter((item) => !byId.has(item.id))
      .map((item) => item.id);

    if (translations.length === 0) {
      return c.json(
        { error: '模型没有返回可解析的译文，请重试或换一个模型。' },
        502
      );
    }

    return c.json({ translations, missing });
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Unknown error';
    if (/didn't provide an API key|Missing API key|invalid_api_key/iu.test(raw)) {
      return c.json(
        { error: '当前供应商没有可用的 API Key。请在设置里改用「B站免费（无需 Key）」，或填入你自己的 Key。' },
        400
      );
    }
    if (/504|Gateway Time-?out/iu.test(raw)) {
      return c.json({ error: '模型响应超时，重试一次即可。' }, 504);
    }
    if (/abort|timeout/i.test(e instanceof Error ? e.name : '')) {
      return c.json({ error: '模型响应超时，重试一次即可。' }, 504);
    }
    return c.json({ error: raw.split(String.fromCharCode(10))[0].slice(0, 200) }, 500);
  }
});

export default translate;
