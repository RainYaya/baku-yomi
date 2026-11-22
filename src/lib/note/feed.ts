import type { NoteFeedItem, NoteSource, NoteSourceCache } from '../../types/note';

const MAX_FEED_ITEMS = 120;
const EXCERPT_LENGTH = 180;

export interface FeedFilter {
  hiddenUrls?: readonly string[];
  blockedKeywords?: readonly string[];
  /** When given, only these sources' items survive. */
  sources?: readonly NoteSource[];
}

/** Canonical form for read/hidden/dedupe comparisons. */
export function normalizeNoteUrl(raw: string): string {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    url.hostname = url.hostname.toLowerCase();
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return trimmed;
  }
}

export function excerptFromHtml(html: string, limit = EXCERPT_LENGTH): string {
  const text = decodeBasicEntities(
    html
      .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6]|blockquote|section|article)>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim();

  return Array.from(text).slice(0, limit).join('');
}

export function unreadCount(
  items: readonly NoteFeedItem[],
  readAt: Record<string, number>
): number {
  const read = new Set(Object.keys(readAt).map(normalizeNoteUrl));
  return items.filter((item) => !read.has(normalizeNoteUrl(item.url))).length;
}

export function relativeNoteTime(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp;
  if (!Number.isFinite(diff) || diff < 60_000) return '刚刚';

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;

  const date = new Date(timestamp);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

/** Remove manually hidden items, blocked topics and disabled sources. */
export function filterFeed(
  items: readonly NoteFeedItem[],
  filter: FeedFilter = {}
): NoteFeedItem[] {
  const hidden = new Set((filter.hiddenUrls ?? []).map(normalizeNoteUrl));
  const blocked = (filter.blockedKeywords ?? [])
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
  const enabled = filter.sources
    ? new Set(
        filter.sources
          .filter((source) => source.enabled)
          .map((source) => source.id)
      )
    : null;

  return items.filter((item) => {
    if (hidden.has(normalizeNoteUrl(item.url))) return false;
    if (enabled && !enabled.has(item.sourceId)) return false;

    if (blocked.length > 0) {
      const haystack = `${item.title} ${item.excerpt}`.toLowerCase();
      if (blocked.some((word) => haystack.includes(word))) return false;
    }

    return true;
  });
}

/**
 * Merge enabled source caches into one feed: dedupe by canonical URL (the
 * first source wins), drop hidden/blocked entries, newest first, 120 max.
 */
export function mergeFeeds(
  caches: Record<string, NoteSourceCache | undefined>,
  sources: readonly NoteSource[],
  filter: FeedFilter = {}
): NoteFeedItem[] {
  const candidates: NoteFeedItem[] = [];

  for (const source of sources) {
    if (!source.enabled) continue;
    const cache = caches[source.id];
    if (cache) candidates.push(...cache.items);
  }

  const seen = new Set<string>();
  const unique = filterFeed(candidates, {
    ...filter,
    sources,
  }).filter((item) => {
    const key = normalizeNoteUrl(item.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, MAX_FEED_ITEMS);
}

function decodeBasicEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const hex = entity[1]?.toLowerCase() === 'x';
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}
