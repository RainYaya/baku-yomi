import { Hono } from 'hono';
import { streamText } from 'ai';
import { createProvider, type ProviderDiagnostics } from '../providers';
import type { ExplainAction, ExplainDepth, ExplainRequest } from '../../src/types/explain';
import { buildExplainPrompt, buildExplainSystemPrompt, buildFollowUpPrompt } from '../../src/lib/ai/explainPrompts';

/**
 * Streaming explanation endpoint.
 *
 * Streaming is not a nicety here: the free B站 endpoint kills any request that
 * takes longer than ~30s at the gateway, and a full explanation regularly
 * runs past that. Streaming also lets the reader panel fill in as the model
 * writes instead of showing a spinner for half a minute.
 *
 * The wire format is a small line-delimited JSON protocol rather than SSE
 * because the client only needs three event kinds and no reconnect semantics:
 *
 *   {"type":"delta","text":"..."}   incremental prose
 *   {"type":"done","usage":{...}}   end of stream
 *   {"type":"error","message":"..."} terminal failure
 */
const explain = new Hono();

const ACTIONS = new Set<ExplainAction>(['meaning', 'grammar', 'usage', 'nuance']);
const DEPTHS = new Set<ExplainDepth>(['concise', 'detailed']);

const MAX_SENTENCE_CHARS = 2000;
const MAX_FRAGMENT_CHARS = 500;
const MAX_QUESTION_CHARS = 500;

// Per-IP rate limit. The free endpoint is shared infrastructure; hammering it
// from one client is both rude and likely to get the whole thing locked down.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 40;
const buckets = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60_000).unref?.();

function takeToken(ip: string): boolean {
  const now = Date.now();
  let bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(ip, bucket);
  }
  bucket.count += 1;
  return bucket.count <= MAX_REQUESTS;
}

interface ExplainBody {
  provider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  sentence?: string;
  fragment?: string;
  action?: string;
  depth?: string;
  targetLanguage?: string;
  /** When present, this is a follow-up turn rather than a fresh explanation. */
  question?: string;
  /** Prior answer, replayed as context for a follow-up. */
  previousAnswer?: string;
}

function validate(body: ExplainBody): string | null {
  if (!body.provider || !body.model) return '缺少 AI 供应商配置';
  if (typeof body.sentence !== 'string' || !body.sentence.trim()) return '缺少原文';
  if (body.sentence.length > MAX_SENTENCE_CHARS) return '原文过长';
  if (typeof body.fragment === 'string' && body.fragment.length > MAX_FRAGMENT_CHARS) {
    return '选中片段过长';
  }
  if (!body.action || !ACTIONS.has(body.action as ExplainAction)) return '未知的讲解类型';
  if (!body.depth || !DEPTHS.has(body.depth as ExplainDepth)) return '未知的讲解深度';
  if (body.question !== undefined) {
    if (typeof body.question !== 'string' || !body.question.trim()) return '追问内容为空';
    if (body.question.length > MAX_QUESTION_CHARS) return '追问过长';
  }
  return null;
}

/**
 * Turn an SDK/provider failure into something a reader can act on.
 *
 * The raw errors are long and leak provider internals: an empty OpenAI key
 * surfaces as a paragraph about Bearer auth and a link to platform.openai.com,
 * which tells a user nothing about what to do in this app. The cases below are
 * the ones that actually happen.
 */
function describeError(error: unknown): string {
  // The SDK wraps provider failures, so the useful text is often in `cause`
  // or in the response body rather than in `message`. Flatten the whole chain
  // before matching, otherwise "missing API key" is reported as a generic
  // "no output generated".
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.message);
      const withData = current as Error & { cause?: unknown; responseBody?: string; data?: unknown };
      if (withData.responseBody) parts.push(withData.responseBody);
      if (withData.data) parts.push(JSON.stringify(withData.data));
      current = withData.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  const raw = parts.join(' | ');

  if (/didn't provide an API key|Missing API key|invalid_api_key/iu.test(raw)) {
    return '当前供应商没有可用的 API Key。请在设置里改用「B站免费（无需 Key）」，或填入你自己的 Key。';
  }
  if (/504|Gateway Time-?out/iu.test(raw)) {
    return '模型响应超时。免费模型偶尔会卡住，重试一次通常就好。';
  }
  if (/429|rate limit/iu.test(raw)) {
    return '请求太频繁，稍等片刻再试。';
  }
  if (/No output generated/iu.test(raw)) {
    return '模型没有返回内容。可能是免费服务临时不可用，重试一次或换个动作试试。';
  }
  if (/fetch failed|ECONNRESET|ENOTFOUND/iu.test(raw)) {
    return '连不上模型服务，检查一下网络。';
  }

  // Keep it short: the full message is usually a multi-line provider dump.
  const firstLine = raw.split(String.fromCharCode(10))[0].trim();
  return firstLine.length > 160 ? `${firstLine.slice(0, 160)}…` : firstLine || '讲解生成失败';
}

