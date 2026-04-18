import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createContext, useContext } from 'react';

export type ThemeMode = 'night' | 'midnight' | 'day' | 'sunny' | 'rain' | 'snow';

export const MODES: ThemeMode[] = ['night', 'midnight', 'day', 'sunny', 'rain', 'snow'];

export const MODE_LABELS: Record<ThemeMode, string> = {
  night: 'Night',
  midnight: 'Moonlight',
  day: 'Day',
  sunny: 'Sunny',
  rain: 'Rain',
  snow: 'Snow',
};

export const MODE_SHORTCUTS: Record<ThemeMode, string> = {
  night: 'N',
  midnight: 'M',
  day: 'D',
  sunny: 'S',
  rain: 'R',
  snow: 'W',
};

export const KEY_MAP: Record<string, ThemeMode> = {
  n: 'night',
  m: 'midnight',
  d: 'day',
  s: 'sunny',
  r: 'rain',
  w: 'snow',
};

export interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'snow',
      setMode: (mode) => set({ mode }),
    }),
    { name: 'baku-yomi-theme' }
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
  body.classList.remove('midnight', 'light', 'sunny', 'rain', 'snow');

  switch (mode) {
    case 'night':
      break;
    case 'midnight':
      body.classList.add('midnight');
      break;
    case 'day':
      body.classList.add('light');
      break;
    case 'sunny':
      body.classList.add('sunny');
      break;
    case 'rain':
      body.classList.add('rain');
      break;
    case 'snow':
      body.classList.add('snow');
      break;
  }
}
