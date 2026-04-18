import type { SentencePair } from '../../types';
import { detectLanguage } from './languageDetector';
import type { ExtractedSentence } from './sentenceSplitter';

/**
 * Build sentence pairs from extracted text lines.
 * Preserves adjacent JA+ZH / ZH+JA bilingual pairs when present.
 * If no explicit bilingual structure is found, fall back to treating each line
 * as a Japanese source sentence so monolingual novels still import cleanly.
 */
export function buildPairs(
  sentences: ExtractedSentence[],
  chapterIndex: number
): SentencePair[] {
  const tagged = sentences.map((s) => ({
    ...s,
    lang: detectLanguage(s.text),
  }));

  const hasExplicitBilingualPairs = tagged.some((sentence, index) => {
    const next = tagged[index + 1];
    if (!next) return false;
    return (
      (sentence.lang === 'ja' && next.lang === 'zh') ||
      (sentence.lang === 'zh' && next.lang === 'ja')
    );
  });

  if (!hasExplicitBilingualPairs) {
    return tagged.map((sentence, pairIndex) => ({
      id: `ch${chapterIndex}-p${pairIndex}`,
      japanese: sentence.text,
      japaneseHtml: sentence.html,
      chinese: '',
      chapterIndex,
      pairIndex,
    }));
  }

  const pairs: SentencePair[] = [];
  let i = 0;
  let pairIndex = 0;

  while (i < tagged.length) {
    const current = tagged[i];
    const next = tagged[i + 1];

    // Look for JA followed by ZH
    if (current.lang === 'ja' && next?.lang === 'zh') {
      pairs.push({
        id: `ch${chapterIndex}-p${pairIndex}`,
        japanese: current.text,
        japaneseHtml: current.html,
        chinese: next.text,
        chapterIndex,
        pairIndex,
      });
      pairIndex++;
      i += 2;
      continue;
    }

    // Look for ZH followed by JA (reverse order)
    if (current.lang === 'zh' && next?.lang === 'ja') {
      pairs.push({
        id: `ch${chapterIndex}-p${pairIndex}`,
        japanese: next.text,
        japaneseHtml: next.html,
        chinese: current.text,
        chapterIndex,
        pairIndex,
      });
      pairIndex++;
      i += 2;
      continue;
    }

    // Keep unmatched Japanese lines so partially bilingual / monolingual
    // chapters still remain readable and can be backfilled later.
    if (current.lang === 'ja') {
      pairs.push({
        id: `ch${chapterIndex}-p${pairIndex}`,
        japanese: current.text,
        japaneseHtml: current.html,
        chinese: '',
        chapterIndex,
        pairIndex,
      });
      pairIndex++;
    }

    i++;
  }

  return pairs;
}
