import type { StateStorage } from 'zustand/middleware';
import { STORAGE_ERROR_EVENT } from './storage';

/**
 * Coalesces rapid persist writes into one `localStorage.setItem`.
 *
 * Reading progress updates on scroll; without this, every scroll event
 * rewrites the whole book store (including every chapter and cover image).
 * The pending write is flushed on `pagehide` / `beforeunload` so closing the
 * app does not lose the last update.
 */
export function createDebouncedStorage(delay = 300): StateStorage {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { name: string; value: string } | null = null;

  const flush = () => {
    if (!pending) return;
    const { name, value } = pending;
    pending = null;
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // Storage can be unavailable or full; the in-memory store still works.
      // Surface it instead of silently losing the write.
      if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(STORAGE_ERROR_EVENT, { detail: { name } })
        );
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
  }

  return {
    getItem: (name) => {
      try {
        return window.localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      pending = { name, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, delay);
    },
    removeItem: (name) => {
      if (pending?.name === name) pending = null;
      try {
        window.localStorage.removeItem(name);
      } catch {
        // Ignore storage failures.
      }
    },
  };
}
