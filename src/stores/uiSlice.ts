import { create } from 'zustand';
import type { VocabDraft, VocabEntry } from '../types';

export type AppView =
  | 'home'
  | 'bookshelf'
  | 'reader'
  | 'review'
  | 'vocab'
  | 'note'
  | 'saved';

export interface VocabDialogRequest {
  /** Remounts the form when the dialog switches to another word. */
  key: string;
  draft: VocabDraft;
  entry?: VocabEntry;
  notice?: string;
}

interface UIState {
  settingsOpen: boolean;
  sidebarOpen: boolean;
  currentView: AppView;
  vocabDialog: VocabDialogRequest | null;
  openSettings: () => void;
  closeSettings: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setCurrentView: (view: AppView) => void;
  openVocabDialog: (request: Omit<VocabDialogRequest, 'key'>) => void;
  closeVocabDialog: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  settingsOpen: false,
  sidebarOpen: true,
  currentView: 'home',
  vocabDialog: null,

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setCurrentView: (view) => set({ currentView: view }),
  openVocabDialog: (request) =>
    set({
      vocabDialog: {
        ...request,
        key: `vocab-dialog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      },
    }),
  closeVocabDialog: () => set({ vocabDialog: null }),
}));
