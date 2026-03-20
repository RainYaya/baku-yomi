import { useState, useEffect, useRef } from 'react';
import { useBookStore } from '../../stores/bookSlice';
import { useSettingsStore } from '../../stores/settingsSlice';
import { SentencePair } from './SentencePair';
import { ShortcutHelp } from './ShortcutHelp';
import { EpubUploader } from '../import/EpubUploader';

export function ReadingView() {
  const currentBook = useBookStore((s) => s.getCurrentBook());
  const currentChapter = useBookStore((s) => s.getCurrentChapter());
  const setReadingProgress = useBookStore((s) => s.setReadingProgress);
  const getReadingProgress = useBookStore((s) => s.getReadingProgress);
  const fontZoom = useSettingsStore((s) => s.fontZoom);
  const containerRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef<string | null>(null);

  const [showHelp, setShowHelp] = useState(false);

  // Restore scroll position when chapter changes
  useEffect(() => {
    if (!currentChapter) return;
    if (restoredRef.current === currentChapter.id) return;
    restoredRef.current = currentChapter.id;

    const savedIndex = getReadingProgress(currentChapter.id);
    if (savedIndex > 0) {
      requestAnimationFrame(() => {
        const container = containerRef.current;
        if (container) {
          const pairHeight = 120; // approximate
          const targetScroll = savedIndex * pairHeight;
          container.scrollTo({ top: targetScroll, behavior: 'instant' });
        }
      });
    }
  }, [currentChapter, getReadingProgress]);

  // Simple scroll tracking
  useEffect(() => {
    if (!currentChapter) return;

    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const pairHeight = 120;
      const currentIndex = Math.floor(scrollTop / pairHeight);
      if (currentIndex >= 0 && currentIndex < currentChapter.pairs.length) {
        setReadingProgress(currentChapter.id, currentIndex);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [currentChapter, setReadingProgress]);

  if (!currentBook) {
    return <EpubUploader />;
  }

  if (!currentChapter) {
    return (
      <div className="flex items-center justify-center h-full text-reading opacity-50" style={{ color: 'var(--ink-muted)' }}>
        左侧选择章节
      </div>
    );
  }

  const savedProgress = getReadingProgress(currentChapter.id);
  const progressPct =
    currentChapter.pairs.length > 0
      ? Math.round((savedProgress / currentChapter.pairs.length) * 100)
      : 0;

  return (
    <>
      <div
        ref={containerRef}
        className="h-full overflow-y-auto max-w-3xl mx-auto pb-20 animate-fade-in"
        style={{ fontSize: `${17 * fontZoom}px` }}
      >
        {currentChapter.pairs.map((pair) => (
          <SentencePair key={pair.id} pair={pair} />
        ))}
      </div>

      {/* Japanese Style Reading Progress */}
      <div
        className="reading-progress"
        style={{ width: `${progressPct}%` }}
      />

      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}
    </>
  );
}
