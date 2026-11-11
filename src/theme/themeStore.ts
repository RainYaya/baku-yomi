import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createContext, useContext } from 'react';

/**
 * Two themes, not six weather moods. `paper` is the looseleaf desk in
 * daylight; `night` is the same desk under a lamp. Both are the same
 * structure, so switching never changes where anything lives.
 */
export type ThemeMode = 'paper' | 'night';

export const MODES: ThemeMode[] = ['paper', 'night'];

export const MODE_LABELS: Record<ThemeMode, string> = {
  paper: '纸页',
  night: '夜读',
};

export interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'paper',
      setMode: (mode) => set({ mode }),
      toggleMode: () => set((state) => ({ mode: state.mode === 'paper' ? 'night' : 'paper' })),
    }),
    {
      name: 'baku-yomi-theme',
      version: 2,
      // The old six-theme setting may still be in localStorage. Anything
      // that was dark stays dark; everything else becomes paper.
      migrate: (persisted) => {
        const previous = (persisted as { mode?: string } | undefined)?.mode;
        return { mode: previous === 'night' || previous === 'midnight' ? 'night' : 'paper' } as ThemeState;
      },
    }
  )
);

export const ThemeContext = createContext<ThemeState | null>(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}

export function applyBodyClass(mode: ThemeMode) {
  const body = document.body;
  body.classList.remove('paper', 'night');
  body.classList.add(mode);
  body.dataset.theme = mode;
}
