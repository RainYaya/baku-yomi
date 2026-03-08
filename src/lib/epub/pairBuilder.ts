import type { SentencePair } from '../../types';
import { detectLanguage } from './languageDetector';

/**
 * Build sentence pairs from extracted text lines.
 * Expects alternating Japanese and Chinese sentences.
 * Pairs are formed from adjacent JA+ZH sequences.
 */
export function buildPairs(
  sentences: string[],
  chapterIndex: number
): SentencePair[] {
  const pairs: SentencePair[] = [];

  const tagged = sentences.map((text) => ({
    text,
    lang: detectLanguage(text),
  }));

  let i = 0;
  let pairIndex = 0;

  while (i < tagged.length) {
    // Look for JA followed by ZH
    if (
      tagged[i].lang === 'ja' &&
      i + 1 < tagged.length &&
      tagged[i + 1].lang === 'zh'
    ) {
      pairs.push({
        id: `ch${chapterIndex}-p${pairIndex}`,
        japanese: tagged[i].text,
        chinese: tagged[i + 1].text,
        chapterIndex,
        pairIndex,
      });
      pairIndex++;
      i += 2;
      continue;
    }

    // Look for ZH followed by JA (reverse order)
    if (
      tagged[i].lang === 'zh' &&
      i + 1 < tagged.length &&
      tagged[i + 1].lang === 'ja'
    ) {
      pairs.push({
        id: `ch${chapterIndex}-p${pairIndex}`,
        japanese: tagged[i + 1].text,
        chinese: tagged[i].text,
        chapterIndex,
        pairIndex,
      });
      pairIndex++;
      i += 2;
      continue;
    }

    // Skip unmatched sentences
    i++;
  }

  return pairs;
}
