import { MainLayout } from './components/layout/MainLayout';
import { ReadingView } from './components/reader/ReadingView';
import { SettingsModal } from './components/settings/SettingsModal';
import { BookshelfPage } from './components/bookshelf/BookshelfPage';
import { useUIStore } from './stores/uiSlice';

export default function App() {
  const currentView = useUIStore((s) => s.currentView);

  return (
    <MainLayout>
      {currentView === 'bookshelf' ? <BookshelfPage /> : <ReadingView />}
      <SettingsModal />
    </MainLayout>
  );
}
