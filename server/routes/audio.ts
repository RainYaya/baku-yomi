import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
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
/** Files the TTS worker may upload into a new asset directory. */
const ASSET_FILE = /^(?:asset\.json\.next|[A-Za-z0-9][A-Za-z0-9._-]*\.(?:opus|ogg))$/;

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

export interface AudioRouteOptions {
  dir?: string;
  /** Overrides BAKU_IMPORT_TOKEN; `null` makes imports always forbidden. */
  importToken?: string | null;
}

/** What the worker is allowed to publish, or the reason it is not. */
type ManifestCheck = { files: string[] } | { error: string };

/**
 * A manifest replaces the live one only when it is complete and describes
 * this very asset. Chapter files carry a content hash in their name, so a
 * failed or cancelled upload leaves the previous audiobook untouched instead
 * of mixing old and new chapters under the old timings.
 */
function checkManifest(raw: string, id: string): ManifestCheck {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'asset.json.next is not JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { error: 'asset.json.next is not an object' };
  }

  const asset = parsed as {
    version?: unknown;
    book?: { id?: unknown };
    audio?: { chapters?: unknown };
  };
  if (asset.version !== 1) return { error: 'version must be 1' };
  if (typeof asset.book !== 'object' || asset.book === null) {
    return { error: 'book is missing' };
  }
  if (asset.book.id !== id) {
    return { error: `book id ${String(asset.book.id)} does not match ${id}` };
  }
  if (!Array.isArray(asset.audio?.chapters)) {
    return { error: 'audio.chapters is missing' };
  }

  const files: string[] = [];
  for (const chapter of asset.audio.chapters) {
    const file = (chapter as { file?: unknown } | null)?.file;
    if (typeof file !== 'string' || !AUDIO_FILE.test(file)) {
      return { error: `bad chapter file ${String(file)}` };
    }
    files.push(file);
  }
  return { files };
}

export function createAudioRoute(options?: AudioRouteOptions) {
  const route = new Hono();
  const dir = options?.dir ?? audioDir();
  const configuredToken = options?.importToken;

  function importToken(): string | null {
    if (configuredToken !== undefined) return configuredToken;
    return process.env.BAKU_IMPORT_TOKEN || null;
  }

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

  /**
   * The TTS worker uploads pre-encoded chapter files here. Ids match the
   * regular asset rule and every file name stays one path segment, so a
   * traversal attempt is rejected before touching the disk.
   */
  route.put('/audio/import/:id/:file', async (c) => {
    const token = importToken();
    if (!token || c.req.header('x-baku-import-token') !== token) {
      return c.json({ error: 'forbidden' }, 403);
    }

    const id = c.req.param('id');
    const file = c.req.param('file');
    if (!ASSET_ID.test(id) || !ASSET_FILE.test(file)) {
      return c.json({ error: 'not_found' }, 404);
    }

    const assetDir = inside(dir, id);
    const path = inside(dir, id, file);
    if (!assetDir || !path) return c.json({ error: 'not_found' }, 404);

    const temp = `${path}.part`;
    try {
      await mkdir(assetDir, { recursive: true });
      await writeFile(temp, Buffer.from(await c.req.arrayBuffer()));
      await rename(temp, path);
    } catch {
      await rm(temp, { force: true }).catch(() => undefined);
      return c.json({ error: 'write_failed' }, 500);
    }

    return c.json({ ok: true, id, file });
  });

  route.post('/audio/import/:id/finish', async (c) => {
    const token = importToken();
    if (!token || c.req.header('x-baku-import-token') !== token) {
      return c.json({ error: 'forbidden' }, 403);
    }

    const id = c.req.param('id');
    if (!ASSET_ID.test(id)) return c.json({ error: 'not_found' }, 404);

    const assetDir = inside(dir, id);
    const nextPath = inside(dir, id, 'asset.json.next');
    const assetPath = inside(dir, id, 'asset.json');
    if (!assetDir || !nextPath || !assetPath) {
      return c.json({ error: 'not_found' }, 404);
    }

    const raw = await readFile(nextPath, 'utf8').catch(() => null);
    if (raw === null) return c.json({ error: 'asset_missing' }, 400);

    const check = checkManifest(raw, id);
    if ('error' in check) {
      await rm(nextPath, { force: true }).catch(() => undefined);
      return c.json({ error: 'asset_invalid', detail: check.error }, 400);
    }

    for (const file of check.files) {
      const path = inside(dir, id, file);
      const info = path
        ? await stat(path).catch(() => null)
        : null;
      if (!info || !info.isFile() || info.size === 0) {
        await rm(nextPath, { force: true }).catch(() => undefined);
        return c.json(
          { error: 'asset_invalid', detail: `missing or empty ${file}` },
          400
        );
      }
    }

    // Everything the manifest names is on disk: swap it in, then drop the
    // chapters from the generation this one replaced.
    await rename(nextPath, assetPath);
    const keep = new Set(check.files);
    const entries = await readdir(assetDir, { withFileTypes: true }).catch(
      () => []
    );
    for (const entry of entries) {
      if (!entry.isFile() || keep.has(entry.name)) continue;
      if (!AUDIO_FILE.test(entry.name)) continue;
      await rm(join(assetDir, entry.name), { force: true }).catch(
        () => undefined
      );
    }

    return c.json({ ok: true, id });
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
