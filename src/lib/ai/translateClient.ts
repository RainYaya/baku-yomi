import type { AIProviderConfig } from '../../types';
import type { TranslationSentence } from './translatePrompts';
import type { TranslationResult } from './translateJson';

export interface TranslationBatchResponse {
  translations: TranslationResult[];
  missing: string[];
}

export interface TranslateBatchOptions {
  contextBefore?: string[];
  contextAfter?: string[];
  targetLanguage?: string;
  signal?: AbortSignal;
}

export async function translateBatch(
  config: AIProviderConfig,
  sentences: TranslationSentence[],
  options: TranslateBatchOptions = {}
): Promise<TranslationBatchResponse> {
  const timeout = AbortSignal.timeout(60_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;

  let response: Response;
  try {
    response = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: config.type,
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
        sentences,
        contextBefore: options.contextBefore ?? [],
        contextAfter: options.contextAfter ?? [],
        targetLanguage: options.targetLanguage ?? '简体中文',
      }),
      signal,
    });
  } catch (error) {
    if (timeout.aborted && !options.signal?.aborted) {
      throw new Error('翻译请求超时，请重试。');
    }
    throw error;
  }

  if (!response.ok) {
    let message = `翻译请求失败（${response.status}）`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === 'string' && body.error.trim()) {
        message = body.error;
      }
    } catch {
      // Keep the status-based fallback.
    }
    throw new Error(message);
  }

  const data = (await response.json()) as {
    translations?: unknown;
    missing?: unknown;
  };

  if (!Array.isArray(data.translations)) {
    throw new Error('翻译响应格式不正确。');
  }

  const translations = data.translations.filter(
    (item): item is TranslationResult =>
      Boolean(
        item &&
          typeof item === 'object' &&
          typeof (item as TranslationResult).id === 'string' &&
          typeof (item as TranslationResult).chinese === 'string'
      )
  );

  return {
    translations,
    missing: Array.isArray(data.missing)
      ? data.missing.filter((id): id is string => typeof id === 'string')
      : [],
  };
}
