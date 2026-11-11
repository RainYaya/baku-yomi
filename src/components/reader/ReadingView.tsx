import { Fragment, useState, useRef, useEffect, useCallback } from 'react';
import {
  clearVoicevoxCache,
  getVoicevoxCacheStats,
  playVoicevox,
  prefetchVoicevox,
  setVoicevoxCacheLimit,
  subscribeVoicevoxEnded,
  stopVoicevoxPlayback,
} from '../../lib/tts/voicevox';
import { useBookStore } from '../../stores/bookSlice';
import { usePracticeStore } from '../../stores/practiceSlice';
import { useSettingsStore } from '../../stores/settingsSlice';
import { useUIStore } from '../../stores/uiSlice';
import { SentencePairCard } from './SentencePairCard';
import { InlinePracticeCard, type InlineTab } from './InlinePracticeCard';
import { PracticeDesk } from './PracticeDesk';
import { ShortcutHelp } from './ShortcutHelp';
import { SelectionPopover } from './SelectionPopover';
import { BookmarkList } from './BookmarkList';
import { useTextSelection, type SelectionInfo } from '../../hooks/useTextSelection';
import { useBookmarkStore } from '../../stores/bookmarkSlice';
import { ThemeToggle } from '../../theme/ThemeToggle';
import {
  FiBookmark,
  FiChevronLeft,
  FiChevronRight,
  FiColumns,
  FiPause,
  FiPlay,
  FiSettings,
  FiX,
} from 'react-icons/fi';
import { useMachine } from '../../machines/react';
import {
  autoReadMachine,
  isAutoReadBusy,
  isAutoReadOn,
  readerSessionMachine,
  sessionPairId,
} from '../../machines/reader';
import { registerKeyboardHandler } from '../../lib/keyboard';

/**
 * A spread is exactly two columns plus the gap between them. The multi-column
 * container is one spread wide; further columns overflow to the right and are
 * revealed by translating the container one `pageStep` at a time.
 */
function measureSpread(container: HTMLElement) {
  const gap = parseFloat(getComputedStyle(container).columnGap) || 0;
  const pageStep = Math.max(1, container.clientWidth + gap);

  // Reading order is left-to-right by column, so the last pair sits in the
  // last column. The inline card is inserted after its pair and can be last.
  const pairs = container.querySelectorAll<HTMLElement>('[data-pair-id]');
  const last = pairs[pairs.length - 1];
  let maxRight = last ? last.offsetLeft + last.offsetWidth : 0;
  const card = container.querySelector<HTMLElement>('.inline-card');
  if (card) {
    maxRight = Math.max(maxRight, card.offsetLeft + card.offsetWidth);
  }

  return {
    pageStep,
    pageCount: Math.max(1, Math.ceil(maxRight / pageStep)),
  };
}

