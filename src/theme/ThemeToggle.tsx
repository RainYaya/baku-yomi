import { FiMoon, FiSun } from 'react-icons/fi';
import { useTheme } from './themeStore';

interface Props {
  className?: string;
}

/** One button, two themes. The label lives in the tooltip, not the chrome. */
export function ThemeToggle({ className = 'binder-icon-btn' }: Props) {
  const { mode, toggleMode } = useTheme();
  const next = mode === 'paper' ? '夜读' : '纸页';

  return (
    <button
      type="button"
      className={className}
      onClick={toggleMode}
      title={`切换到${next}`}
      aria-label={`切换到${next}`}
    >
      {mode === 'paper' ? <FiMoon size={15} /> : <FiSun size={15} />}
    </button>
  );
}
