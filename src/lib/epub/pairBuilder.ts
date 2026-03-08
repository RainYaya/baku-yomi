import type { SentencePair } from '../../types';
import { detectLanguage } from './languageDetector';
import type { ExtractedSentence } from './sentenceSplitter';

/**
 * Build sentence pairs from extracted text lines.
 * Expects alternating Japanese and Chinese sentences.
 * Pairs are formed from adjacent JA+ZH sequences.
 */
export function buildPairs(
  sentences: ExtractedSentence[],
  chapterIndex: number
): SentencePair[] {
  const pairs: SentencePair[] = [];

  const tagged = sentences.map((s) => ({
    ...s,
    lang: detectLanguage(s.text),
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
        japaneseHtml: tagged[i].html,
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
        japaneseHtml: tagged[i + 1].html,
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
