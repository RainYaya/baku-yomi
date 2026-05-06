import { useState, useRef, useEffect, useCallback } from 'react';
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
import { useSettingsStore } from '../../stores/settingsSlice';
import { SentencePairCard } from './SentencePairCard';
import { PracticePanel } from './PracticePanel';
import { ShortcutHelp } from './ShortcutHelp';
import { SelectionPopover } from './SelectionPopover';
import { BookmarkList } from './BookmarkList';
import { useTextSelection } from '../../hooks/useTextSelection';
import { useBookmarkStore } from '../../stores/bookmarkSlice';
import { EpubUploader } from '../import/EpubUploader';
import { FiBookmark, FiPause, FiPlay } from 'react-icons/fi';

export function ReadingView() {
  const currentBook = useBookStore((s) => s.getCurrentBook());
  const currentChapter = useBookStore((s) => s.getCurrentChapter());
  const setReadingProgress = useBookStore((s) => s.setReadingProgress);
  const getReadingProgress = useBookStore((s) => s.getReadingProgress);
  const fontZoom = useSettingsStore((s) => s.fontZoom);
  const voicevoxSpeakerId = useSettingsStore((s) => s.voicevoxSpeakerId);
  const voicevoxSpeed = useSettingsStore((s) => s.voicevoxSpeed);
  const voicevoxPitch = useSettingsStore((s) => s.voicevoxPitch);
  const voicevoxVolume = useSettingsStore((s) => s.voicevoxVolume);
  const voicevoxPrefetchWindow = useSettingsStore((s) => s.voicevoxPrefetchWindow);
  const voicevoxCacheLimitMB = useSettingsStore((s) => s.voicevoxCacheLimitMB);
  const scrollHostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef<string | null>(null);
  const pairRefs = useRef<Map<string, HTMLElement>>(new Map());
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [inputMode, setInputMode] = useState(false);
  const [showBookmarkList, setShowBookmarkList] = useState(false);
  const [isAutoReadOn, setIsAutoReadOn] = useState(false);
  const [isAutoReadBusy, setIsAutoReadBusy] = useState(false);
  const lastSelectedPairId = useRef<string | null>(null);
  const autoReadRequestedRef = useRef(false);
  const skipNextScrollRef = useRef(false);
  const PREFETCH_WINDOW = voicevoxPrefetchWindow;
  const CACHE_MAX_MB = voicevoxCacheLimitMB;

  const { selection, clearSelection, hasJustSelected } = useTextSelection();
  const allBookmarks = useBookmarkStore((s) => s.bookmarks);
  const scrollToBookmarkId = useBookmarkStore((s) => s.scrollToBookmarkId);
  const setScrollToBookmarkId = useBookmarkStore((s) => s.setScrollToBookmarkId);
  const getBookmarkById = useBookmarkStore((s) => s.getBookmarkById);

  const selectedPair = currentChapter?.pairs.find((p) => p.id === selectedPairId) ?? null;
  const chapterBookmarkCount = currentChapter
    ? allBookmarks.filter((b) => b.chapterId === currentChapter.id).length
    : 0;

  const scrollPairToCenter = useCallback((pairId: string) => {
    const container = scrollHostRef.current;
    const element = pairRefs.current.get(pairId);
    if (!container || !element) return;

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const targetScrollTop =
      container.scrollTop +
      (elementRect.top - containerRect.top) -
      containerRect.height / 2 +
      elementRect.height / 2;

    container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollHostRef.current = stageRef.current;
  }, []);

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

      setIsAutoReadBusy(true);
      try {
        prefetchAhead(pair.id);
        await playVoicevox(pair.japanese, voicevoxSpeakerId, pair.id, {
          speedScale: voicevoxSpeed,
          pitchScale: voicevoxPitch,
          volumeScale: voicevoxVolume,
        });
      } catch (error) {
        console.error('Auto read failed:', error);
        autoReadRequestedRef.current = false;
        setIsAutoReadOn(false);
      } finally {
        setIsAutoReadBusy(false);
      }
    },
    [currentChapter, prefetchAhead, voicevoxPitch, voicevoxSpeakerId, voicevoxSpeed, voicevoxVolume]
  );

  const handleClosePanel = () => {
    setInputMode(false);
  };

  useEffect(() => {
    if (!currentChapter) {
      autoReadRequestedRef.current = false;
      setIsAutoReadOn(false);
      setIsAutoReadBusy(false);
      return;
    }

    const unsubscribe = subscribeVoicevoxEnded((endedPairId) => {
      if (!autoReadRequestedRef.current) return;
      const endedIndex = endedPairId
        ? currentChapter.pairs.findIndex((p) => p.id === endedPairId)
        : -1;

      if (endedIndex < 0 || endedIndex >= currentChapter.pairs.length - 1) {
        autoReadRequestedRef.current = false;
        setIsAutoReadOn(false);
        return;
      }

      const nextPair = currentChapter.pairs[endedIndex + 1];
      handleSelectPair(nextPair.id);
      scrollPairToCenter(nextPair.id);
      void startPlayPair(nextPair.id);
    });

    return unsubscribe;
  }, [currentChapter, scrollPairToCenter, startPlayPair]);

  useEffect(() => {
    setVoicevoxCacheLimit(CACHE_MAX_MB * 1024 * 1024);
  }, [CACHE_MAX_MB]);

  useEffect(() => {
    if (!currentChapter) {
      clearVoicevoxCache();
      return;
    }

    const stats = getVoicevoxCacheStats();
    const usageMB = (stats.totalBytes / (1024 * 1024)).toFixed(1);
    const limitMB = (stats.maxBytes / (1024 * 1024)).toFixed(0);
    console.debug(`[TTS cache] ${usageMB}MB / ${limitMB}MB, items=${stats.items}, evictions=${stats.evictions}`);
  }, [currentChapter?.id]);

  const toggleAutoRead = useCallback(() => {
    const pairs = currentChapter?.pairs ?? [];

    if (isAutoReadOn) {
      autoReadRequestedRef.current = false;
      setIsAutoReadOn(false);
      stopVoicevoxPlayback();
      return;
    }

    if (pairs.length === 0) return;

    const fallbackId = lastSelectedPairId.current ?? pairs[0]?.id ?? null;
    const startId = selectedPairId ?? fallbackId;
    if (!startId) return;

    autoReadRequestedRef.current = true;
    setIsAutoReadOn(true);

    if (selectedPairId !== startId) {
      handleSelectPair(startId);
    }
    scrollPairToCenter(startId);
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
    isAutoReadOn,
    selectedPairId,
    scrollPairToCenter,
    startPlayPair,
    voicevoxSpeakerId,
    voicevoxSpeed,
    voicevoxPitch,
    voicevoxVolume,
    prefetchAhead,
  ]);

  const handleSelectPair = (pairId: string | null) => {
    if (pairId) {
      lastSelectedPairId.current = pairId;
    }
    setSelectedPairId(pairId);
  };

  const focusInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      setInputMode(true);
    }
  }, []);

  const blurInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.blur();
    }
    setInputMode(false);
  }, []);

  // j/k 导航 & gi/ESC 快捷键
  useEffect(() => {
    const pairs = currentChapter?.pairs ?? [];
    let giPending = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable;

      if (e.key === 'Escape') {
        if (isInput) {
          blurInput();
        } else if (selectedPairId) {
          setSelectedPairId(null);
          setInputMode(false);
        }
        clearSelection();
        return;
      }

      if (isInput) return;

      // 用 lastSelectedPairId 作为当前位置基准
      const currentId = selectedPairId ?? lastSelectedPairId.current;

      if (e.key === 'j') {
        e.preventDefault();
        const currentIndex = currentId ? pairs.findIndex(p => p.id === currentId) : -1;
        if (currentIndex < pairs.length - 1) {
          const newId = pairs[currentIndex + 1].id;
          lastSelectedPairId.current = newId;
          setSelectedPairId(newId);
        } else if (currentIndex === -1 && pairs.length > 0) {
          const newId = pairs[0].id;
          lastSelectedPairId.current = newId;
          setSelectedPairId(newId);
        }
      } else if (e.key === 'k') {
        e.preventDefault();
        const currentIndex = currentId ? pairs.findIndex(p => p.id === currentId) : -1;
        if (currentIndex > 0) {
          const newId = pairs[currentIndex - 1].id;
          lastSelectedPairId.current = newId;
          setSelectedPairId(newId);
        }
      } else if (e.key === 'g' && !e.repeat) {
        giPending = true;
        setTimeout(() => { giPending = false; }, 500);
      } else if (e.key === 'i' && giPending && selectedPairId) {
        e.preventDefault();
        focusInput();
        giPending = false;
      } else if (e.key === 'r') {
        e.preventDefault();
        toggleAutoRead();
      } else if (e.key === '?') {
        setShowHelp(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentChapter, selectedPairId, focusInput, blurInput, clearSelection, toggleAutoRead]);

  // 选中变化时滚动到可视区域（鼠标点击不滚动，避免干扰文本选择）
  useEffect(() => {
    if (!selectedPairId) return;
    if (skipNextScrollRef.current) {
      skipNextScrollRef.current = false;
      return;
    }
    scrollPairToCenter(selectedPairId);
  }, [selectedPairId, scrollPairToCenter]);

  // 书签跳转
  useEffect(() => {
    if (!scrollToBookmarkId || !scrollHostRef.current) return;
    
    const bookmark = getBookmarkById(scrollToBookmarkId);
    if (!bookmark) {
      setScrollToBookmarkId(null);
      return;
    }

    const element = pairRefs.current.get(bookmark.pairId);
    if (element) {
      handleSelectPair(bookmark.pairId);
      
      requestAnimationFrame(() => {
        scrollPairToCenter(bookmark.pairId);
      });
    }
    setScrollToBookmarkId(null);
  }, [scrollToBookmarkId, getBookmarkById, setScrollToBookmarkId, scrollPairToCenter]);

  // Close panel when clicking outside (on the reading area)
  const handleReadingAreaClick = (e: React.MouseEvent) => {
    // 如果刚刚有文字选中，不处理（让 SelectionPopover 处理）
    if (hasJustSelected()) return;
    
    if (selectedPairId && e.target === e.currentTarget) {
      setSelectedPairId(null);
    }
    clearSelection();
  };

  // Restore scroll position when chapter changes
  useEffect(() => {
    if (!currentChapter) return;
    if (restoredRef.current === currentChapter.id) return;
    restoredRef.current = currentChapter.id;

    const savedIndex = getReadingProgress(currentChapter.id);
    if (savedIndex > 0) {
      requestAnimationFrame(() => {
        const container = scrollHostRef.current;
        if (container) {
          container.scrollTo({ top: savedIndex * 100, behavior: 'instant' });
        }
      });
    }
  }, [currentChapter, getReadingProgress]);

  useEffect(() => {
    return () => {
      autoReadRequestedRef.current = false;
      stopVoicevoxPlayback();
    };
  }, []);

  // Simple scroll tracking
  useEffect(() => {
    if (!currentChapter) return;
    const container = scrollHostRef.current;
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
  const floatingButtonRight = selectedPair ? 'calc(24rem + 1.5rem)' : '1.5rem';

  return (
    <div className={`reader-layout ${selectedPair ? 'reader-layout-with-panel' : ''}`}>
      {/* Reading area */}
      <div
        ref={stageRef}
        className="reader-stage"
        style={{ fontSize: `${17 * fontZoom}px` }}
        onClick={handleReadingAreaClick}
        tabIndex={-1}
      >
        <div className="reader-stage-inner">
          {currentChapter.pairs.map((pair) => (
            <SentencePairCard
              key={pair.id}
              pair={pair}
              isSelected={selectedPairId === pair.id}
              onSelect={() => {
                if (hasJustSelected()) return;
                skipNextScrollRef.current = true;
                handleSelectPair(pair.id === selectedPairId ? null : pair.id);
              }}
              ref={(el) => {
                if (el) {
                  pairRefs.current.set(pair.id, el);
                } else {
                  pairRefs.current.delete(pair.id);
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* Practice panel */}
      <PracticePanel
        pair={selectedPair}
        onClose={handleClosePanel}
        inputRef={inputRef}
        inputMode={inputMode}
      />

      {/* Reading progress */}
      <div
        className="reading-progress"
        style={{ width: `${progressPct}%` }}
      />

      {/* Read aloud button */}
      <button
        onClick={toggleAutoRead}
        className="fixed bottom-24 right-6 p-3 rounded-full shadow-lg z-40 transition-all hover:scale-105"
        style={{
          right: floatingButtonRight,
          backgroundColor: 'var(--bg-paper)',
          border: '1px solid var(--border-light)',
          color: isAutoReadOn ? 'var(--accent-primary)' : 'var(--ink-muted)',
          opacity: isAutoReadBusy ? 0.75 : 1,
        }}
        title={isAutoReadOn ? '停止连续朗读' : '开启连续朗读'}
      >
        {isAutoReadOn ? <FiPause size={20} /> : <FiPlay size={20} />}
      </button>

      {/* Bookmark button */}
      <button
        onClick={() => setShowBookmarkList((v) => !v)}
        className="fixed bottom-6 right-6 p-3 rounded-full shadow-lg z-40 transition-all hover:scale-105"
        style={{
          right: floatingButtonRight,
          backgroundColor: 'var(--bg-paper)',
          border: '1px solid var(--border-light)',
          color: showBookmarkList ? 'var(--accent-primary)' : 'var(--ink-muted)',
        }}
        title="书签列表"
      >
        <div className="relative">
          <FiBookmark size={20} />
          {chapterBookmarkCount > 0 && (
            <span
              className="absolute -top-2 -right-2 text-[10px] leading-none px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--bg-paper)',
                fontFamily: 'var(--font-ui)',
              }}
            >
              {chapterBookmarkCount}
            </span>
          )}
        </div>
      </button>

      {/* Bookmark list panel */}
      {showBookmarkList && (
        <div
          className="fixed bottom-20 right-6 w-72 max-h-80 rounded-lg shadow-xl z-40 animate-slide-up"
          style={{
            right: floatingButtonRight,
            backgroundColor: 'var(--bg-paper)',
            border: '1px solid var(--border-light)',
          }}
        >
          <div
            className="px-4 py-3 border-b"
            style={{ borderColor: 'var(--border-light)' }}
          >
            <h3
              className="text-sm font-medium"
              style={{
                fontFamily: 'var(--font-ui)',
                color: 'var(--ink-primary)',
                letterSpacing: '0.08em',
              }}
            >
              书签列表
            </h3>
          </div>
          <BookmarkList onClose={() => setShowBookmarkList(false)} />
        </div>
      )}

      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}
      
      {/* Selection popover */}
      {selection && currentChapter && (
        <SelectionPopover
          selection={selection}
          chapterId={currentChapter.id}
          onClose={clearSelection}
        />
      )}
    </div>
  );
}
