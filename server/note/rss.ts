import { decodeEntities, stripTags } from './xml';
import type { NoteFeedItem, NoteFeedSource } from '../../src/types/note';

export type { NoteFeedItem, NoteFeedSource } from '../../src/types/note';

const MAX_ITEMS = 25;

/** Stable id shared by the store, cache and feed items. */
export function noteSourceId(source: NoteFeedSource): string {
  return `${source.kind}:${source.key}`;
}

export function noteRssUrl(source: NoteFeedSource): string {
  const key = encodeURIComponent(source.key);
  return source.kind === 'hashtag'
    ? `https://note.com/hashtag/${key}/rss`
    : `https://note.com/${key}/rss`;
}

/**
 * A feed item is usable only when it has a link. Everything else degrades to
 * an empty string or 0 so one malformed item never fails the whole source.
 */
export function parseNoteRss(xml: string, source: NoteFeedSource): NoteFeedItem[] {
  if (typeof xml !== 'string' || !xml) return [];

  const sourceId = noteSourceId(source);
  const items: NoteFeedItem[] = [];
  const itemPattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;

  let match: RegExpExecArray | null;
  while ((match = itemPattern.exec(xml)) && items.length < MAX_ITEMS) {
    const block = match[1];
    const url = decodeEntities(tagText(block, 'link'));
    if (!url) continue;

    const published = Date.parse(decodeEntities(tagText(block, 'pubDate')));

    items.push({
      url,
      title: decodeEntities(tagText(block, 'title')),
      author: decodeEntities(
        tagText(block, 'note:creatorName') ||
          tagText(block, 'dc:creator') ||
          tagText(block, 'author')
      ),
      publishedAt: Number.isFinite(published) ? published : 0,
      excerpt: Array.from(stripTags(tagText(block, 'description')))
        .slice(0, 180)
        .join(''),
      thumbnail: attribute(block, 'url'),
      sourceId,
    });
  }

  return items;
}

function tagText(block: string, tag: string): string {
  const pattern = new RegExp(
    `<${escapeRegExp(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`,
    'i'
  );
  const match = block.match(pattern);
  if (!match) return '';

  const inner = match[1].trim();
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return (cdata ? cdata[1] : inner).trim();
}

function attribute(block: string, name: string): string | undefined {
  const match = block.match(
    new RegExp(
      `<(?:media:thumbnail|media:content|enclosure)\\b[^>]*\\b${escapeRegExp(name)}=["']([^"']+)["']`,
      'i'
    )
  );
  return match ? decodeEntities(match[1]) : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
