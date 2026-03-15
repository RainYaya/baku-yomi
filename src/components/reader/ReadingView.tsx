import { useState, useEffect, useRef, useCallback } from 'react';
import { useBookStore } from '../../stores/bookSlice';
import { SentencePair } from './SentencePair';
import { EpubUploader } from '../import/EpubUploader';

export function ReadingView() {
  const currentBook = useBookStore((s) => s.getCurrentBook());
  const currentChapter = useBookStore((s) => s.getCurrentChapter());
  const setReadingProgress = useBookStore((s) => s.setReadingProgress);
  const getReadingProgress = useBookStore((s) => s.getReadingProgress);
  const [activePairId, setActivePairId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pairRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const restoredRef = useRef<string | null>(null);

  // Restore scroll position when chapter changes
  useEffect(() => {
    if (!currentChapter) return;
    // Avoid restoring twice for the same chapter
    if (restoredRef.current === currentChapter.id) return;
    restoredRef.current = currentChapter.id;

    const savedIndex = getReadingProgress(currentChapter.id);
    if (savedIndex > 0) {
      // Small delay to let DOM render
      requestAnimationFrame(() => {
        const el = pairRefs.current.get(savedIndex);
        if (el) {
          el.scrollIntoView({ behavior: 'instant', block: 'start' });
        }
      });
    }
  }, [currentChapter, getReadingProgress]);

  // Track reading progress via IntersectionObserver
  useEffect(() => {
    if (!currentChapter) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible pair
        let topIndex = -1;
        let topY = Infinity;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute('data-pair-index'));
            const rect = entry.boundingClientRect;
            if (rect.top < topY) {
              topY = rect.top;
              topIndex = idx;
            }
          }
        }
        if (topIndex >= 0) {
          setReadingProgress(currentChapter.id, topIndex);
        }
      },
      {
        root: containerRef.current?.closest('main'),
        threshold: 0,
        rootMargin: '0px 0px -80% 0px',
      }
    );

    for (const [, el] of pairRefs.current) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [currentChapter, setReadingProgress]);

  const setPairRef = useCallback(
    (index: number, el: HTMLDivElement | null) => {
      if (el) {
        pairRefs.current.set(index, el);
      } else {
        pairRefs.current.delete(index);
      }
    },
    []
  );

  if (!currentBook) {
    return <EpubUploader />;
  }

  if (!currentChapter) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        请在左侧选择章节
      </div>
    );
  }

  const savedProgress = getReadingProgress(currentChapter.id);
  const progressPct =
    currentChapter.pairs.length > 0
      ? Math.round((savedProgress / currentChapter.pairs.length) * 100)
      : 0;

  return (
    <div ref={containerRef} className="max-w-3xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800">
          {currentChapter.title}
        </h2>
        <div className="flex items-center gap-3 mt-1">
          <p className="text-sm text-gray-400">
            {currentChapter.pairs.length} 个句对
          </p>
          <div className="flex items-center gap-2 flex-1">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-32">
              <div
                className="h-full bg-indigo-400 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs text-gray-400">{progressPct}%</span>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        {currentChapter.pairs.map((pair, idx) => (
          <div
            key={pair.id}
            ref={(el) => setPairRef(idx, el)}
            data-pair-index={idx}
          >
            <SentencePair
              pair={pair}
              active={activePairId === pair.id}
              onActivate={() =>
                setActivePairId(activePairId === pair.id ? null : pair.id)
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
