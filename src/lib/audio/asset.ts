import type { Book, BookAudioChapter } from '../../types';

/**
 * `asset.json` is written by `tools/audiobook` and served next to the chapter
 * audio files. It carries the whole book — chapters, pairs and the pair
 * timings produced by aligning the narration transcript to the text — so a
 * deployment can hand a ready-made audiobook to any browser without that
 * browser importing or aligning anything.
 */
export interface AudioAssetOptions {
  /** URL prefix the chapter files are served from, e.g. `/api/audio/mushoku-01`. */
  base: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readChapter(value: unknown): BookAudioChapter | null {
  if (!isRecord(value)) return null;
  const { index, file, startMs, durationMs } = value;
  if (!Number.isInteger(index) || typeof file !== 'string' || !file) return null;
  if (!file.endsWith('.opus') && !file.endsWith('.ogg')) return null;
  if (!isFiniteNumber(startMs) || !isFiniteNumber(durationMs)) return null;

  return {
    index: index as number,
    file,
    startMs: Math.max(0, startMs),
    durationMs: Math.max(0, durationMs),
  };
}

/**
 * Turn a parsed `asset.json` into a playable book, or `null` when the file is
 * not one. A single malformed audio chapter is dropped rather than failing
 * the whole book: the text is still worth reading.
 */
export function readAudioAsset(
  raw: unknown,
  options: AudioAssetOptions
): Book | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== 1) return null;

  const book = raw.book;
  if (!isRecord(book)) return null;
  if (typeof book.id !== 'string' || !book.id) return null;
  if (typeof book.title !== 'string' || !book.title) return null;
  if (!Array.isArray(book.chapters) || book.chapters.length === 0) return null;

  const audio = isRecord(raw.audio) ? raw.audio : {};
  const chapters = Array.isArray(audio.chapters)
    ? audio.chapters
        .map(readChapter)
        .filter((chapter): chapter is BookAudioChapter => chapter !== null)
    : [];

  return {
    ...(book as unknown as Book),
    source: { kind: 'audiobook' },
    audio: { base: options.base, chapters },
  };
}
