import { FiStar } from 'react-icons/fi';
import { useBookStore } from '../../stores/bookSlice';
import { useSavedSentenceStore } from '../../stores/savedSentenceSlice';
import type { SentencePair } from '../../types';

interface Props {
  pair: SentencePair;
  className?: string;
  /** Hide the word and keep only the star, for tight rows. */
  iconOnly?: boolean;
}

/**
 * Star the sentence the reader is on. The entry keeps a snapshot of the text,
 * so the saved page still reads after the source book is gone.
 */
export function SaveSentenceButton({ pair, className = 'paper-chip', iconOnly = false }: Props) {
  const book = useBookStore((s) => s.books.find((entry) => entry.id === s.currentBookId));
  const saved = useSavedSentenceStore((s) =>
    s.sentences.some((sentence) => sentence.pairId === pair.id)
  );
  const toggle = useSavedSentenceStore((s) => s.toggle);

  if (!book) return null;

  const chapter = book.chapters[pair.chapterIndex];
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    toggle({
      bookId: book.id,
      bookTitle: book.title,
      chapterIndex: pair.chapterIndex,
      chapterTitle: chapter?.title ?? `第 ${pair.chapterIndex + 1} 章`,
      pairId: pair.id,
      japanese: pair.japanese,
      chinese: pair.chinese,
    });
  };

  return (
    <button
      className={className}
      onClick={handleClick}
      aria-pressed={saved}
      data-saved={saved ? 'true' : 'false'}
      title={saved ? '取消收藏这句' : '收藏这句'}
    >
      <FiStar size={11} fill={saved ? 'currentColor' : 'none'} />
      {!iconOnly && (saved ? '已收藏' : '收藏')}
    </button>
  );
}
