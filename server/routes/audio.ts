import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Hono } from 'hono';

/**
 * Audiobook assets live outside the repository: they are large, personal and
 * usually copyrighted, so they are never built into `dist/`. Each asset is a
 * directory holding `asset.json` and the chapter files it names.
 */
export const DEFAULT_AUDIO_DIR = join(homedir(), 'baku-yomi-data', 'audio');

const ASSET_ID = /^[a-z0-9][a-z0-9-]*$/;
const AUDIO_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:opus|ogg)$/;

export interface AudioAssetSummary {
  id: string;
  title: string;
  author: string;
  durationMs: number;
  sizeBytes: number;
}

function audioDir(): string {
  return process.env.BAKU_AUDIO_DIR || DEFAULT_AUDIO_DIR;
}

/** Resolve a path and refuse anything that escapes the asset directory. */
function inside(root: string, ...parts: string[]): string | null {
  const full = resolve(root, ...parts);
  const prefix = resolve(root) + sep;
  return full.startsWith(prefix) ? full : null;
}

function contentTypeOf(file: string): string {
  return file.endsWith('.opus') || file.endsWith('.ogg')
    ? 'audio/ogg'
    : 'application/octet-stream';
}

/**
 * `bytes=0-` and `bytes=500-999` only. Anything else is ignored and the whole
 * file is sent, which every browser treats as a valid response.
 */
export function parseRange(
  header: string | undefined,
  size: number
): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  let start: number;
  let end: number;

  if (rawStart === '') {
    // `bytes=-500` means the last 500 bytes.
    const length = Number(rawEnd);
    if (!Number.isFinite(length) || length <= 0) return null;
    start = Math.max(0, size - length);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || start >= size || end < start) return null;

  return { start, end: Math.min(end, size - 1) };
}

async function serveAudio(path: string, rangeHeader: string | undefined) {
  const info = await stat(path);
  const range = parseRange(rangeHeader, info.size);

  if (!range) {
    const body = Readable.toWeb(
      createReadStream(path)
    ) as unknown as ReadableStream;
    return new Response(body, {
      headers: {
        'Content-Type': contentTypeOf(path),
        'Content-Length': String(info.size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  const body = Readable.toWeb(
    createReadStream(path, { start: range.start, end: range.end })
  ) as unknown as ReadableStream;

  return new Response(body, {
    status: 206,
    headers: {
      'Content-Type': contentTypeOf(path),
      'Content-Length': String(range.end - range.start + 1),
      'Content-Range': `bytes ${range.start}-${range.end}/${info.size}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

async function summarize(dir: string, id: string): Promise<AudioAssetSummary | null> {
  const assetPath = inside(dir, id, 'asset.json');
  if (!assetPath) return null;

  try {
    const raw = JSON.parse(await readFile(assetPath, 'utf8')) as {
      book?: { title?: string; author?: string };
      audio?: { chapters?: { durationMs?: number; file?: string }[] };
    };
    const chapters = raw.audio?.chapters ?? [];
    let sizeBytes = 0;
    for (const chapter of chapters) {
      if (!chapter.file || !AUDIO_FILE.test(chapter.file)) continue;
      const file = inside(dir, id, chapter.file);
      if (!file) continue;
      sizeBytes += await stat(file).then((info) => info.size).catch(() => 0);
    }

    return {
      id,
      title: raw.book?.title ?? id,
      author: raw.book?.author ?? '',
      durationMs: chapters.reduce(
        (total, chapter) => total + (chapter.durationMs ?? 0),
        0
      ),
      sizeBytes,
    };
  } catch {
    return null;
  }
}

export function createAudioRoute(options?: { dir?: string }) {
  const route = new Hono();
  const dir = options?.dir ?? audioDir();

  route.get('/audio/list', async (c) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const assets: AudioAssetSummary[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !ASSET_ID.test(entry.name)) continue;
      const summary = await summarize(dir, entry.name);
      if (summary) assets.push(summary);
    }

    return c.json({ assets });
  });

  route.get('/audio/:id/asset.json', async (c) => {
    const id = c.req.param('id');
    if (!ASSET_ID.test(id)) return c.json({ error: 'not_found' }, 404);

    const assetPath = inside(dir, id, 'asset.json');
    if (!assetPath) return c.json({ error: 'not_found' }, 404);

    try {
      const text = await readFile(assetPath, 'utf8');
      return c.body(text, 200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
    } catch {
      return c.json({ error: 'not_found' }, 404);
    }
  });

  route.get('/audio/:id/:file', async (c) => {
    const id = c.req.param('id');
    const file = c.req.param('file');
    if (!ASSET_ID.test(id) || !AUDIO_FILE.test(file)) {
      return c.json({ error: 'not_found' }, 404);
    }

    const path = inside(dir, id, file);
    if (!path) return c.json({ error: 'not_found' }, 404);

    try {
      return await serveAudio(path, c.req.header('range'));
    } catch {
      return c.json({ error: 'not_found' }, 404);
    }
  });

  return route;
}

export default createAudioRoute();
