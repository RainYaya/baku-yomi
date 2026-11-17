import { formatVocabReading, splitVocabSentence, vocabSourceLabel } from '../../lib/vocab/display';
import type { Book, VocabEntry } from '../../types';

interface Props {
  entry: VocabEntry;
  books: readonly Book[];
  onOpen: (entry: VocabEntry) => void;
}

export function VocabEntryCard({ entry, books, onOpen }: Props) {
  const parts = splitVocabSentence(entry.example || entry.word, entry.word);

  return (
    <button className="vocab-card" onClick={() => onOpen(entry)}>
      <p className="vocab-card-sentence">
        {parts.map((part, index) =>
          part.target ? (
            <span key={index} className="vocab-target">
              {part.text}
            </span>
          ) : (
            <span key={index}>{part.text}</span>
          )
        )}
      </p>

      <div className="vocab-card-head">
        <span className="vocab-card-word">
          {formatVocabReading(entry.word, entry.reading)}
        </span>
        {entry.meaning && (
          <span className="vocab-card-meaning">{entry.meaning}</span>
        )}
        {entry.status === 'known' && <span className="vocab-chip">已掌握</span>}
      </div>

      {entry.core && <p className="vocab-card-core">{entry.core}</p>}

      <div className="vocab-card-foot">
        <span>{vocabSourceLabel(entry, books)}</span>
        {entry.exampleSource !== 'article' && entry.example && (
          <span className="vocab-chip">
            {entry.exampleSource === 'ai' ? 'AI 例句' : '手动例句'}
          </span>
        )}
      </div>
    </button>
  );
}
