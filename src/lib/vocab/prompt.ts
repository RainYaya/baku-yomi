export interface VocabPromptInput {
  word: string;
  example?: string;
  exampleTranslation?: string;
  /** Surrounding text, used for understanding only. */
  context?: string;
}

/** Ask for the fields around a word the reader already met. */
export function buildVocabPrompt(input: VocabPromptInput): string {
  const word = input.word.trim();
  const example = input.example?.trim() ?? '';
  const translation = input.exampleTranslation?.trim() ?? '';
  const context = input.context?.trim() ?? '';

  const lines = [
    '你是一位日语词汇老师，正在帮一位中文母语的学习者整理生词。',
    `目标词：${word}`,
  ];

  if (example) {
    lines.push(`原句：${example}`);
    if (translation) lines.push(`原句的中文翻译：${translation}`);
    lines.push('原句已经存在。example 字段必须原样返回原句，不要改写或替换。');
  } else {
    lines.push('没有例句。请先造一句自然、能体现这个词典型用法的日语例句。');
  }

  if (context) lines.push(`上下文（仅用于理解，不要输出）：${context}`);

  lines.push(
    '',
    '请只输出一个 JSON 对象，不要 markdown 代码块，不要任何前后说明：',
    '{',
    '  "reading": "假名读音；外来语写原文",',
    '  "meaning": "简体中文释义，短",',
    '  "synonyms": [{"word": "近义词", "nuance": "语感标签，如：纳得/断念/心情"}],',
    '  "core": "一句日语，写这个词的核心感觉",',
    '  "example": "有原句时原样返回；没有原句时给一句自然例句"',
    '}',
    '',
    '要求：',
    '- 有原句时，example 必须原样返回，不要改写。',
    '- synonyms 2～4 个，nuance 用简短中文。',
    '- core 用日语，一句话，不要翻译成中文。',
    '- core 不要与 example 相同，要写这个词的核心感觉。',
    '- 只输出 JSON。'
  );

  return lines.join('\n');
}
