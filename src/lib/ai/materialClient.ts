import type { AIProviderConfig } from '../../types';
import {
  buildMaterialPrompt,
  type MaterialRequest,
} from './materialPrompts';
import {
  MATERIAL_ERROR,
  parseMaterialJson,
  type GeneratedMaterial,
} from './materialJson';

async function requestMaterial(
  config: AIProviderConfig,
  prompt: string
): Promise<string> {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: config.type,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      prompt,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`材料生成失败：${detail || response.status}`);
  }

  const data = (await response.json()) as { text?: unknown };
  return typeof data.text === 'string' ? data.text : '';
}

/**
 * Generate a scenario material with one strict retry. The retry asks again
 * rather than trying to repair the first answer, so a malformed response is
 * a visible failure instead of a half-valid book.
 */
export async function generateMaterial(
  config: AIProviderConfig,
  request: MaterialRequest
): Promise<GeneratedMaterial> {
  const prompt = buildMaterialPrompt(request);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await requestMaterial(
      config,
      attempt === 0
        ? prompt
        : `${prompt}\n\n上一次输出无法解析。请严格只输出一个 JSON 对象，不要任何其他文字。`
    );
    const parsed = parseMaterialJson(raw);
    if (parsed.ok) return parsed.material;
  }

  throw new Error(MATERIAL_ERROR);
}
