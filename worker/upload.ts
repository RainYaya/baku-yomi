import { createReadStream } from 'node:fs';
import { basename } from 'node:path';
import { CancelledError } from './cancelled';

export interface UploadOptions {
  /** The app server that receives the asset. Required: a local-only run
   * would report success for a book the reader can never open. */
  baseUrl: string;
  token: string;
  /** Checked between files so a cancel does not publish half a book. */
  isCancelled?: () => boolean;
  fetchImpl?: typeof fetch;
}

function nameOf(path: string): string {
  return encodeURIComponent(basename(path));
}

/**
 * Send a finished asset to the app server, chapters first and the manifest
 * last, then ask the server to publish it. The body is streamed so a chapter
 * file never sits in memory.
 */
export async function uploadAsset(
  audioId: string,
  files: string[],
  options: UploadOptions
): Promise<void> {
  if (!options.baseUrl) {
    throw new Error(
      'BAKU_ROG_URL is not set; the audiobook was not uploaded anywhere'
    );
  }
  if (!options.token) {
    throw new Error('BAKU_IMPORT_TOKEN is not set; the server will refuse the upload');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, '');
  const headers = { 'x-baku-import-token': options.token };
  const cancelled = () => options.isCancelled?.() === true;

  for (const file of files) {
    if (cancelled()) throw new CancelledError();
    const body = createReadStream(file) as unknown as BodyInit;
    const response = await fetchImpl(
      `${base}/api/audio/import/${audioId}/${nameOf(file)}`,
      {
        method: 'PUT',
        headers,
        body,
        duplex: 'half',
      } as RequestInit
    );

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).trim();
      throw new Error(
        `upload ${basename(file)} failed (HTTP ${response.status})${detail ? `: ${detail}` : ''}`
      );
    }
  }

  if (cancelled()) throw new CancelledError();

  const finish = await fetchImpl(`${base}/api/audio/import/${audioId}/finish`, {
    method: 'POST',
    headers,
  });
  if (!finish.ok) {
    const detail = (await finish.text().catch(() => '')).trim();
    throw new Error(
      `finish import failed (HTTP ${finish.status})${detail ? `: ${detail}` : ''}`
    );
  }
}
