import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-color)', color: 'var(--brand-green)' }}>
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
