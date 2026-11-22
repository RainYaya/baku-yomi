import { useEffect, type ReactNode } from 'react';
import { ThemeContext, applyBodyClass, useThemeStore } from './themeStore';
import { useSettingsStore } from '../stores/settingsSlice';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  const toggleMode = useThemeStore((state) => state.toggleMode);
  const readingFont = useSettingsStore((state) => state.readingFont);

  useEffect(() => {
    applyBodyClass(mode);
  }, [mode]);

  useEffect(() => {
    document.body.dataset.readingFont = readingFont;
  }, [readingFont]);

  return (
    <ThemeContext.Provider value={{ mode, setMode, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
