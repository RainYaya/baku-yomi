import { decodeEntities, innerById, innerByTag } from './xml';

export type NoteArticleStatus = 'ok' | 'partial' | 'empty';

export interface NoteArticle {
  url: string;
  title: string;
  author: string;
  publishedAt: number;
  tags: string[];
  paragraphs: string[];
  text: string;
  status: NoteArticleStatus;
}

const MIN_BODY_LENGTH = 40;

const PAYWALL_MARKER =
  /(?:ここから先は有料|この先は有料|有料記事|有料です|paywall|限定公開)/i;

/**
 * Read a note article page. Metadata comes from JSON-LD, the body from
 * `#note-body`; a generic `<article>` is the fallback. Paywalled pages keep
 * their visible lead but are reported as `partial`.
 */
export function extractNoteArticle(html: string, url: string): NoteArticle {
  const posting = findPosting(jsonLdBlocks(html));
  const bodyHtml =
    innerById(html, 'note-body') ?? innerByTag(html, 'article');

  const paragraphs = paragraphsFromHtml(
    bodyHtml ? stripPaywall(bodyHtml) : ''
  );
  const text = paragraphs.join('\n');
  const length = Array.from(text).length;

  const status: NoteArticleStatus =
    !text || length < MIN_BODY_LENGTH
      ? 'empty'
      : PAYWALL_MARKER.test(html)
        ? 'partial'
        : 'ok';

  return {
    url: firstString(
      posting?.url,
      (posting?.mainEntityOfPage as Record<string, unknown> | undefined)?.['@id'],
      posting?.mainEntityOfPage
    ) || url,
    title:
      firstString(posting?.headline, metaContent(html, 'og:title')) ||
      cleanTitle(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''),
    author:
      authorName(posting?.author) || metaContent(html, 'author'),
    publishedAt:
      Date.parse(
        firstString(
          posting?.datePublished,
          metaContent(html, 'article:published_time')
        )
      ) || 0,
    tags: keywordList(posting?.keywords).length
      ? keywordList(posting?.keywords)
      : metaValues(html, 'article:tag'),
    paragraphs,
    text,
    status,
  };
}

function jsonLdBlocks(html: string): unknown[] {
  const values: unknown[] = [];
  const pattern =
    /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    try {
      values.push(JSON.parse(match[1].trim()));
    } catch {
      // A broken metadata block must not discard the article body.
    }
  }
  return values;
}

function findPosting(values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    const found = findPostingIn(value);
    if (found) return found;
  }
  return null;
}

function findPostingIn(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findPostingIn(entry);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  if (Array.isArray(record['@graph'])) {
    const found = findPostingIn(record['@graph']);
    if (found) return found;
  }

  const type = record['@type'];
  const typeName = Array.isArray(type) ? type.join(' ') : String(type ?? '');
  return /article|posting/i.test(typeName) || 'headline' in record
    ? record
    : null;
}

function authorName(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return authorName(value[0]);
  if (value && typeof value === 'object') {
    const name = (value as Record<string, unknown>).name;
    return typeof name === 'string' ? name.trim() : '';
  }
  return '';
}

function keywordList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry).trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,、]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return decodeEntities(value.trim());
  }
  return '';
}

function cleanTitle(value: string): string {
  return decodeEntities(value)
    .replace(/\s*[｜|]\s*note\s*$/i, '')
    .replace(/\s+-\s+note\s*$/i, '')
    .trim();
}

function metaContent(html: string, key: string): string {
  return metaValues(html, key)[0] ?? '';
}

function metaValues(html: string, key: string): string[] {
  const values: string[] = [];
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of tags) {
    const name = attr(tag, 'property') ?? attr(tag, 'name');
    if (name?.toLowerCase() !== key.toLowerCase()) continue;
    const content = attr(tag, 'content');
    if (content) values.push(decodeEntities(content));
  }
  return values;
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? match[1] : undefined;
}

function stripPaywall(html: string): string {
  return html.replace(
    /<(div|section|aside)\b[^>]*(?:class|id|data-testid)=["'][^"']*(?:paywall|note-paywall)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
    '\n'
  );
}

function paragraphsFromHtml(html: string): string[] {
  const withoutNoise = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template|iframe|svg|video|audio)[\s\S]*?<\/\1>/gi, '')
    .replace(/<figure\b[\s\S]*?<\/figure>/gi, '')
    .replace(/<a\b[^>]*(?:note-footnote|footnote)[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/<(img|source|embed|input)\b[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|section|article|ul|ol|tr|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  return decodeEntities(withoutNoise)
    .split('\n')
    .map((line) => line.replace(/[ \t\u3000]+/g, ' ').trim())
    .filter(Boolean);
}
