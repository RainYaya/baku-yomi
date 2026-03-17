import { useEffect, useState, useCallback } from 'react';
import type { SentencePair } from '../types';

interface Options {
  pairs: SentencePair[];
  activePairId: string | null;
  setActivePairId: (id: string | null) => void;
  pairRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
  onSubmitTranslation: () => void;
  onToggleNote: () => void;
}

function isInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'textarea' || tag === 'input' || (el as HTMLElement).isContentEditable;
}

export function useKeyboardShortcuts({
  pairs,
  activePairId,
  setActivePairId,
  pairRefs,
  onSubmitTranslation,
  onToggleNote,
}: Options) {
  const [showHelp, setShowHelp] = useState(false);

  const scrollToIndex = useCallback(
    (idx: number) => {
      const el = pairRefs.current.get(idx);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    [pairRefs]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inInput = isInputFocused();

      // Escape — always handled
      if (e.key === 'Escape') {
        if (showHelp) {
          setShowHelp(false);
          return;
        }
        if (inInput) {
          (document.activeElement as HTMLElement).blur();
          return;
        }
        if (activePairId) {
          setActivePairId(null);
          return;
        }
        return;
      }

      // Ctrl+Enter — submit translation from within input
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        if (inInput && activePairId) {
          e.preventDefault();
          onSubmitTranslation();
        }
        return;
      }

      // All other shortcuts only when not in input
      if (inInput) return;

      const activeIdx = activePairId
        ? pairs.findIndex((p) => p.id === activePairId)
        : -1;

      switch (e.key) {
        case 'j':
        case 'ArrowDown': {
          e.preventDefault();
          const nextIdx = activeIdx < pairs.length - 1 ? activeIdx + 1 : 0;
          setActivePairId(pairs[nextIdx].id);
          scrollToIndex(nextIdx);
          break;
        }
        case 'k':
        case 'ArrowUp': {
          e.preventDefault();
          const prevIdx = activeIdx > 0 ? activeIdx - 1 : pairs.length - 1;
          setActivePairId(pairs[prevIdx].id);
          scrollToIndex(prevIdx);
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (activePairId) {
            setActivePairId(null);
          } else if (pairs.length > 0) {
            const idx = activeIdx >= 0 ? activeIdx : 0;
            setActivePairId(pairs[idx].id);
            scrollToIndex(idx);
          }
          break;
        }
        case 'n': {
          if (activePairId) {
            e.preventDefault();
            onToggleNote();
          }
          break;
        }
        case '?': {
          e.preventDefault();
          setShowHelp((v) => !v);
          break;
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [
    pairs,
    activePairId,
    setActivePairId,
    pairRefs,
    onSubmitTranslation,
    onToggleNote,
    showHelp,
    scrollToIndex,
  ]);

  return { showHelp, setShowHelp };
}
