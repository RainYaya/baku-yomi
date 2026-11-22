import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mergeFeeds, unreadCount } from '../lib/note/feed';
import { useNoteStore } from '../stores/noteSlice';
import type { NoteFeedItem } from '../types/note';

const FEED_TTL_MS = 15 * 60 * 1000;

export interface NoteFeedState {
  sources: ReturnType<typeof useNoteStore.getState>['sources'];
  enabledSources: ReturnType<typeof useNoteStore.getState>['sources'];
  items: NoteFeedItem[];
  unread: number;
  sourceCounts: Record<string, number>;
  sourceErrors: Record<string, string>;
  seeded: boolean;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: (force?: boolean) => Promise<void>;
}

/**
 * Reads the persisted caches for an instant first paint, then refreshes
 * enabled sources when any cache is older than 15 minutes.
 */
export function useNoteFeed(): NoteFeedState {
  const sources = useNoteStore((s) => s.sources);
  const caches = useNoteStore((s) => s.caches);
  const readAt = useNoteStore((s) => s.readAt);
  const hiddenUrls = useNoteStore((s) => s.hiddenUrls);
  const blockedKeywords = useNoteStore((s) => s.blockedKeywords);
  const seededAt = useNoteStore((s) => s.seededAt);
  const ensureDefaults = useNoteStore((s) => s.ensureDefaults);
  const setCache = useNoteStore((s) => s.setCache);

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoKeyRef = useRef('');

  useEffect(() => {
    ensureDefaults();
  }, [ensureDefaults]);

  const enabledSources = useMemo(
    () => sources.filter((source) => source.enabled),
    [sources]
  );

  const items = useMemo(
    () => mergeFeeds(caches, sources, { hiddenUrls, blockedKeywords }),
    [caches, sources, hiddenUrls, blockedKeywords]
  );

  const unread = useMemo(() => unreadCount(items, readAt), [items, readAt]);

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item.sourceId] = (counts[item.sourceId] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const sourceErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const source of enabledSources) {
      const message = caches[source.id]?.error;
      if (message) errors[source.id] = message;
    }
    return errors;
  }, [enabledSources, caches]);

  const refresh = useCallback(
    async (force = false) => {
      if (enabledSources.length === 0) return;

      setRefreshing(true);
      setError(null);
      try {
        const response = await fetch('/api/note/feed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sources: enabledSources.map(({ kind, key }) => ({ kind, key })),
            force,
          }),
        });
        const data = (await response.json().catch(() => null)) as {
          results?: Array<{
            sourceId?: string;
            items?: NoteFeedItem[];
            error?: string;
          }>;
          error?: string;
        } | null;

        if (!response.ok) {
          throw new Error(data?.error ?? '读取 note 更新失败。');
        }

        const now = Date.now();
        for (const result of data?.results ?? []) {
          const sourceId = typeof result.sourceId === 'string' ? result.sourceId : '';
          if (!sourceId) continue;
          const existing = useNoteStore.getState().caches[sourceId];

          if (result.error) {
            setCache({
              sourceId,
              items: existing?.items ?? [],
              fetchedAt: existing?.fetchedAt ?? now,
              error: result.error,
            });
          } else {
            setCache({
              sourceId,
              items: Array.isArray(result.items) ? result.items : [],
              fetchedAt: now,
            });
          }
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '读取 note 更新失败。');
      } finally {
        setRefreshing(false);
      }
    },
    [enabledSources, setCache]
  );

  const enabledKey = enabledSources.map((source) => source.id).sort().join('|');

  useEffect(() => {
    if (!enabledKey) {
      autoKeyRef.current = '';
      return;
    }

    const now = Date.now();
    const stale = enabledSources.some((source) => {
      const cache = useNoteStore.getState().caches[source.id];
      return !cache || now - cache.fetchedAt > FEED_TTL_MS;
    });

    if (stale && autoKeyRef.current !== enabledKey) {
      autoKeyRef.current = enabledKey;
      void refresh(false);
    }
  }, [enabledKey, enabledSources, refresh]);

  const loading =
    refreshing && enabledSources.every((source) => !caches[source.id]);

  return {
    sources,
    enabledSources,
    items,
    unread,
    sourceCounts,
    sourceErrors,
    seeded: seededAt !== null,
    loading,
    refreshing,
    error,
    refresh,
  };
}

/** Cheap unread badge for the home and shelf entry points. */
export function useNoteUnread(): { unread: number; sourceCount: number } {
  const sources = useNoteStore((s) => s.sources);
  const caches = useNoteStore((s) => s.caches);
  const readAt = useNoteStore((s) => s.readAt);
  const hiddenUrls = useNoteStore((s) => s.hiddenUrls);
  const blockedKeywords = useNoteStore((s) => s.blockedKeywords);

  return useMemo(() => {
    const items = mergeFeeds(caches, sources, { hiddenUrls, blockedKeywords });
    return {
      unread: unreadCount(items, readAt),
      sourceCount: sources.filter((source) => source.enabled).length,
    };
  }, [caches, sources, readAt, hiddenUrls, blockedKeywords]);
}
