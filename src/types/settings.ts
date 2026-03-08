export type AIProviderType = 'openai' | 'anthropic' | 'google' | 'openai-compatible';

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

export const DEFAULT_MODELS: Record<AIProviderType, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.0-flash',
  'openai-compatible': 'gpt-4o',
};
