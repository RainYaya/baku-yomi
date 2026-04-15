import { useEffect, type ReactNode } from 'react';
import { KEY_MAP, ThemeContext, applyBodyClass, useThemeStore } from './themeStore';
import { ThemeOverlays } from './ThemeOverlays';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);

  useEffect(() => {
    applyBodyClass(mode);
  }, [mode]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const nextMode = KEY_MAP[event.key.toLowerCase()];
      if (nextMode) {
        // Defer so other handlers (e.g. ReadingView's auto-read on 'r')
        // can call preventDefault first
        setTimeout(() => {
          if (!event.defaultPrevented) setMode(nextMode);
        }, 0);
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [setMode]);

  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      <ThemeOverlays />
      {children}
    </ThemeContext.Provider>
  );
}
