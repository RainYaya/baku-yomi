import { useState, useEffect, useRef, useCallback } from 'react';
import { useBookStore } from '../../stores/bookSlice';
import { usePracticeStore } from '../../stores/practiceSlice';
import { useSettingsStore } from '../../stores/settingsSlice';
import { useAnalysis } from '../../hooks/useAnalysis';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { SentencePair } from './SentencePair';
import { ShortcutHelp } from './ShortcutHelp';
import { EpubUploader } from '../import/EpubUploader';

export function ReadingView() {
  const currentBook = useBookStore((s) => s.getCurrentBook());
  const currentChapter = useBookStore((s) => s.getCurrentChapter());
  const setReadingProgress = useBookStore((s) => s.setReadingProgress);
  const getReadingProgress = useBookStore((s) => s.getReadingProgress);
  const fontZoom = useSettingsStore((s) => s.fontZoom);
  const [activePairId, setActivePairId] = useState<string | null>(null);
  const [notePairId, setNotePairId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pairRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const restoredRef = useRef<string | null>(null);

  const translations = usePracticeStore((s) => s.translations);
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const { analyze } = useAnalysis();

  useEffect(() => {
    setNotePairId(null);
  }, [activePairId]);

  const handleKeyboardSubmit = useCallback(async () => {
    if (!activePairId || !currentChapter) return;
    const pair = currentChapter.pairs.find((p) => p.id === activePairId);
    if (!pair) return;
    const text = translations[pair.id] ?? '';
    if (!text.trim() || !aiProvider.apiKey) return;
    try {
      await analyze(pair.id, pair.japanese, pair.chinese, text);
    } catch {
      // Error handled by SentencePair's own state
    }
  }, [activePairId, currentChapter, translations, aiProvider.apiKey, analyze]);

  const handleToggleNote = useCallback(() => {
    if (!activePairId) return;
    setNotePairId((prev) => (prev === activePairId ? null : activePairId));
  }, [activePairId]);

  const { showHelp, setShowHelp } = useKeyboardShortcuts({
    pairs: currentChapter?.pairs ?? [],
    activePairId,
    setActivePairId,
    pairRefs,
    onSubmitTranslation: handleKeyboardSubmit,
    onToggleNote: handleToggleNote,
  });

  // Restore scroll position when chapter changes
  useEffect(() => {
    if (!currentChapter) return;
    if (restoredRef.current === currentChapter.id) return;
    restoredRef.current = currentChapter.id;

    const savedIndex = getReadingProgress(currentChapter.id);
    if (savedIndex > 0) {
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
        className="max-w-3xl mx-auto pb-20 animate-fade-in"
        style={{ fontSize: `${17 * fontZoom}px` }}
      >
        <div>
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
                noteOpen={notePairId === pair.id}
                onToggleNote={() =>
                  setNotePairId(notePairId === pair.id ? null : pair.id)
                }
              />
            </div>
          ))}
        </div>
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
