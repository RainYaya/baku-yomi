import type { AIProviderType } from '../src/types/settings';
import { BILIBILI_FREE_BASE_URL, BILIBILI_FREE_MODEL } from '../src/types/settings';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModelV1 } from 'ai';

/**
 * The B站 endpoint is a vLLM deployment behind openresty. Two of its
 * behaviours are not expressible through the AI SDK's normal options, so they
 * are patched in at the fetch layer:
 *
 *   - `chat_template_kwargs.enable_thinking: false` must be present on every
 *     request. Without it the model thinks until the gateway gives up.
 *   - `stream: true` must be forced. Non-streamed responses are killed at the
 *     same ~30s gateway timeout, which a normal explanation easily exceeds.
 *
 * Forcing stream is safe for callers using `generateText` too: the SDK
 * consumes the stream and resolves with the assembled text.
 */
const bilibiliFetch: typeof fetch = async (input, init) => {
  if (init?.body && typeof init.body === 'string') {
    try {
      const body = JSON.parse(init.body);
      body.chat_template_kwargs = {
        ...(body.chat_template_kwargs ?? {}),
        enable_thinking: false,
      };
      body.stream = true;
      init = { ...init, body: JSON.stringify(body) };
    } catch {
      // Not JSON — leave the request untouched rather than corrupting it.
    }
  }
  return fetch(input, init);
};

/**
 * Captures the provider's error payload so callers can report *why* a request
 * failed.
 *
 * The SDK swallows non-2xx bodies: an auth failure ends `textStream` with no
 * deltas and surfaces later as a generic `NoOutputGeneratedError` with no
 * cause, which is useless to show a user. Reading the body here (before the
 * SDK consumes it) is the only place the real message is still available.
 * The body is cloned, so the SDK still gets its own copy.
 */
export interface ProviderDiagnostics {
  lastError?: { status: number; body: string };
}

function wrapFetch(base: typeof fetch, diagnostics: ProviderDiagnostics): typeof fetch {
  return async (input, init) => {
    const response = await base(input, init);
    if (!response.ok) {
      try {
        const body = await response.clone().text();
        diagnostics.lastError = { status: response.status, body: body.slice(0, 2000) };
      } catch {
        // Body already consumed or unreadable — nothing to add.
      }
    }
    return response;
  };
}

export function createProvider(
  type: AIProviderType,
  apiKey: string,
  model: string,
  baseUrl?: string,
  diagnostics?: ProviderDiagnostics
): LanguageModelV1 {
  const withDiag = (base: typeof fetch): typeof fetch =>
    diagnostics ? wrapFetch(base, diagnostics) : base;

  switch (type) {
    case 'openai': {
      const openai = createOpenAI({ apiKey, fetch: withDiag(fetch) });
      return openai.chat(model);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(model);
    }
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(model);
    }
    case 'openai-compatible': {
      const openai = createOpenAI({ apiKey, baseURL: baseUrl, fetch: withDiag(fetch) });
      return openai.chat(model);
    }
    case 'bilibili-free': {
      // Keyless and model-pinned: the endpoint only serves one model, so a
      // stale model name in the client config must not break the request.
      const openai = createOpenAI({
        apiKey: apiKey || 'keyless',
        baseURL: BILIBILI_FREE_BASE_URL,
        fetch: diagnostics ? wrapFetch(bilibiliFetch, diagnostics) : bilibiliFetch,
      });
      return openai.chat(BILIBILI_FREE_MODEL || model);
    }
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}
