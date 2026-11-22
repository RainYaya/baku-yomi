import { useCallback, useState } from 'react';
import { useBookStore } from '../stores/bookSlice';
import { usePracticeStore } from '../stores/practiceSlice';
import { useUIStore } from '../stores/uiSlice';
import {
  buildPracticePool,
  pickRandom,
  RANDOM_RECENT_LIMIT,
  type RandomFilters,
} from '../lib/practice/random';

/** Session-local history, shared by the home, review and reader entry points. */
let recentPicks: string[] = [];

function emptyReason(filters: RandomFilters): string {
  if (filters.onlyUnpracticed && filters.onlyWeak) {
    return '当前筛选下没有「没练过」且「70 分以下」的句子。';
  }
  if (filters.onlyUnpracticed) return '当前筛选下没有没练过的句子。';
  if (filters.onlyWeak) return '当前筛选下没有 70 分以下的句子。';
  return '当前筛选下没有可练习的句子。';
}

export function useRandomPractice() {
  const books = useBookStore((s) => s.books);
  const setCurrentBook = useBookStore((s) => s.setCurrentBook);
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const setScrollToPairId = useBookStore((s) => s.setScrollToPairId);
  const setPracticePairId = useBookStore((s) => s.setPracticePairId);
  const analyses = usePracticeStore((s) => s.analyses);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const [reason, setReason] = useState<string | null>(null);

  const practiceRandom = useCallback(
    (filters: RandomFilters = {}) => {
      const pool = buildPracticePool(books, filters, analyses);
      const picked = pickRandom(pool, recentPicks);

      if (!picked) {
        setReason(emptyReason(filters));
        return false;
      }

      recentPicks = [
        ...recentPicks.filter((id) => id !== picked.pairId),
        picked.pairId,
      ].slice(-RANDOM_RECENT_LIMIT);

      setReason(null);
      setCurrentBook(picked.book.id);
      setCurrentChapter(picked.chapter.index);
      setScrollToPairId(picked.pairId);
      setPracticePairId(picked.pairId);
      setCurrentView('reader');
      return true;
    },
    [
      analyses,
      books,
      setCurrentBook,
      setCurrentChapter,
      setCurrentView,
      setPracticePairId,
      setScrollToPairId,
    ]
  );

  return {
    practiceRandom,
    emptyReason: reason,
    clearEmptyReason: () => setReason(null),
  };
}
