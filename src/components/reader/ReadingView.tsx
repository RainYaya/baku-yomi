import { useState, useRef, useEffect, useCallback } from 'react';
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
import { FiBookmark } from 'react-icons/fi';

export function ReadingView() {
  const currentBook = useBookStore((s) => s.getCurrentBook());
  const currentChapter = useBookStore((s) => s.getCurrentChapter());
  const setReadingProgress = useBookStore((s) => s.setReadingProgress);
  const getReadingProgress = useBookStore((s) => s.getReadingProgress);
  const fontZoom = useSettingsStore((s) => s.fontZoom);
  const containerRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef<string | null>(null);
  const pairRefs = useRef<Map<string, HTMLElement>>(new Map());
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [inputMode, setInputMode] = useState(false);
  const [showBookmarkList, setShowBookmarkList] = useState(false);
  const lastSelectedPairId = useRef<string | null>(null);

  const { selection, clearSelection, hasJustSelected } = useTextSelection();
  const scrollToBookmarkId = useBookmarkStore((s) => s.scrollToBookmarkId);
  const setScrollToBookmarkId = useBookmarkStore((s) => s.setScrollToBookmarkId);
  const getBookmarkById = useBookmarkStore((s) => s.getBookmarkById);

  const selectedPair = currentChapter?.pairs.find(p => p.id === selectedPairId) ?? null;

  const handleClosePanel = () => {
    setInputMode(false);
  };

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
      } else if (e.key === '?') {
        setShowHelp(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentChapter, selectedPairId, focusInput, blurInput, clearSelection]);

  // 选中变化时滚动到可视区域
  useEffect(() => {
    if (!selectedPairId || !containerRef.current) return;
    const element = pairRefs.current.get(selectedPairId);
    if (element && containerRef.current) {
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const targetScrollTop = container.scrollTop + (elementRect.top - containerRect.top) - (containerRect.height / 2) + (elementRect.height / 2);
      container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
    }
  }, [selectedPairId]);

  // 书签跳转
  useEffect(() => {
    if (!scrollToBookmarkId || !containerRef.current) return;
    
    const bookmark = getBookmarkById(scrollToBookmarkId);
    if (!bookmark) {
      setScrollToBookmarkId(null);
      return;
    }

    const element = pairRefs.current.get(bookmark.pairId);
    if (element) {
      handleSelectPair(bookmark.pairId);
      
      requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const targetScrollTop = container.scrollTop + (elementRect.top - containerRect.top) - (containerRect.height / 2) + (elementRect.height / 2);
        container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      });
    }
    setScrollToBookmarkId(null);
  }, [scrollToBookmarkId, getBookmarkById, setScrollToBookmarkId]);

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
        className="flex-1 overflow-y-auto pb-20"
        style={{ fontSize: `${17 * fontZoom}px` }}
        onClick={handleReadingAreaClick}
        tabIndex={-1}
      >
        <div className="max-w-2xl mx-auto px-8 py-6">
          {currentChapter.pairs.map((pair) => (
            <SentencePairCard
              key={pair.id}
              pair={pair}
              isSelected={selectedPairId === pair.id}
              onSelect={() => handleSelectPair(pair.id === selectedPairId ? null : pair.id)}
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

      {/* Bookmark button */}
      <button
        onClick={() => setShowBookmarkList(!showBookmarkList)}
        className="fixed bottom-6 right-6 p-3 rounded-full shadow-lg z-40 transition-all hover:scale-105"
        style={{
          backgroundColor: 'var(--bg-paper)',
          border: '1px solid var(--border-light)',
          color: showBookmarkList ? 'var(--accent-primary)' : 'var(--ink-muted)',
        }}
        title="书签列表"
      >
        <FiBookmark size={20} />
      </button>

      {/* Bookmark list panel */}
      {showBookmarkList && (
        <div
          className="fixed bottom-20 right-6 w-72 max-h-80 rounded-lg shadow-xl z-40 animate-slide-up"
          style={{
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
