import type { VocabEntry } from '../../types';
import { formatSynonymsInput, formatVocabReading, splitVocabSentence } from './display';

function formatSentence(entry: VocabEntry): string {
  const parts = splitVocabSentence(entry.example, entry.word);
  const text = parts
    .map((part) => (part.target ? `[[${part.text}]]` : part.text))
    .join('');
  return text || `[[${entry.word}]]`;
}

/** One ref-format line per entry, ready for the old A4 tool. */
export function formatVocabExport(entries: readonly VocabEntry[]): string {
  return entries
    .map((entry) => {
      const segments = [
        formatSentence(entry),
        formatVocabReading(entry.word, entry.reading),
      ];
      if (entry.synonyms.length > 0) {
        segments.push(`類：${formatSynonymsInput(entry.synonyms)}`);
      }
      if (entry.core) segments.push(`CORE：${entry.core}`);
      return segments.join(' :: ');
    })
    .join('\n');
}