export function ReadingView() {
  const currentBook = useBookStore((s) => s.getCurrentBook());
  const currentChapter = useBookStore((s) => s.getCurrentChapter());
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const setReadingProgress = useBookStore((s) => s.setReadingProgress);
  const getReadingProgress = useBookStore((s) => s.getReadingProgress);
  const fontZoom = useSettingsStore((s) => s.fontZoom);
  const changeFontZoom = useSettingsStore((s) => s.changeFontZoom);
  const readerColumns = useSettingsStore((s) => s.readerColumns);
  const setReaderColumns = useSettingsStore((s) => s.setReaderColumns);
  const voicevoxSpeakerId = useSettingsStore((s) => s.voicevoxSpeakerId);
  const voicevoxSpeed = useSettingsStore((s) => s.voicevoxSpeed);
  const voicevoxPitch = useSettingsStore((s) => s.voicevoxPitch);
  const voicevoxVolume = useSettingsStore((s) => s.voicevoxVolume);
  const voicevoxPrefetchWindow = useSettingsStore((s) => s.voicevoxPrefetchWindow);
  const voicevoxCacheLimitMB = useSettingsStore((s) => s.voicevoxCacheLimitMB);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const openSettings = useUIStore((s) => s.openSettings);
  const scrollHostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollBehaviorRef = useRef<ScrollBehavior>('smooth');
  const lastProgressIndexRef = useRef(-1);
  const pendingProgressRef = useRef<number | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const analyses = usePracticeStore((s) => s.analyses);
  const { state: session, send: sendSession } = useMachine(readerSessionMachine, {
    debugId: 'reader.session',
    debug: import.meta.env.DEV,
  });
  const { state: autoRead, send: sendAutoRead } = useMachine(autoReadMachine, {
    debugId: 'reader.autoRead',
  });
  const autoReadRef = useRef(autoRead);
  const [showHelp, setShowHelp] = useState(false);
  const [inlineTab, setInlineTab] = useState<InlineTab>('practice');
  const [explainFragment, setExplainFragment] = useState('');
  const [showBookmarkList, setShowBookmarkList] = useState(false);
  const [chapterMenuOpen, setChapterMenuOpen] = useState(false);
  // The two-column spread is a desktop affordance; tablets and phones keep
  // the single-column flow they were tuned for.
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1100px)').matches : false
  );
  const selectedPairIdRef = useRef<string | null>(null);
  const lastFontZoomRef = useRef(fontZoom);
  const [spreadPage, setSpreadPage] = useState(0);
  const [spreadPageCount, setSpreadPageCount] = useState(1);
  const [spreadPageStep, setSpreadPageStep] = useState(0);
  const [spreadAnimate, setSpreadAnimate] = useState(false);
  const spreadPageRef = useRef(0);
  const spreadPageCountRef = useRef(1);
  const spreadPageStepRef = useRef(0);
  const lastWheelTurnRef = useRef(0);
  const lastSelectedPairId = useRef<string | null>(null);
  const skipNextScrollRef = useRef(false);
  const pendingFocusRef = useRef(false);
  const PREFETCH_WINDOW = voicevoxPrefetchWindow;
  const CACHE_MAX_MB = voicevoxCacheLimitMB;

  const selectedPairId = sessionPairId(session);
  const inlineOpen = session.surface === 'inline';
  const deskOpen = session.surface === 'desk';
  const autoReadOn = isAutoReadOn(autoRead);
  const autoReadBusy = isAutoReadBusy(autoRead);
  const columnMode: 1 | 2 = isDesktop && readerColumns === 2 ? 2 : 1;

  useEffect(() => {
    selectedPairIdRef.current = selectedPairId;
  }, [selectedPairId]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1100px)');
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    // Device emulation and some embedded webviews change the viewport
    // without dispatching the media-query change event.
    window.addEventListener('resize', update);
    return () => {
      query.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    autoReadRef.current = autoRead;
  }, [autoRead]);

  const { selection, clearSelection, hasJustSelected, keepSelection } = useTextSelection();
  const allBookmarks = useBookmarkStore((s) => s.bookmarks);
  const scrollToBookmarkId = useBookmarkStore((s) => s.scrollToBookmarkId);
  const setScrollToBookmarkId = useBookmarkStore((s) => s.setScrollToBookmarkId);
  const getBookmarkById = useBookmarkStore((s) => s.getBookmarkById);

  const selectedPair = currentChapter?.pairs.find((p) => p.id === selectedPairId) ?? null;
  const chapterBookmarkCount = currentChapter
    ? allBookmarks.filter((b) => b.chapterId === currentChapter.id).length
    : 0;

  const getPairElement = useCallback((pairId: string) => {
    const container = scrollHostRef.current;
    if (!container) return null;
    return container.querySelector<HTMLElement>(
      `[data-pair-id="${CSS.escape(pairId)}"]`
    );
  }, []);

  const ensureSpreadMetrics = useCallback(() => {
    const container = scrollHostRef.current;
    if (!container) return null;
    const metrics = measureSpread(container);
    spreadPageStepRef.current = metrics.pageStep;
    spreadPageCountRef.current = metrics.pageCount;
    return metrics;
  }, []);

  const turnToSpreadPage = useCallback((next: number, animate = true) => {
    const clamped = Math.max(0, Math.min(spreadPageCountRef.current - 1, next));
    if (clamped === spreadPageRef.current) return;
    spreadPageRef.current = clamped;
    setSpreadAnimate(animate);
    setSpreadPage(clamped);
  }, []);

  const scrollPairToCenter = useCallback(
    (pairId: string) => {
      const container = scrollHostRef.current;
      const element = getPairElement(pairId);
      if (!container || !element) return;

      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();

      const targetScrollTop =
        container.scrollTop +
        (elementRect.top - containerRect.top) -
        containerRect.height / 2 +
        elementRect.height / 2;

      container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
    },
    [getPairElement]
  );

  /**
   * Vim-style "scrolloff": keep the selected sentence inside a comfortable
   * band and scroll only when it would leave that band. Centering every
   * single `j`/`k` makes fast navigation feel like the page is chasing the
   * cursor; minimal scrolling keeps the movement predictable.
   */
  const scrollPairIntoView = useCallback(
    (pairId: string, behavior: ScrollBehavior = 'smooth') => {
      const container = scrollHostRef.current;
      const element = getPairElement(pairId);
      if (!container || !element) return;

      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();

      if (columnMode === 2) {
        // The spread pages in whole spreads. Turn to the page that holds the
        // sentence instead of nudging the columns horizontally.
        const metrics = ensureSpreadMetrics();
        if (!metrics) return;
        const x = elementRect.left - containerRect.left;
        const targetPage = Math.floor(x / metrics.pageStep + 0.001);
        // Defer the state update so selection effects never set state
        // synchronously; layout is already measured at this point.
        requestAnimationFrame(() =>
          turnToSpreadPage(targetPage, behavior === 'smooth')
        );
        return;
      }

      const margin = Math.min(140, Math.max(48, containerRect.height * 0.18));
      const topBoundary = containerRect.top + margin;
      const bottomBoundary = containerRect.bottom - margin;

      if (elementRect.top >= topBoundary && elementRect.bottom <= bottomBoundary) {
        return;
      }

      const delta =
        elementRect.top < topBoundary
          ? elementRect.top - topBoundary
          : elementRect.bottom - bottomBoundary;

      container.scrollTo({
        top: container.scrollTop + delta,
        behavior,
      });
    },
    [columnMode, ensureSpreadMetrics, getPairElement, turnToSpreadPage]
  );

  /**
   * Navigation (auto-read, bookmarks) wants the sentence visible. In the
   * spread that means turning to the page that holds it; in the vertical
   * flow it means centring it.
   */
  const scrollPairToReadingPosition = useCallback(
    (pairId: string) => {
      if (columnMode === 2) {
        scrollPairIntoView(pairId);
      } else {
        scrollPairToCenter(pairId);
      }
    },
    [columnMode, scrollPairToCenter, scrollPairIntoView]
  );

  useEffect(() => {
    // The column element is re-created when the spread structure changes.
    scrollHostRef.current = stageRef.current;
  }, [columnMode, currentChapter?.id]);

  const syncSpread = useCallback(() => {
    if (columnMode !== 2) return;
    const container = scrollHostRef.current;
    if (!container) return;

    // `column-width` cannot take a percentage. Pin it to the exact half of
    // the clipped viewport so exactly two columns fill a spread; the CSS
    // calc() is only the pre-hydration fallback.
    const gap = parseFloat(getComputedStyle(container).columnGap) || 0;
    const columnWidth = Math.max(1, (container.clientWidth - gap) / 2);
    const currentWidth = parseFloat(container.style.columnWidth);
    if (!Number.isFinite(currentWidth) || Math.abs(currentWidth - columnWidth) > 0.5) {
      container.style.columnWidth = `${columnWidth}px`;
    }

    const { pageStep, pageCount } = measureSpread(container);
    // A step change (resize, column-width change) must land instantly; a
    // page-count-only change must not cancel an in-flight page turn.
    const stepChanged = Math.abs(pageStep - spreadPageStepRef.current) > 0.5;
    spreadPageStepRef.current = pageStep;
    spreadPageCountRef.current = pageCount;
    const next = Math.min(spreadPageRef.current, pageCount - 1);
    spreadPageRef.current = next;
    if (stepChanged) setSpreadAnimate(false);
    setSpreadPageStep(pageStep);
    setSpreadPageCount(pageCount);
    setSpreadPage(next);
  }, [columnMode]);

  // Re-measure the spread after layout changes that can change the number of
  // columns: resize, font zoom, chapter change, inline card open/close or a
  // feedback pane growing. Measurements happen after layout, never during
  // render.
  useEffect(() => {
    if (columnMode !== 2) return;
    const container = scrollHostRef.current;
    if (!container) return;

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => syncSpread());
    };
    schedule();

    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    const card = container.querySelector<HTMLElement>('.inline-card');
    if (card) observer.observe(card);

    // Web fonts can change the line height and therefore the column count
    // after the first measurement.
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) schedule();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [
    columnMode,
    syncSpread,
    currentChapter?.id,
    inlineOpen,
    session.pairId,
    inlineTab,
    fontZoom,
  ]);

  // Two-column mode turns whole spreads, never free horizontal scrolling.
  // Text fields keep their own scrolling.
  useEffect(() => {
    if (columnMode !== 2) return;
    const container = scrollHostRef.current;
    if (!container) return;
    // Listen on the sheet, not only the column: the chapter head and footer
    // are siblings of the scroll container and should page too.
    const wheelHost = container.closest<HTMLElement>('.binder-sheet') ?? container;

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('textarea, input, [contenteditable="true"]')) return;

      // Let a scrollable card body consume the wheel first; chain to the
      // spread when it reaches an edge. A non-scrolling body must not
      // swallow the wheel (the old inline-card trap).
      let node: HTMLElement | null = target;
      while (node && node !== wheelHost) {
        if (node.matches('.expand-body, .explain-content-body')) {
          const canScroll = node.scrollHeight > node.clientHeight + 1;
          if (canScroll) {
            const goingUp = event.deltaY < 0;
            const atTop = node.scrollTop <= 0;
            const atBottom =
              node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
            if (!(goingUp && atTop) && !(!goingUp && atBottom)) return;
          }
        }
        node = node.parentElement;
      }

      // A wheel gesture turns exactly one spread. Trackpads emit a burst of
      // small events, so a short cooldown keeps the page from skipping.
      if (event.deltaY === 0) return;
      const now = performance.now();
      if (now - lastWheelTurnRef.current < 450) {
        event.preventDefault();
        return;
      }
      lastWheelTurnRef.current = now;
      const metrics = ensureSpreadMetrics();
      if (!metrics) return;
      turnToSpreadPage(
        spreadPageRef.current + (event.deltaY > 0 ? 1 : -1),
        true
      );
      event.preventDefault();
    };

    wheelHost.addEventListener('wheel', handleWheel, { passive: false });
    return () => wheelHost.removeEventListener('wheel', handleWheel);
  }, [columnMode, ensureSpreadMetrics, turnToSpreadPage]);

  // Switching between the vertical flow and the spread leaves the old axis
  // scrolled; reset it and bring the current reading position back into view.
  useEffect(() => {
    const container = scrollHostRef.current;
    if (!container) return;
    if (columnMode === 1) {
      container.scrollLeft = 0;
    } else {
      container.scrollTop = 0;
    }
    const savedIndex = currentChapter
      ? getReadingProgress(currentChapter.id)
      : 0;
    const id =
      selectedPairIdRef.current ??
      currentChapter?.pairs[savedIndex]?.id ??
      null;
    if (!id) {
      if (columnMode === 2) {
        requestAnimationFrame(() => turnToSpreadPage(0, false));
      }
      return;
    }
    const frame = requestAnimationFrame(() => scrollPairIntoView(id, 'auto'));
    return () => cancelAnimationFrame(frame);
  }, [
    columnMode,
    currentChapter,
    getReadingProgress,
    scrollPairIntoView,
    turnToSpreadPage,
  ]);

  // Font size changes reflow the columns; keep the current sentence visible.
  // Selection changes are handled by the smooth selection effect, so this
  // only reacts to an actual zoom change.
  useEffect(() => {
    if (columnMode !== 2) return;
    if (lastFontZoomRef.current === fontZoom) return;
    lastFontZoomRef.current = fontZoom;
    const id = selectedPairIdRef.current;
    if (!id) return;
    const frame = requestAnimationFrame(() => scrollPairIntoView(id, 'auto'));
    return () => cancelAnimationFrame(frame);
  }, [fontZoom, columnMode, scrollPairIntoView]);

  const prefetchAhead = useCallback(
    (fromPairId: string, count = PREFETCH_WINDOW) => {
      if (!currentChapter) return;
      const startIndex = currentChapter.pairs.findIndex((p) => p.id === fromPairId);
      if (startIndex < 0) return;

      const candidates = currentChapter.pairs.slice(startIndex + 1, startIndex + 1 + count);
      for (const pair of candidates) {
        void prefetchVoicevox(pair.japanese, voicevoxSpeakerId, {
          speedScale: voicevoxSpeed,
          pitchScale: voicevoxPitch,
          volumeScale: voicevoxVolume,
        }).catch((error) => {
          console.warn('Prefetch failed:', error);
        });
      }
    },
    [currentChapter, voicevoxPitch, voicevoxSpeakerId, voicevoxSpeed, voicevoxVolume, PREFETCH_WINDOW]
  );

  const startPlayPair = useCallback(
    async (pairId: string) => {
      if (!currentChapter) return;
      const pair = currentChapter.pairs.find((p) => p.id === pairId);
      if (!pair) return;

      try {
        prefetchAhead(pair.id);
        await playVoicevox(pair.japanese, voicevoxSpeakerId, pair.id, {
          speedScale: voicevoxSpeed,
          pitchScale: voicevoxPitch,
          volumeScale: voicevoxVolume,
        });
        sendAutoRead({ type: 'STARTED', pairId });
      } catch (error) {
        console.error('Auto read failed:', error);
        sendAutoRead({ type: 'ERROR' });
      }
    },
    [
      currentChapter,
      prefetchAhead,
      sendAutoRead,
      voicevoxPitch,
      voicevoxSpeakerId,
      voicevoxSpeed,
      voicevoxVolume,
    ]
  );

  const handleSelectPair = useCallback(
    (pairId: string | null) => {
      if (!pairId) {
        sendSession({ type: 'DESELECT' });
        setExplainFragment('');
        return;
      }
      lastSelectedPairId.current = pairId;
      if (pairId !== selectedPairId) setExplainFragment('');
      sendSession({
        type: 'SELECT',
        pairId,
        hasAnalysis: Boolean(analyses[pairId]),
      });
    },
    [analyses, selectedPairId, sendSession]
  );

  const ensureSelected = useCallback(
    (pairId: string) => {
      lastSelectedPairId.current = pairId;
      if (pairId !== selectedPairId) {
        sendSession({
          type: 'SELECT',
          pairId,
          hasAnalysis: Boolean(analyses[pairId]),
        });
      }
    },
    [analyses, selectedPairId, sendSession]
  );

  const handlePractice = useCallback(
    (pairId: string) => {
      ensureSelected(pairId);
      setExplainFragment('');
      setInlineTab('practice');
      sendSession({ type: 'OPEN_INLINE' });
    },
    [ensureSelected, sendSession]
  );

  const handleExplain = useCallback(
    (pairId: string) => {
      ensureSelected(pairId);
      setExplainFragment('');
      setInlineTab('explain');
      sendSession({ type: 'OPEN_INLINE' });
    },
    [ensureSelected, sendSession]
  );

  const handleDesk = useCallback(
    (pairId: string) => {
      ensureSelected(pairId);
      sendSession({ type: 'OPEN_DESK' });
    },
    [ensureSelected, sendSession]
  );

  /**
   * Explain a selected fragment. The sentence comes from the chapter rather
   * than from the DOM: selection offsets are computed against the rendered
   * card, which includes furigana and bookmark wrappers. Anchoring against the
   * stored sentence keeps the offsets meaningful.
   */
  const handleExplainSelection = useCallback(
    (selection: SelectionInfo) => {
      const pair = currentChapter?.pairs.find((p) => p.id === selection.pairId);
      if (!pair) return;
      ensureSelected(pair.id);
      setExplainFragment(selection.text);
      setInlineTab('explain');
      sendSession({ type: 'OPEN_INLINE' });
    },
    [currentChapter, ensureSelected, sendSession]
  );

  const handleBack = useCallback(() => {
    sendSession({ type: 'BACK' });
  }, [sendSession]);

  const handleCloseAll = useCallback(() => {
    sendSession({ type: 'CLOSE' });
  }, [sendSession]);

  const handleOpenDesk = useCallback(() => {
    sendSession({ type: 'OPEN_DESK' });
  }, [sendSession]);

  // Stable callback shared by every sentence card, so memoized cards do not
  // all re-render when the selection changes.
  const handleCardSelect = useCallback(
    (pairId: string, wasSelected: boolean) => {
      if (hasJustSelected()) return;
      skipNextScrollRef.current = true;
      handleSelectPair(wasSelected ? null : pairId);
    },
    [handleSelectPair, hasJustSelected]
  );

  useEffect(() => {
    if (!currentChapter) {
      sendAutoRead({ type: 'FINISH' });
      return;
    }

    const unsubscribe = subscribeVoicevoxEnded((endedPairId) => {
      if (autoReadRef.current.status !== 'playing') return;
      const endedIndex = endedPairId
        ? currentChapter.pairs.findIndex((p) => p.id === endedPairId)
        : -1;

      if (endedIndex < 0 || endedIndex >= currentChapter.pairs.length - 1) {
        sendAutoRead({ type: 'FINISH' });
        return;
      }

      const nextPair = currentChapter.pairs[endedIndex + 1];
      // Auto-read owns the scroll target; skip the selection effect so the
      // card is not scrolled twice.
      skipNextScrollRef.current = true;
      handleSelectPair(nextPair.id);
      scrollPairToReadingPosition(nextPair.id);
      sendAutoRead({ type: 'ADVANCE', pairId: nextPair.id });
      void startPlayPair(nextPair.id);
    });

    return unsubscribe;
  }, [
    currentChapter,
    handleSelectPair,
    scrollPairToReadingPosition,
    sendAutoRead,
    startPlayPair,
  ]);

  useEffect(() => {
    setVoicevoxCacheLimit(CACHE_MAX_MB * 1024 * 1024);
  }, [CACHE_MAX_MB]);

  const currentChapterId = currentChapter?.id;

  useEffect(() => {
    if (!currentChapterId) {
      clearVoicevoxCache();
      return;
    }

    const stats = getVoicevoxCacheStats();
    const usageMB = (stats.totalBytes / (1024 * 1024)).toFixed(1);
    const limitMB = (stats.maxBytes / (1024 * 1024)).toFixed(0);
    console.debug(`[TTS cache] ${usageMB}MB / ${limitMB}MB, items=${stats.items}, evictions=${stats.evictions}`);
  }, [currentChapterId]);

  const toggleAutoRead = useCallback(() => {
    const pairs = currentChapter?.pairs ?? [];

    if (autoReadRef.current.status !== 'off') {
      sendAutoRead({ type: 'FINISH' });
      stopVoicevoxPlayback();
      return;
    }

    if (pairs.length === 0) return;

    const fallbackId = lastSelectedPairId.current ?? pairs[0]?.id ?? null;
    const startId = selectedPairId ?? fallbackId;
    if (!startId) return;

    sendAutoRead({ type: 'START', pairId: startId });

    if (selectedPairId !== startId) {
      // The explicit center below owns the scroll target.
      skipNextScrollRef.current = true;
      handleSelectPair(startId);
    }
    scrollPairToReadingPosition(startId);
    void prefetchVoicevox(
      currentChapter?.pairs.find((p) => p.id === startId)?.japanese ?? '',
      voicevoxSpeakerId,
      {
        speedScale: voicevoxSpeed,
        pitchScale: voicevoxPitch,
        volumeScale: voicevoxVolume,
      }
    ).catch(() => undefined);
    prefetchAhead(startId);
    void startPlayPair(startId);
  }, [
    currentChapter,
    handleSelectPair,
    prefetchAhead,
    scrollPairToReadingPosition,
    selectedPairId,
    sendAutoRead,
    startPlayPair,
    voicevoxSpeakerId,
    voicevoxSpeed,
    voicevoxPitch,
    voicevoxVolume,
  ]);

  const focusInput = useCallback(() => {
    if (session.surface === 'inline' || session.surface === 'desk') {
      inputRef.current?.focus();
      return;
    }
    if (selectedPairId) {
      setInlineTab('practice');
      sendSession({ type: 'OPEN_INLINE' });
      pendingFocusRef.current = true;
    }
  }, [selectedPairId, sendSession, session.surface]);

  const blurInput = useCallback(() => {
    inputRef.current?.blur();
  }, []);

  useEffect(() => {
    if (!pendingFocusRef.current) return;
    if (!inlineOpen && !deskOpen) return;
    pendingFocusRef.current = false;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [deskOpen, inlineOpen]);

  // Opening S1 inserts a tall card below the sentence. Keep the card head in
  // view instead of letting scroll anchoring leave it above the viewport.
  useEffect(() => {
    if (!inlineOpen || !session.pairId) return;
    const frame = requestAnimationFrame(() => {
      const container = scrollHostRef.current;
      const card = container?.querySelector<HTMLElement>('.inline-card');
      if (!container || !card) return;
      const containerRect = container.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      if (columnMode === 2) {
        const metrics = ensureSpreadMetrics();
        if (!metrics) return;
        const x = cardRect.left - containerRect.left;
        turnToSpreadPage(Math.floor(x / metrics.pageStep + 0.001), true);
        return;
      }
      const top = container.scrollTop + cardRect.top - containerRect.top - 70;
      container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    inlineOpen,
    session.pairId,
    columnMode,
    ensureSpreadMetrics,
    turnToSpreadPage,
  ]);

  // j/k 导航 & 句内/练习桌快捷键
  useEffect(() => {
    const pairs = currentChapter?.pairs ?? [];
    let giPending = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'INPUT' ||
        target.isContentEditable;

      // An IME uses Escape to cancel a conversion. Never treat that as a
      // navigation key.
      if (e.isComposing) return false;

      if (e.key === 'Escape') {
        if (chapterMenuOpen) {
          setChapterMenuOpen(false);
        } else if (session.surface === 'desk') {
          handleBack();
        } else if (session.surface === 'inline') {
          if (inlineTab === 'explain') {
            setInlineTab('practice');
          } else {
            handleBack();
          }
        } else if (session.surface === 'selected') {
          handleSelectPair(null);
        } else if (isInput) {
          blurInput();
        }
        clearSelection();
        return true;
      }

      if (isInput) return false;
      // The desk is its own mode; reading shortcuts must not fire behind it.
      if (session.surface === 'desk') return false;

      if (columnMode === 2) {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') {
          turnToSpreadPage(spreadPageRef.current + 1);
          return true;
        }
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
          turnToSpreadPage(spreadPageRef.current - 1);
          return true;
        }
      }

      // 用 lastSelectedPairId 作为当前位置基准
      const currentId = selectedPairId ?? lastSelectedPairId.current;

      if (e.key === 'j') {
        const currentIndex = currentId ? pairs.findIndex((p) => p.id === currentId) : -1;
        if (currentIndex < pairs.length - 1) {
          // Held keys should move like Vim: instant, not a queue of smooth
          // animations that keep restarting.
          scrollBehaviorRef.current = e.repeat ? 'auto' : 'smooth';
          handleSelectPair(pairs[currentIndex + 1].id);
        } else if (currentIndex === -1 && pairs.length > 0) {
          scrollBehaviorRef.current = e.repeat ? 'auto' : 'smooth';
          handleSelectPair(pairs[0].id);
        }
        return true;
      }

      if (e.key === 'k') {
        const currentIndex = currentId ? pairs.findIndex((p) => p.id === currentId) : -1;
        if (currentIndex > 0) {
          scrollBehaviorRef.current = e.repeat ? 'auto' : 'smooth';
          handleSelectPair(pairs[currentIndex - 1].id);
        }
        return true;
      }

      if (e.key === 'g' && !e.repeat) {
        giPending = true;
        setTimeout(() => {
          giPending = false;
        }, 500);
        return true;
      }

      if (e.key === 'i' && giPending) {
        if (selectedPairId) {
          focusInput();
          giPending = false;
          return true;
        }
        return false;
      }

      if (e.key.toLowerCase() === 'p' && selectedPairId) {
        if (e.shiftKey) {
          handleDesk(selectedPairId);
        } else {
          handlePractice(selectedPairId);
        }
        return true;
      }

      if (e.key.toLowerCase() === 'e' && selectedPairId) {
        handleExplain(selectedPairId);
        return true;
      }

      if (e.key === 'r') {
        toggleAutoRead();
        return true;
      }

      if (e.key === '?') {
        setShowHelp(true);
        return true;
      }

      return false;
    };

    return registerKeyboardHandler('reader', 10, handleKeyDown);
  }, [
    currentChapter,
    selectedPairId,
    inlineTab,
    session.surface,
    chapterMenuOpen,
    columnMode,
    turnToSpreadPage,
    focusInput,
    blurInput,
    clearSelection,
    toggleAutoRead,
    handleSelectPair,
    handlePractice,
    handleExplain,
    handleDesk,
    handleBack,
  ]);

  // Bookmark list popover: Escape closes it before the reader panel.
  useEffect(() => {
    if (!showBookmarkList) return;

    return registerKeyboardHandler('bookmark-panel', 100, (event) => {
      if (event.key !== 'Escape') return false;
      setShowBookmarkList(false);
      return true;
    });
  }, [showBookmarkList]);

  // 选中变化时滚动到可视区域（鼠标点击不滚动，避免干扰文本选择）
  useEffect(() => {
    if (!selectedPairId) return;
    if (skipNextScrollRef.current) {
      skipNextScrollRef.current = false;
      return;
    }
    scrollPairIntoView(selectedPairId, scrollBehaviorRef.current);
    scrollBehaviorRef.current = 'smooth';
  }, [selectedPairId, scrollPairIntoView]);

  // 书签跳转
  useEffect(() => {
    if (!scrollToBookmarkId || !scrollHostRef.current) return;

    const bookmark = getBookmarkById(scrollToBookmarkId);
    if (!bookmark) {
      setScrollToBookmarkId(null);
      return;
    }

    const element = getPairElement(bookmark.pairId);
    if (element) {
      // The explicit center below owns the scroll target.
      skipNextScrollRef.current = true;
      handleSelectPair(bookmark.pairId);

      requestAnimationFrame(() => {
        scrollPairToReadingPosition(bookmark.pairId);
      });
    }
    setScrollToBookmarkId(null);
  }, [
    scrollToBookmarkId,
    getBookmarkById,
    getPairElement,
    setScrollToBookmarkId,
    handleSelectPair,
    scrollPairToReadingPosition,
  ]);

  // Close panel when clicking outside (on the reading area)
  const handleReadingAreaClick = (e: React.MouseEvent) => {
    setChapterMenuOpen(false);
    // 如果刚刚有文字选中，不处理（让 SelectionPopover 处理）
    if (hasJustSelected()) return;

    // Touch selection can commit after the click event; a non-empty native
    // selection must not be cleared by the same tap that created it.
    if (window.getSelection()?.toString().trim()) return;

    if (selectedPairId && e.target === e.currentTarget) {
      handleCloseAll();
    }
    clearSelection();
  };

  // Restore scroll position when chapter changes. Pair heights vary, so jump
  // to the saved sentence rather than guessing a pixel offset.
  useEffect(() => {
    if (!currentChapter) return;
    if (restoredRef.current === currentChapter.id) return;
    restoredRef.current = currentChapter.id;

    const savedIndex = getReadingProgress(currentChapter.id);
    if (savedIndex > 0) {
      requestAnimationFrame(() => {
        const container = scrollHostRef.current;
        const pair = currentChapter.pairs[Math.min(savedIndex, currentChapter.pairs.length - 1)];
        if (!container || !pair) return;
        const element = container.querySelector<HTMLElement>(
          `[data-pair-id="${CSS.escape(pair.id)}"]`
        );
        if (!element) return;
        if (columnMode === 2) {
          const containerRect = container.getBoundingClientRect();
          const elementRect = element.getBoundingClientRect();
          const metrics = ensureSpreadMetrics();
          if (!metrics) return;
          const x = elementRect.left - containerRect.left;
          turnToSpreadPage(Math.floor(x / metrics.pageStep + 0.001), false);
          return;
        }
        const offset =
          element.getBoundingClientRect().top -
          container.getBoundingClientRect().top +
          container.scrollTop -
          24;
        container.scrollTo({ top: Math.max(0, offset), behavior: 'instant' });
      });
    }
  }, [
    currentChapter,
    getReadingProgress,
    columnMode,
    ensureSpreadMetrics,
    turnToSpreadPage,
  ]);

  useEffect(() => {
    return () => {
      stopVoicevoxPlayback();
    };
  }, []);

  // Persist reading progress at most a few times per second. Writing the
  // whole book store to localStorage on every scroll event is the main
  // source of scroll jank.
  useEffect(() => {
    if (!currentChapter) return;
    // In the spread there is no vertical reading position to measure; the
    // selected sentence is the cursor, so progress follows selection below.
    if (columnMode === 2) return;
    const container = scrollHostRef.current;
    if (!container) return;

    const chapterId = currentChapter.id;
    const pairNodes = Array.from(
      container.querySelectorAll<HTMLElement>('[data-pair-id]')
    );
    lastProgressIndexRef.current = -1;
    pendingProgressRef.current = null;

    const flush = () => {
      const index = pendingProgressRef.current;
      pendingProgressRef.current = null;
      if (index == null) return;
      setReadingProgress(chapterId, index);
    };

    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top + 48;
      let currentIndex = 0;
      for (let i = 0; i < pairNodes.length; i += 1) {
        if (pairNodes[i].getBoundingClientRect().top <= containerTop) {
          currentIndex = i;
        } else {
          break;
        }
      }
      if (currentIndex === lastProgressIndexRef.current) return;

      lastProgressIndexRef.current = currentIndex;
      pendingProgressRef.current = currentIndex;
      if (progressTimerRef.current) return;

      progressTimerRef.current = setTimeout(() => {
        progressTimerRef.current = null;
        flush();
      }, 200);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (progressTimerRef.current) {
        clearTimeout(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      flush();
    };
  }, [currentChapter, setReadingProgress, columnMode]);

  // Two-column progress follows the sentence cursor rather than scrollTop.
  useEffect(() => {
    if (columnMode !== 2 || !currentChapter || !selectedPairId) return;
    const index = currentChapter.pairs.findIndex((p) => p.id === selectedPairId);
    if (index >= 0) setReadingProgress(currentChapter.id, index);
  }, [columnMode, currentChapter, selectedPairId, setReadingProgress]);

  const switchChapter = useCallback(
    (index: number) => {
      setChapterMenuOpen(false);
      setCurrentChapter(index);
      setExplainFragment('');
      sendSession({ type: 'DESELECT' });
      // Reset both the vertical scroll and the spread page; the restore
      // effect above then jumps to the saved sentence.
      turnToSpreadPage(0, false);
      requestAnimationFrame(() => stageRef.current?.scrollTo({ top: 0, left: 0 }));
    },
    [sendSession, setCurrentChapter, turnToSpreadPage]
  );

  if (!currentBook) return null;

  if (!currentChapter) {
    return (
      <div className="binder-stage">
        <div className="binder">
          <div className="binder-sheet">
            <p className="chapter-byline">这本书还没有可阅读的章节。</p>
          </div>
        </div>
      </div>
    );
  }

  const savedProgress = getReadingProgress(currentChapter.id);
  const totalPairs = currentChapter.pairs.length;
  const currentIndex = Math.min(totalPairs, Math.max(1, savedProgress + 1));

  const chapterHead = (
    <>
      <div className="chapter-kicker">
        第 {currentChapter.index + 1} 章 · CHAPTER {currentChapter.index + 1}
      </div>
      <h1 className="chapter-title">{currentChapter.title}</h1>
      <p className="chapter-byline">
        {currentBook.author && currentBook.author !== '[object Object]'
          ? currentBook.author
          : '未知作者'}{' '}
        · {currentChapter.pairs.length} 句
      </p>
    </>
  );

  const pairList = currentChapter.pairs.map((pair) => (
    <Fragment key={pair.id}>
      <SentencePairCard
        pair={pair}
        isSelected={selectedPairId === pair.id}
        onSelect={handleCardSelect}
        onPractice={handlePractice}
        onExplain={handleExplain}
      />
      {inlineOpen && session.pairId === pair.id && (
        <InlinePracticeCard
          pair={pair}
          session={session}
          tab={inlineTab}
          fragment={explainFragment}
          onTabChange={setInlineTab}
          onClose={handleBack}
          onOpenDesk={handleOpenDesk}
          onSessionEvent={sendSession}
          inputRef={inputRef}
        />
      )}
    </Fragment>
  ));

  const readFoot = (
    <footer className="read-foot">
      <span>
        <kbd>j</kbd>/<kbd>k</kbd> 移动
        {columnMode === 2 && (
          <>
            {' · '}滚轮 / <kbd>←</kbd>
            <kbd>→</kbd> 翻页
          </>
        )}{' '}
        · <kbd>P</kbd> 練習 · <kbd>E</kbd> 講解 · <kbd>?</kbd> 全部快捷键
      </span>
      <div className="read-foot-end">
        {columnMode === 2 && (
          <div className="spread-pager">
            <button
              className="spread-pager-btn"
              onClick={() => turnToSpreadPage(spreadPage - 1)}
              disabled={spreadPage <= 0}
              aria-label="上一页"
              title="上一页"
            >
              <FiChevronLeft size={14} />
            </button>
            <span className="spread-pager-count">
              {spreadPage + 1} / {spreadPageCount}
            </span>
            <button
              className="spread-pager-btn"
              onClick={() => turnToSpreadPage(spreadPage + 1)}
              disabled={spreadPage >= spreadPageCount - 1}
              aria-label="下一页"
              title="下一页"
            >
              <FiChevronRight size={14} />
            </button>
          </div>
        )}
        <button className="foot-audio" data-on={autoReadOn} onClick={toggleAutoRead}>
          {autoReadOn ? <FiPause size={11} /> : <FiPlay size={11} />}
          {autoReadOn ? '正在连续朗读' : '朗读整章'}
        </button>
      </div>
    </footer>
  );

  return (
    <div
      className="binder-stage"
      data-reader-state={session.surface}
      data-columns={columnMode}
      data-inline-tab={inlineTab}
      data-auto-read-state={autoRead.status}
      data-selection-state={selection ? 'selected' : 'idle'}
      data-bookmark-panel-state={showBookmarkList ? 'open' : 'closed'}
      data-help-state={showHelp ? 'open' : 'closed'}
    >
      <div className="binder">
        <div className="punch" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, index) => (
            <span key={index} className="hole" />
          ))}
        </div>
        <div className="margin-rule" aria-hidden="true" />

        <button
          className="binder-label binder-label-btn"
          onClick={() => setChapterMenuOpen((open) => !open)}
          title="切换章节"
          aria-expanded={chapterMenuOpen}
        >
          <b>{currentBook.title}</b>
          <span>
            {currentChapter.index + 1} · {currentChapter.title}
          </span>
        </button>

        {chapterMenuOpen && (
          <div className="chapter-menu" role="menu" aria-label="章节">
            <div className="chapter-menu-head">章节</div>
            {currentBook.chapters.map((chapter, index) => (
              <button
                key={chapter.id}
                role="menuitem"
                className={index === currentChapter.index ? 'active' : ''}
                onClick={() => switchChapter(index)}
              >
                <span>{chapter.title}</span>
                <small>{chapter.pairs.length} 句</small>
              </button>
            ))}
          </div>
        )}

        <div className="binder-tools">
          <span className="binder-progress">
            <b>{currentIndex}</b> / {totalPairs}
          </span>
          <button
            className="binder-icon-btn"
            data-on={autoReadOn}
            onClick={toggleAutoRead}
            title={autoReadOn ? '停止连续朗读 (r)' : '开启连续朗读 (r)'}
            aria-label={autoReadOn ? '停止连续朗读' : '开启连续朗读'}
            style={{ opacity: autoReadBusy ? 0.65 : 1 }}
          >
            {autoReadOn ? <FiPause size={15} /> : <FiPlay size={15} />}
          </button>
          <button
            className="binder-icon-btn"
            data-on={showBookmarkList}
            onClick={() => setShowBookmarkList((open) => !open)}
            title="本章书签"
            aria-label="本章书签"
          >
            <span className="binder-badge-wrap">
              <FiBookmark size={15} />
              {chapterBookmarkCount > 0 && (
                <span className="binder-badge">{chapterBookmarkCount}</span>
              )}
            </span>
          </button>
          <button
            className="binder-text-btn binder-font-btn"
            onClick={() => changeFontZoom(-1)}
            title="缩小字号"
            aria-label="缩小字号"
          >
            A−
          </button>
          <button
            className="binder-text-btn binder-font-btn"
            onClick={() => changeFontZoom(1)}
            title="放大字号"
            aria-label="放大字号"
          >
            A+
          </button>
          {isDesktop && (
            <button
              className="binder-icon-btn"
              data-on={columnMode === 2}
              onClick={() => setReaderColumns(columnMode === 2 ? 1 : 2)}
              title={columnMode === 2 ? '切换为单栏' : '切换为双栏'}
              aria-label={columnMode === 2 ? '切换为单栏' : '切换为双栏'}
            >
              <FiColumns size={15} />
            </button>
          )}
          <ThemeToggle />
          <button
            className="binder-icon-btn"
            onClick={openSettings}
            title="打开设置"
            aria-label="打开设置"
          >
            <FiSettings size={15} />
          </button>
          <button
            className="binder-text-btn"
            onClick={() => setCurrentView('bookshelf')}
            title="回到书架"
          >
            書架
          </button>
        </div>

        {showBookmarkList && (
          <div className="binder-popover">
            <div className="binder-popover-head">
              <span>本章书签</span>
              <button
                className="binder-icon-btn"
                onClick={() => setShowBookmarkList(false)}
                aria-label="关闭书签"
              >
                <FiX size={14} />
              </button>
            </div>
            <BookmarkList onClose={() => setShowBookmarkList(false)} />
          </div>
        )}

        <div className="binder-sheet" onClick={handleReadingAreaClick}>
          {columnMode === 2 ? (
            <div className="binder-spread">
              <div className="spread-head">{chapterHead}</div>
              <div className="spread-viewport">
                <div className="spread-clip">
                  <div
                    ref={stageRef}
                    className="binder-column"
                    data-columns="2"
                    style={{
                      fontSize: `${16 * fontZoom}px`,
                      transform: `translateX(-${spreadPage * spreadPageStep}px)`,
                      transition: spreadAnimate
                        ? 'transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1)'
                        : 'none',
                    }}
                  >
                    {pairList}
                  </div>
                </div>
              </div>
              {readFoot}
            </div>
          ) : (
            <div
              ref={stageRef}
              className="binder-column"
              data-columns="1"
              style={{ fontSize: `${16 * fontZoom}px` }}
            >
              {chapterHead}
              {pairList}
              {readFoot}
            </div>
          )}
        </div>
      </div>

      {deskOpen && selectedPair && (
        <PracticeDesk
          pair={selectedPair}
          chapter={currentChapter}
          session={session}
          tab={inlineTab}
          fragment={explainFragment}
          onTabChange={setInlineTab}
          onBack={handleBack}
          onClose={handleCloseAll}
          onSessionEvent={sendSession}
          inputRef={inputRef}
        />
      )}

      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}

      {/* Selection popover */}
      {selection && currentChapter && (
        <SelectionPopover
          selection={selection}
          chapterId={currentChapter.id}
          onClose={clearSelection}
          onExplain={handleExplainSelection}
          onPreserveSelection={keepSelection}
        />
      )}
    </div>
  );
}
