import { create } from 'zustand';

export type AppView = 'bookshelf' | 'reader';

interface UIState {
  settingsOpen: boolean;
  sidebarOpen: boolean;
  currentView: AppView;
  openSettings: () => void;
  closeSettings: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setCurrentView: (view: AppView) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  settingsOpen: false,
  sidebarOpen: true,
  currentView: 'bookshelf',

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setCurrentView: (view) => set({ currentView: view }),
}));
