import { useSettingsStore } from '../../stores/settingsSlice';
import type { LayoutMode } from '../../stores/settingsSlice';
import { useUIStore } from '../../stores/uiSlice';
import { useBookStore } from '../../stores/bookSlice';
import {
  HiOutlineBars3,
  HiOutlineCog6Tooth,
  HiOutlineEyeSlash,
  HiOutlineEye,
  HiOutlineLanguage,
  HiOutlineLightBulb,
} from 'react-icons/hi2';

export function TopBar() {
  const { blindMode, toggleBlindMode, showFurigana, toggleFurigana, keywordMode, toggleKeywordMode, layoutMode, setLayoutMode, changeFontZoom } =
    useSettingsStore();
  const { toggleSidebar, openSettings } = useUIStore();
  const currentChapter = useBookStore((s) => s.getCurrentChapter());
  const getReadingProgress = useBookStore((s) => s.getReadingProgress);

  const progressPct = currentChapter && currentChapter.pairs.length > 0
    ? Math.round((getReadingProgress(currentChapter.id) / currentChapter.pairs.length) * 100)
    : 0;

  return (
    <header className="flex-shrink-0" style={{ backgroundColor: 'var(--bg-color)' }}>
      {/* Main header row */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: 'var(--border-style)', color: 'var(--brand-green)' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="p-1 opacity-60 hover:opacity-100 transition-opacity"
          >
            <HiOutlineBars3 size={20} />
          </button>
          <span className="text-lg tracking-wide uppercase font-medium">
            {currentChapter?.title || '双語回訳'}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm uppercase tracking-wide opacity-70">
            {currentChapter ? `${progressPct}%` : ''}
          </span>
          <button
            onClick={openSettings}
            className="p-1 opacity-60 hover:opacity-100 transition-opacity"
          >
            <HiOutlineCog6Tooth size={20} />
          </button>
        </div>
      </div>

      {/* Controls row */}
      <div
        className="flex items-center justify-between px-4 py-2 text-sm uppercase tracking-wide"
        style={{ borderBottom: 'var(--border-style)', color: 'var(--brand-green)' }}
      >
        <div className="flex items-center gap-5">
          {/* Layout mode toggles */}
          <LayoutBtn mode="alternating" current={layoutMode} onClick={setLayoutMode} label="交替" />
          <LayoutBtn mode="parallel" current={layoutMode} onClick={setLayoutMode} label="并列" />

          <span className="w-px h-4 bg-current opacity-20" />

          {/* Feature toggles */}
          <ToggleBtn active={blindMode} onClick={toggleBlindMode} icon={blindMode ? <HiOutlineEyeSlash size={14} /> : <HiOutlineEye size={14} />} label="盲模式" />
          <ToggleBtn active={showFurigana} onClick={toggleFurigana} icon={<HiOutlineLanguage size={14} />} label="注音" />
          <ToggleBtn active={keywordMode} onClick={toggleKeywordMode} icon={<HiOutlineLightBulb size={14} />} label="AI提示" />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => changeFontZoom(-1)}
            className="opacity-60 hover:opacity-100 transition-opacity font-medium"
          >
            A-
          </button>
          <button
            onClick={() => changeFontZoom(1)}
            className="opacity-60 hover:opacity-100 transition-opacity font-medium"
          >
            A+
          </button>
        </div>
      </div>
    </header>
  );
}

function LayoutBtn({ mode, current, onClick, label }: { mode: LayoutMode; current: LayoutMode; onClick: (m: LayoutMode) => void; label: string }) {
  const active = mode === current;
  return (
    <button
      onClick={() => onClick(mode)}
      className={`transition-opacity ${active ? 'opacity-100 font-bold' : 'opacity-50 hover:opacity-80'}`}
    >
      {label}
    </button>
  );
}

function ToggleBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 transition-opacity ${active ? 'opacity-100 font-bold' : 'opacity-50 hover:opacity-80'}`}
    >
      {icon}
      {label}
    </button>
  );
}
