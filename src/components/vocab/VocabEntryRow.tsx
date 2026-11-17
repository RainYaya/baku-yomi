import {
  formatSynonymsInput,
  splitVocabReading,
  splitVocabSentence,
  vocabSourceLabel,
} from '../../lib/vocab/display';
import type { Book, VocabEntry } from '../../types';

interface Props {
  entry: VocabEntry;
  books: readonly Book[];
  onOpen: (entry: VocabEntry) => void;
}

/**
 * One dense entry, in the same order as the ref wordbook line:
 * 例文 :: 単語【かな】〔释义〕 :: 類：… :: CORE：…
 * The sentence keeps the full first line; the fields share the second.
 */
export function VocabEntryRow({ entry, books, onOpen }: Props) {
  const parts = splitVocabSentence(entry.example || entry.word, entry.word);
  const reading = splitVocabReading(entry.word, entry.reading);
  const synonyms = formatSynonymsInput(entry.synonyms);

  return (
    <button className="vocab-row" onClick={() => onOpen(entry)} title={entry.example || entry.word}>
      <span className="vocab-row-line">
        <span className="vocab-row-sentence">
          {parts.map((part, index) =>
            part.target ? (
              <span key={index} className="vocab-target">
                {part.text}
              </span>
            ) : (
              <span key={index}>{part.text}</span>
            )
          )}
        </span>
        <span className="vocab-row-source">{vocabSourceLabel(entry, books)}</span>
      </span>

      <span className="vocab-row-fields">
        <span className="vocab-row-word">
          {reading.word}
          {reading.reading && <span className="vocab-row-reading">{reading.reading}</span>}
        </span>
        {entry.meaning && <span className="vocab-row-meaning">〔{entry.meaning}〕</span>}
        {synonyms && (
          <span className="vocab-row-related">
            <span className="vocab-row-label">類：</span>
            {synonyms}
          </span>
        )}
        {entry.core && (
          <span className="vocab-row-core">
            <span className="vocab-row-label">CORE：</span>
            {entry.core}
          </span>
        )}
        {entry.status === 'known' && <span className="vocab-chip">已掌握</span>}
      </span>
    </button>
  );
}
