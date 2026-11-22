import { Hono } from 'hono';
import { assertPublicUrl, fetchOnce } from './fetchUrl';
import { extractNoteArticle } from '../note/article';
import { noteRssUrl, noteSourceId, parseNoteRss } from '../note/rss';
import type { NoteFeedSource } from '../note/rss';

const note = new Hono();

export const MAX_NOTE_SOURCES = 8;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FEED_CACHE_MS = 10 * 60 * 1000;

const feedCache = new Map<
  string,
  { items: ReturnType<typeof parseNoteRss>; fetchedAt: number }
>();

/** Only article pages on note.com itself; nothing else is fetched. */
export function validateNoteArticleUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('网址格式不正确。');
  }

  if (url.protocol !== 'https:') {
    throw new Error('只支持 https 的 note 文章链接。');
  }
  if (url.username || url.password) {
    throw new Error('网址不能包含账号信息。');
  }
  if (url.port && url.port !== '443') {
    throw new Error('只支持 443 端口。');
  }

  const host = url.hostname.toLowerCase();
  if (host !== 'note.com' && host !== 'www.note.com') {
    throw new Error('只支持 note.com 的文章链接。');
  }
  if (!/^\/[A-Za-z0-9_.-]+\/n\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) {
    throw new Error('这看起来不是 note 文章链接，请从文章页复制网址。');
  }

  url.protocol = 'https:';
  url.hostname = 'note.com';
  url.search = '';
  url.hash = '';
  return url;
}

/** Validate the feed request; returns deduped sources, newest request first. */
export function validateNoteFeedSources(raw: unknown): NoteFeedSource[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('请至少添加一个 note 来源。');
  }

  const sources: NoteFeedSource[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('note 来源格式不正确。');
    }
    const { kind, key } = entry as Record<string, unknown>;
    if (kind !== 'hashtag' && kind !== 'author') {
      throw new Error('note 来源类型只能是话题或作者。');
    }
    const clean = typeof key === 'string' ? key.trim() : '';
    if (
      !clean ||
      clean.length > 80 ||
      /[/?#\\]/.test(clean) ||
      [...clean].some((char) => char.charCodeAt(0) < 32)
    ) {
      throw new Error('note 来源名称不正确。');
    }

    const source: NoteFeedSource = { kind, key: clean };
    const id = noteSourceId(source);
    if (seen.has(id)) continue;
    seen.add(id);
    sources.push(source);
  }

  if (sources.length > MAX_NOTE_SOURCES) {
    throw new Error(`最多只能同时启用 ${MAX_NOTE_SOURCES} 个来源。`);
  }
  return sources;
}

class NoteFetchError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/** Map an upstream note response to the error a reader should see. */
export function noteStatusError(status: number): NoteFetchError {
  if (status === 401 || status === 403) {
    return new NoteFetchError(403, '这篇需要登录或权限，去 note 打开。');
  }
  if (status === 404) {
    return new NoteFetchError(404, '这篇 note 文章不存在或已删除。');
  }
  return new NoteFetchError(502, `note 返回 ${status}，请稍后再试。`);
}

function assertNoteHost(url: URL): void {
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    (host !== 'note.com' && host !== 'www.note.com')
  ) {
    throw new NoteFetchError(400, 'note 抓取只允许访问 note.com。');
  }
}

async function fetchNoteText(
  target: URL,
  kind: 'rss' | 'html'
): Promise<{ body: string; url: URL }> {
  let url = await assertPublicUrl(target.toString());
  assertNoteHost(url);
  let response = await fetchOnce(url);

  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get('location');
    if (!location) break;

    const next = new URL(location, url);
    url = await assertPublicUrl(next.toString());
    assertNoteHost(url);
    response = await fetchOnce(url);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new NoteFetchError(502, 'note 跳转次数太多。');
  }
  if (!response.ok) {
    throw noteStatusError(response.status);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const accepted =
    kind === 'html'
      ? /text\/html|application\/xhtml\+xml/i.test(contentType)
      : !contentType || /xml|text\/|application\/(?:rss|atom)/i.test(contentType);
  if (!accepted) {
    throw new NoteFetchError(502, 'note 返回的内容不是可读的网页或订阅源。');
  }

  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) {
    throw new NoteFetchError(413, 'note 返回的内容太大。');
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    throw new NoteFetchError(413, 'note 返回的内容太大。');
  }

  return { body: new TextDecoder('utf-8').decode(buffer), url };
}

note.post('/feed', async (c) => {
  const body = await c.req.json().catch(() => null);
  const rawSources = body && typeof body === 'object' ? body.sources : null;

  let sources: NoteFeedSource[];
  try {
    sources = validateNoteFeedSources(rawSources);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'note 来源格式不正确。' },
      400
    );
  }

  const force = body?.force === true;
  const now = Date.now();

  const results = await Promise.all(
    sources.map(async (source) => {
      const sourceId = noteSourceId(source);
      const cached = feedCache.get(sourceId);

      if (!force && cached && now - cached.fetchedAt < FEED_CACHE_MS) {
        return { sourceId, items: cached.items };
      }

      try {
        const { body: xml } = await fetchNoteText(
          new URL(noteRssUrl(source)),
          'rss'
        );
        const items = parseNoteRss(xml, source);
        feedCache.set(sourceId, { items, fetchedAt: Date.now() });
        return { sourceId, items };
      } catch (error) {
        return {
          sourceId,
          items: [],
          error: error instanceof Error ? error.message : '这个来源暂时读取失败。',
        };
      }
    })
  );

  return c.json({ results });
});

note.post('/article', async (c) => {
  const body = await c.req.json().catch(() => null);
  const raw = body && typeof body.url === 'string' ? body.url.trim() : '';
  if (!raw) return c.json({ error: '请填写 note 文章网址。' }, 400);

  try {
    const url = validateNoteArticleUrl(raw);
    const { body: html } = await fetchNoteText(url, 'html');
    const article = extractNoteArticle(html, url.toString());

    if (article.status === 'empty') {
      return c.json(
        {
          error: '没有读到公开正文，可能是付费或限定文章。可以到 note 原页阅读。',
          status: 'empty',
        },
        422
      );
    }

    return c.json(article);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return c.json({ error: '读取 note 超时，请重试。' }, 504);
    }
    if (error instanceof NoteFetchError) {
      return c.json({ error: error.message }, error.status as 400);
    }
    return c.json(
      { error: error instanceof Error ? error.message : '读取 note 文章失败。' },
      400
    );
  }
});

export default note;
