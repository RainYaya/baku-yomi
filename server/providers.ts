import type { AIProviderType } from '../src/types/settings';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModelV1 } from 'ai';

export function createProvider(
  type: AIProviderType,
  apiKey: string,
  model: string,
  baseUrl?: string
): LanguageModelV1 {
  switch (type) {
    case 'openai': {
      const openai = createOpenAI({ apiKey });
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
      const openai = createOpenAI({ apiKey, baseURL: baseUrl });
      return openai.chat(model);
    }
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}
