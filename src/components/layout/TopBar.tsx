import { useSettingsStore } from '../../stores/settingsSlice';
import { useUIStore } from '../../stores/uiSlice';
import { useBookStore } from '../../stores/bookSlice';
import { FiMenu, FiSettings } from 'react-icons/fi';

export function TopBar() {
  const { changeFontZoom } = useSettingsStore();
  const { toggleSidebar, openSettings } = useUIStore();
  const currentChapter = useBookStore((s) => s.getCurrentChapter());
  const getReadingProgress = useBookStore((s) => s.getReadingProgress);

  const progressPct =
    currentChapter && currentChapter.pairs.length > 0
      ? Math.round((getReadingProgress(currentChapter.id) / currentChapter.pairs.length) * 100)
      : 0;

  return (
    <header className="flex-shrink-0" style={{ backgroundColor: 'var(--bg-paper)' }}>
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid var(--border-light)' }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded transition-colors opacity-50 hover:opacity-100"
            style={{ color: 'var(--ink-secondary)' }}
          >
            <FiMenu size={18} />
          </button>
          <h1
            className="text-base font-medium"
            style={{
              fontFamily: 'var(--font-ui)',
              color: 'var(--ink-primary)',
            }}
          >
            {currentChapter?.title || '双語回訳'}
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {currentChapter && (
            <span
              className="text-sm"
              style={{ fontFamily: 'var(--font-ui)', color: 'var(--ink-muted)' }}
            >
              {progressPct}%
            </span>
          )}
          <button
            onClick={openSettings}
            className="p-1.5 rounded transition-colors opacity-50 hover:opacity-100"
            style={{ color: 'var(--ink-secondary)' }}
          >
            <FiSettings size={18} />
          </button>
        </div>
      </div>

      {/* Font size controls */}
      <div
        className="flex items-center px-6 py-2"
        style={{
          borderBottom: '1px solid var(--border-light)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <div className="flex items-center gap-3 ml-auto">
          <button
            onClick={() => changeFontZoom(-1)}
            className="opacity-50 hover:opacity-100 transition-opacity text-sm font-medium"
            style={{ fontFamily: 'var(--font-ui)', color: 'var(--ink-secondary)' }}
          >
            A-
          </button>
          <button
            onClick={() => changeFontZoom(1)}
            className="opacity-50 hover:opacity-100 transition-opacity text-sm font-medium"
            style={{ fontFamily: 'var(--font-ui)', color: 'var(--ink-secondary)' }}
          >
            A+
          </button>
        </div>
      </div>
    </header>
  );
}
