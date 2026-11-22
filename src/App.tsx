import { useEffect } from 'react';
import { ReadingView } from './components/reader/ReadingView';
import { VideoReadingView } from './components/reader/VideoReadingView';
import { SettingsModal } from './components/settings/SettingsModal';
import { BookshelfPage } from './components/bookshelf/BookshelfPage';
import { HomePage } from './components/home/HomePage';
import { ReviewPage } from './components/review/ReviewPage';
import { VocabPage } from './components/vocab/VocabPage';
import { NotePage } from './components/note/NotePage';
import { VocabDetailDialog } from './components/vocab/VocabDetailDialog';
import { StorageHealthNotice } from './components/layout/StorageHealthNotice';
import { useUIStore } from './stores/uiSlice';
import { useBookStore } from './stores/bookSlice';
import { useSettingsStore } from './stores/settingsSlice';

export default function App() {
  const currentView = useUIStore((s) => s.currentView);
  const hasCurrentBook = useBookStore((s) =>
    s.books.some((book) => book.id === s.currentBookId)
  );
  const isVideoBook = useBookStore(
    (s) =>
      s.books.find((book) => book.id === s.currentBookId)?.source?.kind ===
      'video'
  );
  const pairOrder = useSettingsStore((s) => s.pairOrder);

  // Typography follows the global order through one root attribute, so every
  // bilingual surface swaps primary/secondary without passing props around.
  useEffect(() => {
    document.documentElement.dataset.pairOrder = pairOrder;
  }, [pairOrder]);

  // Each page owns its own chrome now: the home has a desk, the shelf has its
  // own top bar and rail, the reader has the binder.
  return (
    <>
      {currentView === 'reader' && hasCurrentBook ? (
        isVideoBook ? (
          <VideoReadingView />
        ) : (
          <ReadingView />
        )
      ) : currentView === 'bookshelf' ? (
        <BookshelfPage />
      ) : currentView === 'review' ? (
        <ReviewPage />
      ) : currentView === 'vocab' ? (
        <VocabPage />
      ) : currentView === 'note' ? (
        <NotePage />
      ) : (
        <HomePage />
      )}
      <StorageHealthNotice />
      <SettingsModal />
      <VocabDetailDialog />
    </>
  );
}
