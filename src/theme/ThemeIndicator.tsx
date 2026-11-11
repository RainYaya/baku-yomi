import { MODES, MODE_LABELS, useTheme } from './themeStore';

/** A labelled two-state switch. Dots alone never said which theme was which. */
export function ThemeIndicator() {
  const { mode, setMode } = useTheme();

  return (
    <div className="theme-switch" role="group" aria-label="主题">
      {MODES.map((item) => (
        <button
          key={item}
          type="button"
          className={`theme-switch-btn${item === mode ? ' active' : ''}`}
          data-mode={item}
          aria-pressed={item === mode}
          title={MODE_LABELS[item]}
          onClick={() => setMode(item)}
        >
          {MODE_LABELS[item]}
        </button>
      ))}
    </div>
  );
}
