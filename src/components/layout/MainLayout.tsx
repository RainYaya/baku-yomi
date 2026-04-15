import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useUIStore } from '../../stores/uiSlice';

export function MainLayout({ children }: { children: React.ReactNode }) {
  const currentView = useUIStore((s) => s.currentView);

  return (
    <div className="app-shell min-h-screen" style={{ color: 'var(--text)' }}>
      <div className="app-frame">
        <TopBar />
        <div className={`app-workspace ${currentView === 'reader' ? 'app-workspace-reader' : ''}`}>
          <Sidebar />
          <main className={`app-main ${currentView === 'reader' ? 'app-main-reader' : ''}`}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
