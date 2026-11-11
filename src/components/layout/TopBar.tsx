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
  const currentChapterId = currentChapter?.id ?? null;
  const currentProgress = useBookStore((s) =>
    currentChapterId ? s.readingProgress[currentChapterId] ?? 0 : 0
  );

  const progressPct =
    currentChapter && currentChapter.pairs.length > 0
      ? Math.round((currentProgress / currentChapter.pairs.length) * 100)
      : 0;

  const context =
    currentView === 'bookshelf'
      ? currentBook?.title ?? '书架'
      : currentChapter?.title ?? '阅读';

  return (
    <header className="app-header">
      <div className="app-header-main">
        <div className="app-brand">
          <button
            onClick={toggleSidebar}
            className="app-icon-btn"
            title="切换侧栏"
            aria-label="切换侧栏"
          >
            <FiMenu size={16} />
          </button>

          <div className="app-brand-text">
            <span className="app-logo">baku-yomi</span>
            <span className="app-context">{context}</span>
          </div>
        </div>

        <div className="app-header-tools">
          <div className="font-controls" aria-label="字号">
            <button
              onClick={() => changeFontZoom(-1)}
              className="font-control-btn"
              title="缩小字号"
              aria-label="缩小字号"
            >
              A−
            </button>
            <button
              onClick={() => changeFontZoom(1)}
              className="font-control-btn"
              title="放大字号"
              aria-label="放大字号"
            >
              A+
            </button>
          </div>

          {currentView === 'reader' && currentChapter && (
            <span className="app-progress-indicator" title="本章阅读进度">
              {progressPct}%
            </span>
          )}

          <ThemeIndicator />

          <button
            onClick={openSettings}
            className="app-icon-btn"
            title="打开设置"
            aria-label="打开设置"
          >
            <FiSettings size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
