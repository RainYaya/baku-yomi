import { useMemo } from 'react';
import { extractKeywords, shuffleKeywords } from '../../lib/chinese/keywords';

interface Props {
  chinese: string;
  onReveal?: () => void;
  showReveal?: boolean;
}

export function KeywordChips({ chinese, onReveal, showReveal }: Props) {
  const chips = useMemo(
    () => shuffleKeywords(extractKeywords(chinese)),
    [chinese]
  );

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {chips.map((word, i) => (
        <span
          key={`${word}-${i}`}
          className="bg-violet-100 text-violet-700 rounded-full px-2 py-0.5 text-sm"
        >
          {word}
        </span>
      ))}
      {showReveal && onReveal && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReveal();
          }}
          className="text-xs text-violet-500 hover:text-violet-700 ml-1"
        >
          查看原文
        </button>
      )}
    </div>
  );
}
