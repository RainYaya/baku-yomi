import { ReadingView } from './components/reader/ReadingView';
import { SettingsModal } from './components/settings/SettingsModal';
import { BookshelfPage } from './components/bookshelf/BookshelfPage';
import { WelcomeGuide } from './components/onboarding/WelcomeGuide';
import { useUIStore } from './stores/uiSlice';
import { useBookStore } from './stores/bookSlice';

export default function App() {
  const currentView = useUIStore((s) => s.currentView);
  const hasCurrentBook = useBookStore((s) =>
    s.books.some((book) => book.id === s.currentBookId)
  );

  // Each page owns its own chrome now: the shelf has its top bar and rail,
  // the reader has the binder. There is no app-level navigation frame left to
  // squeeze the reading column.
  return (
    <>
      {currentView === 'reader' && hasCurrentBook ? (
        <ReadingView />
      ) : (
        <BookshelfPage />
      )}
      <WelcomeGuide />
      <SettingsModal />
    </>
  );
}