explain.post('/explain', async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!takeToken(ip)) {
    return c.json({ error: '请求太频繁，稍后再试' }, 429);
  }

  let body: ExplainBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求格式错误' }, 400);
  }

  const invalid = validate(body);
  if (invalid) return c.json({ error: invalid }, 400);

  const request: ExplainRequest = {
    sentence: body.sentence!.trim(),
    fragment: (body.fragment ?? '').trim(),
    action: body.action as ExplainAction,
    depth: body.depth as ExplainDepth,
    targetLanguage: body.targetLanguage || 'zh-Hans',
  };

  // A follow-up replays the original exchange so the model keeps the context
  // without the client having to resend a growing transcript.
  const messages = body.question
    ? [
        { role: 'system' as const, content: buildExplainSystemPrompt(request) },
        { role: 'user' as const, content: buildExplainPrompt(request) },
        { role: 'assistant' as const, content: body.previousAnswer ?? '' },
        { role: 'user' as const, content: buildFollowUpPrompt(body.question) },
      ]
    : [
        { role: 'system' as const, content: buildExplainSystemPrompt(request) },
        { role: 'user' as const, content: buildExplainPrompt(request) },
      ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        const diagnostics: ProviderDiagnostics = {};
        const llm = createProvider(
          body.provider as never,
          body.apiKey ?? '',
          body.model!,
          body.baseUrl,
          diagnostics
        );

        const maxOutputTokens = request.depth === 'detailed' ? 2400 : 1400;

        const result = streamText({
          model: llm,
          messages,
          temperature: 0.3,
          maxOutputTokens,
        });

        let text = '';
        for await (const delta of result.textStream) {
          text += delta;
          send({ type: 'delta', text: delta });
        }

        // The SDK does not throw out of `textStream` for provider failures: an
        // auth error simply ends the stream with no deltas. The failure is
        // only observable afterwards, so an empty result has to be turned into
        // an error explicitly or the client just sees nothing happen.
        if (!text.trim()) {
          // Prefer the provider's own error body: it names the real problem
          // ("no API key", "model not found") where the SDK only says "no
          // output generated".
          if (diagnostics.lastError) {
            throw new Error(
              `HTTP ${diagnostics.lastError.status}: ${diagnostics.lastError.body}`
            );
          }
          throw new Error('No output generated');
        }

        // The grammar action is only useful with the breakdown table, and the
        // model treats it as optional roughly one time in three no matter how
        // the prompt is worded. Rather than showing prose with no breakdown,
        // ask once more with the omission named explicitly. The retry streams
        // into a second section so the client can append rather than replace.
        const wantsTable = request.action === 'grammar' && !body.question;
        const hasTable = /[|]\s*Text\s*[|]/iu.test(text);

        if (wantsTable && !hasTable) {
          send({ type: 'section', id: 'table-retry' });
          try {
            const retry = streamText({
              model: llm,
              messages: [
                ...messages,
                { role: 'assistant' as const, content: text },
                {
                  role: 'user' as const,
                  content:
                    '你漏掉了成分表。现在只输出那张 Markdown 表格，表头逐字为 | Text | POS | Role | Meaning |，不要任何其他文字。Text 必须逐字复制原文片段，按原文顺序排列，不重叠。',
                },
              ],
              temperature: 0,
              maxOutputTokens: 900,
            });
            for await (const delta of retry.textStream) {
              send({ type: 'delta', text: delta });
            }
          } catch {
            // The retry is best-effort; the prose answer already streamed.
          }
        }

        send({ type: 'done', usage: await result.usage });
      } catch (error) {
        send({ type: 'error', message: describeError(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      // Tell any intermediate proxy not to buffer the stream.
      'X-Accel-Buffering': 'no',
    },
  });
});

export default explain;
