export type AIProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'openai-compatible'
  | 'bilibili-free';

export interface AIProviderConfig {
  type: AIProviderType;
  apiKey: string;
  model: string;
  baseUrl?: string; // For OpenAI-compatible providers
}

export interface AppSettings {
  aiProvider: AIProviderConfig;
  blindMode: boolean;
}

/**
 * The B站 anonymous endpoint is an OpenAI-compatible chat endpoint that needs
 * neither a key nor a login, but it has two hard constraints baked in:
 *
 * 1. `chat_template_kwargs.enable_thinking` must be false. Left on, the model
 *    spends its whole budget thinking and the openresty gateway 504s at ~30s.
 * 2. Non-streamed requests die at that same ~30s gateway timeout, so anything
 *    longer than a short answer must go through `stream: true`.
 *
 * Both are handled in `server/providers.ts`; the values here are what the
 * settings UI and the request builder need to agree on.
 */
export const BILIBILI_FREE_BASE_URL = 'https://index-translate.bilibili.com/v1';
export const BILIBILI_FREE_MODEL = 'Index-Translate-35B-A3B';

export const DEFAULT_MODELS: Record<AIProviderType, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.0-flash',
  'openai-compatible': 'gpt-4o',
  'bilibili-free': BILIBILI_FREE_MODEL,
};

/** Providers that need no credential, so the UI must not demand one. */
export function isKeylessProvider(type: AIProviderType): boolean {
  return type === 'bilibili-free';
}
