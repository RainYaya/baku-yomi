import type {
  MaterialFormat,
  MaterialLength,
  MaterialLevel,
} from './materialJson';

export interface MaterialRequest {
  scenario: string;
  level?: MaterialLevel;
  format?: MaterialFormat;
  length?: MaterialLength;
}

export const MATERIAL_LENGTH_RANGE: Record<MaterialLength, [number, number]> = {
  short: [6, 8],
  medium: [10, 14],
  long: [16, 20],
};

export const MATERIAL_LENGTH_LABEL: Record<MaterialLength, string> = {
  short: '短',
  medium: '中',
  long: '长',
};

export function materialLengthOf(value: unknown): MaterialLength {
  return value === 'medium' || value === 'long' ? value : 'short';
}

/**
 * One prompt for every AI material: scenario, level, format and line range,
 * plus a strict JSON contract so the preview never has to guess at prose.
 */
export function buildMaterialPrompt(input: MaterialRequest): string {
  const scenario = input.scenario.trim();
  const level = input.level ?? 'N3';
  const format = input.format ?? 'dialogue';
  const length = materialLengthOf(input.length);
  const [minLines, maxLines] = MATERIAL_LENGTH_RANGE[length];

  const formatLine =
    format === 'prose'
      ? '形式：短文（自然连贯的段落，不要写成对话）'
      : '形式：对话（每行一个说话回合，说话人清楚）';

  return `你是日语学习材料的编写者。请根据下面的情景，写一份可以直接阅读的双语材料。

情景：${scenario}
水平：${level}
${formatLine}
长度：${minLines}–${maxLines} 行
要求：
- 日语必须自然口语，符合 ${level} 水平，不要翻译腔，不要过度书面化。
- 中文翻译要准确、自然，逐行对应日语。
- 对话要给说话人（如「店員」「客」）；短文可以省略 speaker。
- 只输出 JSON，不要 Markdown 代码块，不要解释。

JSON 格式：
{
  "title": "材料标题（${level} 水平）",
  "level": "${level}",
  "format": "${format}",
  "lines": [
    { "speaker": "说话人（可选）", "japanese": "日语句子", "chinese": "中文翻译" }
  ],
  "notes": [
    { "word": "关键词", "reading": "假名读音", "meaning": "中文释义" }
  ]
}

lines 共 ${minLines}–${maxLines} 行，notes 给 3–5 个关键词。`;
}
