import { MODES, MODE_LABELS, MODE_SHORTCUTS, useTheme } from './themeStore';

export function ThemeIndicator() {
  const { mode, setMode } = useTheme();

  return (
    <div className="mode-indicator" aria-label="主题切换">
      {MODES.map((item) => (
        <button
          key={item}
          type="button"
          className={`mode-dot${item === mode ? ' active' : ''}`}
          data-mode={item}
          title={`${MODE_LABELS[item]} (${MODE_SHORTCUTS[item]})`}
          onClick={() => setMode(item)}
        />
      ))}
    </div>
  );
}
