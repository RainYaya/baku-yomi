import type { Book } from '../../types';
import { readAudioAsset } from './asset';

/**
 * Audiobook assets that already sit on the server.
 *
 * A library full of books is too big to commit and usually copyrighted, so a
 * deployment keeps them in `~/baku-yomi-data/audio/<id>/` and the server lists
 * what it finds. Importing one is a fetch, not a file upload.
 */
export interface ServerAudioSummary {
  id: string;
  title: string;
  author: string;
  durationMs: number;
  sizeBytes: number;
}

/** Matches the server's own id rule: one path segment, no slashes. */
const ASSET_ID = /^[a-z0-9][a-z0-9-]*$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export async function listServerAudio(
  fetcher: typeof fetch = fetch
): Promise<ServerAudioSummary[]> {
  try {
    const response = await fetcher('/api/audio/list', { cache: 'no-store' });
    if (!response.ok) return [];

    const body = (await response.json()) as { assets?: unknown };
    if (!Array.isArray(body.assets)) return [];

    const assets: ServerAudioSummary[] = [];
    for (const raw of body.assets as Record<string, unknown>[]) {
      const id = text(raw?.id);
      if (!ASSET_ID.test(id)) continue;
      assets.push({
        id,
        title: text(raw.title) || id,
        author: text(raw.author),
        durationMs: number(raw.durationMs),
        sizeBytes: number(raw.sizeBytes),
      });
    }
    return assets;
  } catch {
    return [];
  }
}

/** Fetch one asset and read it exactly as the built-in sample is read. */
export async function loadServerAudio(
  id: string,
  fetcher: typeof fetch = fetch
): Promise<Book | null> {
  if (!ASSET_ID.test(id)) return null;

  const base = `/api/audio/${id}`;
  try {
    const response = await fetcher(`${base}/asset.json`, { cache: 'no-store' });
    if (!response.ok) return null;
    return readAudioAsset(await response.json(), { base });
  } catch {
    return null;
  }
}
