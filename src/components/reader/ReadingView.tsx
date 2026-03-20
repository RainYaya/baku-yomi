import { useState, useRef, useEffect } from 'react';
import { useBookStore } from '../../stores/bookSlice';
import { useSettingsStore } from '../../stores/settingsSlice';
import { SentencePairCard } from './SentencePairCard';
import { PracticePanel } from './PracticePanel';
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

  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const selectedPair = currentChapter?.pairs.find(p => p.id === selectedPairId) ?? null;

  const handleClosePanel = () => setSelectedPairId(null);

  // Close panel when clicking outside (on the reading area)
  const handleReadingAreaClick = (e: React.MouseEvent) => {
    if (selectedPairId && e.target === e.currentTarget) {
      setSelectedPairId(null);
    }
  };

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
          container.scrollTo({ top: savedIndex * 100, behavior: 'instant' });
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
      const currentIndex = Math.floor(scrollTop / 100);
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
    <div className="flex h-full">
      {/* Reading area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto pb-20 transition-all duration-300"
        style={{
          fontSize: `${17 * fontZoom}px`,
          width: selectedPair ? 'calc(100% - 24rem)' : '100%',
        }}
        onClick={handleReadingAreaClick}
      >
        <div className="max-w-2xl mx-auto px-8 py-6">
          {currentChapter.pairs.map((pair) => (
            <SentencePairCard
              key={pair.id}
              pair={pair}
              isSelected={selectedPairId === pair.id}
              onSelect={() => setSelectedPairId(pair.id === selectedPairId ? null : pair.id)}
            />
          ))}
        </div>
      </div>

      {/* Practice panel */}
      <PracticePanel pair={selectedPair} onClose={handleClosePanel} />

      {/* Reading progress */}
      <div
        className="reading-progress"
        style={{ width: `${progressPct}%` }}
      />

      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}
    </div>
  );
}
