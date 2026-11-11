import { ReadingView } from './components/reader/ReadingView';
import { SettingsModal } from './components/settings/SettingsModal';
import { BookshelfPage } from './components/bookshelf/BookshelfPage';
import { HomePage } from './components/home/HomePage';
import { ReviewPage } from './components/review/ReviewPage';
import { StorageHealthNotice } from './components/layout/StorageHealthNotice';
import { useUIStore } from './stores/uiSlice';
import { useBookStore } from './stores/bookSlice';

export default function App() {
  const currentView = useUIStore((s) => s.currentView);
  const hasCurrentBook = useBookStore((s) =>
    s.books.some((book) => book.id === s.currentBookId)
  );

  // Each page owns its own chrome now: the home has a desk, the shelf has its
  // own top bar and rail, the reader has the binder.
  return (
    <>
      {currentView === 'reader' && hasCurrentBook ? (
        <ReadingView />
      ) : currentView === 'bookshelf' ? (
        <BookshelfPage />
      ) : currentView === 'review' ? (
        <ReviewPage />
      ) : (
        <HomePage />
      )}
      <StorageHealthNotice />
      <SettingsModal />
    </>
  );
}
