import { useSettingsStore } from '../../stores/settingsSlice';
import type { LayoutMode } from '../../stores/settingsSlice';
import { useUIStore } from '../../stores/uiSlice';
import { useBookStore } from '../../stores/bookSlice';
import {
  FiMenu,
  FiSettings,
  FiEye,
  FiEyeOff,
  FiType,
  FiZap,
} from 'react-icons/fi';

export function TopBar() {
  const {
    blindMode,
    toggleBlindMode,
    showFurigana,
    toggleFurigana,
    keywordMode,
    toggleKeywordMode,
    layoutMode,
    setLayoutMode,
    changeFontZoom,
  } = useSettingsStore();
  const { toggleSidebar, openSettings } = useUIStore();
  const currentChapter = useBookStore((s) => s.getCurrentChapter());
  const getReadingProgress = useBookStore((s) => s.getReadingProgress);

  const progressPct =
    currentChapter && currentChapter.pairs.length > 0
      ? Math.round((getReadingProgress(currentChapter.id) / currentChapter.pairs.length) * 100)
      : 0;

  return (
    <header className="flex-shrink-0" style={{ backgroundColor: 'var(--bg-paper)' }}>
      {/* Main header row */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{
          borderBottom: '1px solid var(--border-light)',
        }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded transition-colors opacity-50 hover:opacity-100 hover:bg-opacity-80"
            style={{ color: 'var(--ink-secondary)' }}
          >
            <FiMenu size={18} />
          </button>
          <h1
            className="text-base font-medium"
            style={{
              fontFamily: 'var(--font-ui)',
              color: 'var(--ink-primary)',
              letterSpacing: '0.02em',
            }}
          >
            {currentChapter?.title || '双語回訳'}
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {currentChapter && (
            <span
              className="text-sm"
              style={{
                fontFamily: 'var(--font-ui)',
                color: 'var(--ink-muted)',
              }}
            >
              {progressPct}%
            </span>
          )}
          <button
            onClick={openSettings}
            className="p-1.5 rounded transition-colors opacity-50 hover:opacity-100 hover:bg-opacity-80"
            style={{ color: 'var(--ink-secondary)' }}
          >
            <FiSettings size={18} />
          </button>
        </div>
      </div>

      {/* Controls row */}
      <div
        className="flex items-center px-6 py-2.5 text-sm"
        style={{
          borderBottom: '1px solid var(--border-light)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <div className="flex items-center gap-6">
          {/* Layout mode toggles */}
          <LayoutBtn mode="alternating" current={layoutMode} onClick={setLayoutMode} label="交替" />
          <LayoutBtn mode="parallel" current={layoutMode} onClick={setLayoutMode} label="并列" />

          <span className="w-px h-4" style={{ backgroundColor: 'var(--border-color)' }} />

          {/* Feature toggles */}
          <ToggleBtn
            active={blindMode}
            onClick={toggleBlindMode}
            icon={blindMode ? <FiEyeOff size={14} /> : <FiEye size={14} />}
            label="盲读"
          />
          <ToggleBtn
            active={showFurigana}
            onClick={toggleFurigana}
            icon={<FiType size={14} />}
            label="注音"
          />
          <ToggleBtn
            active={keywordMode}
            onClick={toggleKeywordMode}
            icon={<FiZap size={14} />}
            label="提示"
          />
        </div>

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

function LayoutBtn({
  mode,
  current,
  onClick,
  label,
}: {
  mode: LayoutMode;
  current: LayoutMode;
  onClick: (m: LayoutMode) => void;
  label: string;
}) {
  const active = mode === current;
  return (
    <button
      onClick={() => onClick(mode)}
      className="transition-all text-sm"
      style={{
        fontFamily: 'var(--font-ui)',
        color: active ? 'var(--accent-primary)' : 'var(--ink-muted)',
        fontWeight: active ? 500 : 400,
        opacity: active ? 1 : 0.5,
      }}
    >
      {label}
    </button>
  );
}

function ToggleBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 transition-all text-sm"
      style={{
        fontFamily: 'var(--font-ui)',
        color: active ? 'var(--accent-primary)' : 'var(--ink-muted)',
        fontWeight: active ? 500 : 400,
        opacity: active ? 1 : 0.5,
      }}
    >
      {icon}
      {label}
    </button>
  );
}
