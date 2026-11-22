import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  NoteFeedSource,
  NoteSource,
  NoteSourceCache,
  NoteSourceKind,
} from '../types/note';
import { createDebouncedStorage } from '../lib/debouncedStorage';
import { normalizeNoteUrl } from '../lib/note/feed';

const MAX_ENABLED_SOURCES = 8;
const MAX_SOURCES = 20;
const MAX_HISTORY = 500;

/** Four calm, non-news topics; the user can replace every one. */
export const DEFAULT_NOTE_SOURCES: ReadonlyArray<NoteFeedSource> = [
  { kind: 'hashtag', key: 'エッセイ' },
  { kind: 'hashtag', key: '暮らし' },
  { kind: 'hashtag', key: '読書' },
  { kind: 'hashtag', key: '小説' },
];

/** Politics, war, religion and money are filtered by default (editable). */
export const DEFAULT_BLOCKED_KEYWORDS: readonly string[] = [
  '政治',
  '選挙',
  '政権',
  '政府',
  '国会',
  '首相',
  '大臣',
  '外交',
  '戦争',
  '紛争',
  '軍事',
  '宗教',
  '株',
  '投資',
  'FX',
  '仮想通貨',
  '副業',
  'マネー',
  'ニュース',
  '時事',
  '选举',
  '战争',
  '投资',
];

interface NoteState {
  sources: NoteSource[];
  caches: Record<string, NoteSourceCache>;
  /** normalized URL -> last read timestamp */
  readAt: Record<string, number>;
  /** normalized URLs, newest last */
  hiddenUrls: string[];
  blockedKeywords: string[];
  /** Set once, so a deleted default source does not come back. */
  seededAt: number | null;

  ensureDefaults: () => void;
  addSource: (input: {
    kind: NoteSourceKind;
    key: string;
    label?: string;
    enabled?: boolean;
  }) => string | null;
  removeSource: (id: string) => void;
  toggleSource: (id: string) => boolean;
  setCache: (cache: NoteSourceCache) => void;
  markRead: (url: string) => void;
  hideItem: (url: string) => void;
  unhideItem: (url: string) => void;
  clearHidden: () => void;
  setBlockedKeywords: (keywords: string[]) => void;
}

function defaultLabel(kind: NoteSourceKind, key: string): string {
  return kind === 'hashtag' ? `#${key}` : key;
}

function cleanKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export const useNoteStore = create<NoteState>()(
  persist(
    (set, get) => ({
      sources: [],
      caches: {},
      readAt: {},
      hiddenUrls: [],
      blockedKeywords: [],
      seededAt: null,

      ensureDefaults: () => {
        const state = get();
        if (state.seededAt !== null) return;

        const now = Date.now();
        const sources =
          state.sources.length > 0
            ? state.sources
            : DEFAULT_NOTE_SOURCES.map((source) => ({
                id: `${source.kind}:${source.key}`,
                kind: source.kind,
                key: source.key,
                label: defaultLabel(source.kind, source.key),
                enabled: true,
                addedAt: now,
              }));

        set({
          sources,
          blockedKeywords:
            state.blockedKeywords.length > 0
              ? state.blockedKeywords
              : [...DEFAULT_BLOCKED_KEYWORDS],
          seededAt: now,
        });
      },

      addSource: ({ kind, key, label, enabled = true }) => {
        const state = get();
        const clean = cleanKey(key);
        if (!clean || clean.length > 80 || /[/?#\\]/.test(clean)) return null;

        const id = `${kind}:${clean}`;
        const existing = state.sources.find((source) => source.id === id);
        if (existing) return existing.id;

        if (state.sources.length >= MAX_SOURCES) return null;
        if (
          enabled &&
          state.sources.filter((source) => source.enabled).length >=
            MAX_ENABLED_SOURCES
        ) {
          return null;
        }

        set({
          sources: [
            ...state.sources,
            {
              id,
              kind,
              key: clean,
              label: label?.trim() || defaultLabel(kind, clean),
              enabled,
              addedAt: Date.now(),
            },
          ],
        });
        return id;
      },

      removeSource: (id) =>
        set((state) => {
          const caches = { ...state.caches };
          delete caches[id];
          return {
            sources: state.sources.filter((source) => source.id !== id),
            caches,
          };
        }),

      toggleSource: (id) => {
        const state = get();
        const target = state.sources.find((source) => source.id === id);
        if (!target) return false;

        if (
          !target.enabled &&
          state.sources.filter((source) => source.enabled).length >=
            MAX_ENABLED_SOURCES
        ) {
          return false;
        }

        set({
          sources: state.sources.map((source) =>
            source.id === id ? { ...source, enabled: !source.enabled } : source
          ),
        });
        return true;
      },

      setCache: (cache) =>
        set((state) => ({
          caches: { ...state.caches, [cache.sourceId]: cache },
        })),

      markRead: (url) =>
        set((state) => {
          const next = {
            ...state.readAt,
            [normalizeNoteUrl(url)]: Date.now(),
          };
          const entries = Object.entries(next);
          if (entries.length <= MAX_HISTORY) return { readAt: next };

          entries.sort((a, b) => a[1] - b[1]);
          return { readAt: Object.fromEntries(entries.slice(-MAX_HISTORY)) };
        }),

      hideItem: (url) =>
        set((state) => {
          const normalized = normalizeNoteUrl(url);
          if (state.hiddenUrls.includes(normalized)) return {};
          return {
            hiddenUrls: [...state.hiddenUrls, normalized].slice(-MAX_HISTORY),
          };
        }),

      unhideItem: (url) => {
        const normalized = normalizeNoteUrl(url);
        set((state) => ({
          hiddenUrls: state.hiddenUrls.filter((entry) => entry !== normalized),
        }));
      },

      clearHidden: () => set({ hiddenUrls: [] }),

      setBlockedKeywords: (keywords) => {
        const seen = new Set<string>();
        const clean: string[] = [];
        for (const keyword of keywords) {
          const value = keyword.trim();
          if (!value || seen.has(value)) continue;
          seen.add(value);
          clean.push(value);
        }
        set({ blockedKeywords: clean });
      },
    }),
    {
      name: 'note-store',
      version: 1,
      storage: createJSONStorage(() => createDebouncedStorage()),
    }
  )
);
