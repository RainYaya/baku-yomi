import { Hono } from 'hono';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const fetchUrl = new Hono();

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isPrivateIpv6(address: string): boolean {
  const lower = address.toLowerCase();
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80')
  );
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    !host.includes('.')
  );
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('网址格式不正确。');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('只支持 http / https 网址。');
  }
  if (url.username || url.password) {
    throw new Error('网址不能包含账号信息。');
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new Error('只支持 80 / 443 端口。');
  }
  if (isBlockedHostname(url.hostname)) {
    throw new Error('这个地址不能导入。');
  }

  const literal = isIP(url.hostname);
  const addresses = literal
    ? [{ address: url.hostname, family: literal }]
    : await lookup(url.hostname, { all: true, verbatim: true });

  if (addresses.length === 0) throw new Error('找不到这个网址。');
  for (const entry of addresses) {
    if (entry.family === 4 ? isPrivateIpv4(entry.address) : isPrivateIpv6(entry.address)) {
      throw new Error('这个地址不能导入。');
    }
  }
  return url;
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    nbsp: ' ',
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    hellip: '…',
    mdash: '—',
    ndash: '–',
    middot: '·',
    ldquo: '“',
    rdquo: '”',
    lsquo: '‘',
    rsquo: '’',
  };
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function extractArticle(html: string): { title: string; text: string } {
  const titleMatch =
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) ??
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
  const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : '';

  let body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ');

  // Prefer the article/main body when the page marks one; otherwise use the
  // whole document and let the tag stripping do the work.
  const article =
    /<article[^>]*>([\s\S]*?)<\/article>/i.exec(body) ??
    /<main[^>]*>([\s\S]*?)<\/main>/i.exec(body);
  if (article && article[1].replace(/<[^>]+>/g, '').trim().length > 200) {
    body = article[1];
  }

  const text = body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|li|tr|h[1-6]|blockquote|pre)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .split('\n')
    .map((line) => decodeEntities(line).replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, text };
}

async function fetchOnce(url: URL): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        // Identify honestly and ask for the readable version.
        'user-agent': 'baku-yomi/0.1 (+personal reading tool)',
        accept: 'text/html,text/plain,text/markdown;q=0.9,*/*;q=0.5',
        'accept-language': 'ja,zh-CN;q=0.9,en;q=0.6',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

fetchUrl.post('/fetch-url', async (c) => {
  const body = await c.req.json().catch(() => null);
  const raw = body && typeof body.url === 'string' ? body.url.trim() : '';
  if (!raw) return c.json({ error: '请填写网址。' }, 400);

  try {
    let url = await assertPublicUrl(raw);
    let response = await fetchOnce(url);

    for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get('location');
      if (!location) break;
      url = await assertPublicUrl(new URL(location, url).toString());
      response = await fetchOnce(url);
    }

    if (response.status >= 300 && response.status < 400) {
      return c.json({ error: '这个网址跳转次数太多。' }, 400);
    }
    if (!response.ok) {
      return c.json({ error: `网页返回 ${response.status}，可以手动复制正文再粘贴。` }, 502);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (
      !/text\/html|text\/plain|text\/markdown|application\/xhtml\+xml/i.test(contentType)
    ) {
      return c.json({ error: '这个链接不是网页或文本。请下载后导入，或直接粘贴正文。' }, 400);
    }

    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) {
      return c.json({ error: '网页太大（上限 2MB）。请只粘贴要读的部分。' }, 413);
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return c.json({ error: '网页太大（上限 2MB）。请只粘贴要读的部分。' }, 413);
    }

    // Many Japanese/Chinese pages are Shift_JIS or GBK; the meta charset is
    // inside the bytes, so decode once as UTF-8 and fall back to a declared
    // legacy charset rather than showing mojibake.
    let decoded = new TextDecoder('utf-8').decode(buffer);
    const charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(decoded)?.[1];
    if (charset && !/^utf-?8$/i.test(charset)) {
      try {
        decoded = new TextDecoder(charset).decode(buffer);
      } catch {
        // Unknown charset — keep the UTF-8 decode.
      }
    }

    const isHtml = /text\/html|application\/xhtml\+xml/i.test(contentType);
    const extracted = isHtml
      ? extractArticle(decoded)
      : { title: '', text: decoded.trim() };

    if (!extracted.text.trim()) {
      return c.json({ error: '没有从网页里读到正文。可以手动复制正文再粘贴。' }, 422);
    }

    return c.json({
      url: url.toString(),
      title: extracted.title || url.hostname,
      text: extracted.text,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return c.json({ error: '抓取超时。请重试，或手动复制正文粘贴。' }, 504);
    }
    return c.json(
      { error: error instanceof Error ? error.message : '抓取失败，请手动粘贴。' },
      400
    );
  }
});

export default fetchUrl;
