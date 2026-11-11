export interface TranslationSentence {
  id: string;
  text: string;
}

function contextBlock(label: string, items: string[]): string {
  const cleaned = items
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.length > 320 ? `${item.slice(0, 320)}…` : item));
  if (cleaned.length === 0) return '';
  return `${label}（仅用于理解，不要翻译）：\n${cleaned.join('\n')}\n`;
}

export function buildTranslationPrompt(
  sentences: TranslationSentence[],
  contextBefore: string[] = [],
  contextAfter: string[] = [],
  targetLanguage = '简体中文'
): string {
  const list = sentences
    .map((sentence) => `[${sentence.id}] ${sentence.text}`)
    .join('\n');

  return `你是一名专业的日文文学译者。请把下面的日文翻译成自然、准确的${targetLanguage}。

要求：
- 逐句翻译，不要合并或拆分句子。
- 保留人物名、地名、专有名词和语气；不要添加解释或注释。
- 只输出 JSON 数组，不要 markdown 代码块，不要任何前后说明。
- 每一项的格式是 {"id":"原 id","chinese":"译文"}。
- 必须返回全部 ${sentences.length} 项，id 必须与输入完全一致，顺序保持一致。

${contextBlock('前文', contextBefore)}${contextBlock('后文', contextAfter)}待翻译句子：
${list}`;
}
