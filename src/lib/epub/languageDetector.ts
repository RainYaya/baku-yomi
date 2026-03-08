/**
 * Detect if a string is primarily Japanese (contains hiragana or katakana).
 * Chinese text uses only CJK Unified Ideographs without kana.
 */
export function isJapanese(text: string): boolean {
  // Match hiragana (3040-309F) or katakana (30A0-30FF)
  const kanaRegex = /[\u3040-\u309F\u30A0-\u30FF]/;
  return kanaRegex.test(text);
}

export function isChinese(text: string): boolean {
  if (isJapanese(text)) return false;
  // Contains CJK Unified Ideographs
  const cjkRegex = /[\u4E00-\u9FFF]/;
  return cjkRegex.test(text);
}

export type Language = 'ja' | 'zh' | 'unknown';

export function detectLanguage(text: string): Language {
  const trimmed = text.trim();
  if (!trimmed) return 'unknown';
  if (isJapanese(trimmed)) return 'ja';
  if (isChinese(trimmed)) return 'zh';
  return 'unknown';
}
