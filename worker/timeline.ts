/**
 * Pure timeline helpers for the TTS worker. They are kept free of I/O so the
 * same maths can be unit-tested without ffmpeg or a speech server.
 */

/** Characters that end a natural break. The break itself stays in the chunk. */
const BREAK_CHARS = new Set(['。', '！', '？', '!', '?', '、', '…', '\n']);

const SENTENCE_END = new Set(['。', '！', '？', '!', '?']);

/**
 * How long the reader should breathe after one pair. A finished sentence gets
 * more room than a comma, and a trailing ellipsis gets the longest pause.
 */
export function pauseAfter(text: string): number {
  const trimmed = text.trimEnd();
  const last = trimmed.at(-1);
  if (!last) return 250;
  if (last === '…') return 450;
  if (SENTENCE_END.has(last)) return 350;
  return 250;
}

export interface PairTiming {
  startMs: number;
  endMs: number;
}

export interface ChapterTiming {
  /** Position in the book's chapter array, not `Chapter.index`. */
  index: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  pairs: PairTiming[];
}

export interface Timeline {
  chapters: ChapterTiming[];
}

function hardSplit(text: string, max: number): string[] {
  const pieces: string[] = [];
  for (let offset = 0; offset < text.length; offset += max) {
    pieces.push(text.slice(offset, offset + max));
  }
  return pieces;
}

/**
 * Split a long paragraph at Japanese punctuation, keeping the punctuation on
 * the preceding chunk. Chunks never exceed `max`; a single unbroken sentence
 * longer than `max` is cut at the limit.
 */
export function chunkText(text: string, max = 280): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= max) return [trimmed];

  const segments: string[] = [];
  let start = 0;
  for (let index = 0; index < trimmed.length; index++) {
    if (!BREAK_CHARS.has(trimmed[index])) continue;
    segments.push(trimmed.slice(start, index + 1));
    start = index + 1;
  }
  if (start < trimmed.length) segments.push(trimmed.slice(start));

  const pieces: string[] = [];
  for (const segment of segments) {
    if (segment.length <= max) pieces.push(segment);
    else pieces.push(...hardSplit(segment, max));
  }

  const chunks: string[] = [];
  let current = '';
  for (const piece of pieces) {
    if (current && current.length + piece.length > max) {
      chunks.push(current.trim());
      current = piece;
    } else {
      current += piece;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.filter(Boolean);
}

/**
 * Lay chapter audio out on the absolute book timeline.
 *
 * `chapterDurations` holds the measured duration of every pair, grouped by
 * chapter. `chapterGaps` holds, for the same pairs, the silence to leave
 * after each one; the entry for a chapter's last pair is ignored, so the next
 * chapter starts immediately and chapters stay contiguous.
 */
export function layoutTimeline(
  chapterDurations: number[][],
  chapterGaps: number[][]
): Timeline {
  let cursor = 0;

  const chapters = chapterDurations.map((durations, index) => {
    const gaps = chapterGaps[index] ?? [];
    const startMs = cursor;
    const pairs: PairTiming[] = [];
    let durationMs = 0;

    for (let pairIndex = 0; pairIndex < durations.length; pairIndex++) {
      const duration = Math.max(0, durations[pairIndex] ?? 0);
      const pairStart = cursor;
      pairs.push({ startMs: pairStart, endMs: pairStart + duration });
      cursor = pairStart + duration;
      durationMs += duration;

      if (pairIndex < durations.length - 1) {
        const gap = Math.max(0, gaps[pairIndex] ?? 0);
        cursor += gap;
        durationMs += gap;
      }
    }

    return { index, startMs, endMs: cursor, durationMs, pairs };
  });

  return { chapters };
}
