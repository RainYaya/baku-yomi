import { MainLayout } from './components/layout/MainLayout';
import { ReadingView } from './components/reader/ReadingView';
import { SettingsModal } from './components/settings/SettingsModal';

export default function App() {
  return (
    <MainLayout>
      <ReadingView />
      <SettingsModal />
    </MainLayout>
  );
}
