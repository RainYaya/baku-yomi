import type { AnalysisResult, ErrorCategory } from '../../types';

/**
 * The free provider returns prose, so `errors` is often empty even when the
 * markdown lists concrete mistakes. Map the labels the prompt asks for (and
 * the traditional forms the model sometimes answers in) back to categories.
 */
const ALIASES: Record<ErrorCategory, string[]> = {
  文法: ['文法', '语法', '語法'],
  語彙: ['語彙', '词汇', '詞彙'],
  助詞: ['助詞', '助词'],
  敬語: ['敬語', '敬语'],
  時制: ['時制', '時態', '时态'],
  表現: ['表現', '表达', '表達'],
  語順: ['語順', '语序', '語序'],
  その他: ['その他', '其他'],
};

const ERROR_SECTION = /【(?:错误与差异分析|錯誤與差異分析)】([\s\S]*?)(?=【|$)/;

function errorSection(markdown: string): string {
  return ERROR_SECTION.exec(markdown)?.[1] ?? markdown;
}

export function errorCategoriesOf(analysis: AnalysisResult): ErrorCategory[] {
  const found = new Set<ErrorCategory>();
  for (const error of analysis.errors) found.add(error.category);

  const text = errorSection(analysis.rawMarkdown ?? '');
  for (const [category, aliases] of Object.entries(ALIASES) as Array<
    [ErrorCategory, string[]]
  >) {
    if (aliases.some((alias) => text.includes(alias))) found.add(category);
  }

  return [...found];
}
