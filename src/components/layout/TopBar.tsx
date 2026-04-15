import { useSettingsStore } from '../../stores/settingsSlice';
import { useUIStore } from '../../stores/uiSlice';
import { useBookStore } from '../../stores/bookSlice';
import { FiMenu, FiSettings } from 'react-icons/fi';
import { ThemeIndicator } from '../../theme/ThemeIndicator';

export function TopBar() {
  const { changeFontZoom } = useSettingsStore();
  const { toggleSidebar, openSettings, currentView } = useUIStore();
  const currentBook = useBookStore((s) => s.getCurrentBook());
  const currentChapter = useBookStore((s) => s.getCurrentChapter());
  const getReadingProgress = useBookStore((s) => s.getReadingProgress);

  const progressPct =
    currentChapter && currentChapter.pairs.length > 0
      ? Math.round((getReadingProgress(currentChapter.id) / currentChapter.pairs.length) * 100)
      : 0;

  return (
    <header className="app-header">
      <div className="app-header-main">
        <div className="app-brand">
          <button
            onClick={toggleSidebar}
            className="app-icon-btn"
            title="切换侧栏"
          >
            <FiMenu size={16} />
          </button>

          <div>
            <div className="app-logo">BAKU-YOMI</div>
            <div className="app-context">
              {currentView === 'bookshelf'
                ? `LIBRARY / ${currentBook ? currentBook.title : 'EMPTY'}`
                : `READER / ${currentChapter?.title || 'DOUBLE BACKTRANSLATION'}`}
            </div>
          </div>
        </div>

        <div className="app-header-tools">
          <div className="app-shortcuts">THEME N / M / D / S / R / W</div>
          <ThemeIndicator />
          {currentView === 'reader' && currentChapter && (
            <span className="app-progress-indicator">
              {progressPct}%
            </span>
          )}
          <button
            onClick={openSettings}
            className="app-icon-btn"
            title="打开设置"
          >
            <FiSettings size={16} />
          </button>
        </div>
      </div>

      <div className="app-header-sub">
        <div className="app-sub-label">
          {currentView === 'bookshelf'
            ? 'quiet library surface'
            : currentBook?.title || 'active reading session'}
        </div>
        <div className="font-controls">
          <button
            onClick={() => changeFontZoom(-1)}
            className="font-control-btn"
          >
            A-
          </button>
          <button
            onClick={() => changeFontZoom(1)}
            className="font-control-btn"
          >
            A+
          </button>
        </div>
      </div>
    </header>
  );
}
