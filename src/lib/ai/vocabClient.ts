import type { AIProviderConfig, VocabFillFields } from '../../types';
import { buildVocabPrompt, type VocabPromptInput } from '../vocab/prompt';
import { parseVocabResponse } from '../vocab/parse';

/** The free endpoint can stall; a hung request must not look like an empty card. */
const VOCAB_TIMEOUT_MS = 45_000;

export async function generateVocabFields(
  config: AIProviderConfig,
  input: VocabPromptInput,
  signal?: AbortSignal
): Promise<VocabFillFields> {
  const timeout = AbortSignal.timeout(VOCAB_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: config.type,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      prompt: buildVocabPrompt(input),
    }),
    signal: combined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI 补充失败：${error}`);
  }

  const data = (await response.json()) as { text?: string };
  const fields = parseVocabResponse(data.text ?? '');
  if (!fields) throw new Error('AI 返回的格式无法解析，请重试。');
  return fields;
}
