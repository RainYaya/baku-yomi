/**
 * Client for the streaming explanation endpoint.
 *
 * The server speaks newline-delimited JSON; this reads it incrementally and
 * hands prose to the caller as it arrives. Cancellation is real: aborting the
 * signal tears down the fetch, which closes the server-side stream and stops
 * the upstream model call rather than letting it run to completion unseen.
 */
import type { AIProviderConfig, ExplainRequest } from '../../types';

export interface ExplainStreamHandlers {
  onDelta: (text: string) => void;
  signal?: AbortSignal;
}

export interface ExplainStreamResult {
  /** Full prose, including any table the model appended. */
  text: string;
  /** True when the caller aborted. */
  cancelled: boolean;
}

type WireEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; usage?: unknown }
  | { type: 'error'; message: string };

export async function streamExplanation(
  config: AIProviderConfig,
  request: ExplainRequest,
  handlers: ExplainStreamHandlers
): Promise<ExplainStreamResult> {
  const response = await fetch('/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: handlers.signal,
    body: JSON.stringify({
      provider: config.type,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      sentence: request.sentence,
      fragment: request.fragment,
      action: request.action,
      depth: request.depth,
      targetLanguage: request.targetLanguage,
    }),
  });

  if (!response.ok) {
    let message = `讲解请求失败（${response.status}）`;
    try {
      const data = await response.json();
      if (typeof data?.error === 'string') message = data.error;
    } catch {
      // Non-JSON error body — keep the status-based message.
    }
    throw new Error(message);
  }

  if (!response.body) throw new Error('讲解响应为空');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event: WireEvent;
    try {
      event = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (event.type === 'delta') {
      text += event.text;
      handlers.onDelta(event.text);
    } else if (event.type === 'error') {
      throw new Error(event.message);
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    }
    // A final line without a trailing newline.
    if (buffer.trim()) handleLine(buffer);
  } catch (error) {
    if (handlers.signal?.aborted) return { text, cancelled: true };
    throw error;
  } finally {
    reader.releaseLock();
  }

  return { text, cancelled: false };
}

/** Same endpoint, follow-up turn. Replays the prior answer as context. */
export async function streamFollowUp(
  config: AIProviderConfig,
  request: ExplainRequest,
  question: string,
  previousAnswer: string,
  handlers: ExplainStreamHandlers
): Promise<ExplainStreamResult> {
  const response = await fetch('/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: handlers.signal,
    body: JSON.stringify({
      provider: config.type,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      sentence: request.sentence,
      fragment: request.fragment,
      action: request.action,
      depth: request.depth,
      targetLanguage: request.targetLanguage,
      question,
      previousAnswer,
    }),
  });

  if (!response.ok) {
    let message = `追问请求失败（${response.status}）`;
    try {
      const data = await response.json();
      if (typeof data?.error === 'string') message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (!response.body) throw new Error('追问响应为空');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (!line) continue;
        let event: WireEvent;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type === 'delta') {
          text += event.text;
          handlers.onDelta(event.text);
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }
    }
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer.trim()) as WireEvent;
        if (event.type === 'delta') {
          text += event.text;
          handlers.onDelta(event.text);
        }
      } catch {
        // ignore trailing garbage
      }
    }
  } catch (error) {
    if (handlers.signal?.aborted) return { text, cancelled: true };
    throw error;
  } finally {
    reader.releaseLock();
  }

  return { text, cancelled: false };
}
