export interface AlignCue {
  startMs: number;
  endMs: number;
  text: string;
}

export interface AlignPair {
  japanese: string;
}

export interface PairTiming {
  startMs: number;
  endMs: number;
}

export interface AlignmentResult {
  /** One entry per input pair, in input order. `null` means no audio covers it. */
  timings: (PairTiming | null)[];
  /** Pairs that matched the narration text directly. */
  matched: number;
}

/** Shorter normalized text than this is only trusted right at the cursor. */
const MIN_ANCHOR = 4;

/** A long match is rare enough to search this far ahead of the cursor. */
const MIN_WINDOW = 4000;
const WINDOW_PER_CHAR = 8;

/**
 * A short phrase such as 「まあね」 appears all over a book, so it only counts
 * as an anchor when it sits at the very next thing the narrator said.
 */
const SHORT_TEXT = 6;
const SHORT_WINDOW = 60;

/** Longest probe first: a longer match is far less likely to be a coincidence. */
const PROBES = [20, 14, 10, 6] as const;

const IGNORED = /[^\p{L}\p{N}]/gu;

/**
 * Case, width and punctuation differ between a printed book and the
 * transcript someone made while listening. Both sides go through this before
 * they are compared, so only the spoken characters have to agree.
 */
export function normalizeAudioText(text: string): string {
  return text.normalize('NFKC').replace(IGNORED, '');
}

function buildCharStream(cues: readonly AlignCue[]) {
  const parts: string[] = [];
  const cueOfChar: number[] = [];

  for (let index = 0; index < cues.length; index++) {
    const text = normalizeAudioText(cues[index].text);
    if (!text) continue;
    parts.push(text);
    for (let i = 0; i < text.length; i++) cueOfChar.push(index);
  }

  return { chars: parts.join(''), cueOfChar };
}

/**
 * Find where a pair was spoken.
 *
 * The cursor only ever moves forward, so one bad match cannot pull the rest of
 * the book backwards. The search is bounded by the expected narration length,
 * which keeps a rare short phrase from matching minutes later by accident.
 */
function anchor(
  text: string,
  chars: string,
  cursor: number
): number {
  if (text.length < MIN_ANCHOR) return -1;

  const windowSize =
    text.length < SHORT_TEXT
      ? SHORT_WINDOW
      : Math.max(MIN_WINDOW, text.length * WINDOW_PER_CHAR);
  const windowEnd = Math.min(chars.length, cursor + windowSize);
  const window = chars.slice(cursor, windowEnd);

  if (text.length < SHORT_TEXT) {
    const found = window.indexOf(text);
    return found >= 0 ? cursor + found : -1;
  }

  for (const probe of PROBES) {
    if (text.length < probe) continue;
    const found = window.indexOf(text.slice(0, probe));
    if (found >= 0) return cursor + found;
  }

  return -1;
}

/**
 * Give each pair the time it was read aloud.
 *
 * Pairs whose text appears in the narration are anchors. A run of untimed
 * pairs between two anchors (short lines such as 「まあね」, or a paragraph the
 * narrator skipped) shares the audio gap between them in proportion to its
 * text length. Untimed runs at the very start or end stay untimed: there is
 * no evidence of when they were spoken.
 */
export function alignPairsToCues(
  pairs: readonly AlignPair[],
  cues: readonly AlignCue[]
): AlignmentResult {
  const timings: (PairTiming | null)[] = pairs.map(() => null);
  if (cues.length === 0 || pairs.length === 0) {
    return { timings, matched: 0 };
  }

  const { chars, cueOfChar } = buildCharStream(cues);
  if (!chars) return { timings, matched: 0 };

  let cursor = 0;
  let matched = 0;

  for (let index = 0; index < pairs.length; index++) {
    const text = normalizeAudioText(pairs[index].japanese);
    const start = anchor(text, chars, cursor);
    if (start < 0) continue;

    const end = Math.min(start + text.length - 1, chars.length - 1);
    timings[index] = {
      startMs: cues[cueOfChar[start]].startMs,
      endMs: cues[cueOfChar[end]].endMs,
    };
    matched++;
    cursor = Math.min(start + text.length, chars.length);
  }

  interpolateRuns(pairs, timings);
  keepMonotonic(timings);

  return { timings, matched };
}

function interpolateRuns(
  pairs: readonly AlignPair[],
  timings: (PairTiming | null)[]
): void {
  let index = 0;

  while (index < timings.length) {
    if (timings[index]) {
      index++;
      continue;
    }

    let end = index;
    while (end < timings.length && !timings[end]) end++;

    const before = index > 0 ? timings[index - 1] : null;
    const after = end < timings.length ? timings[end] : null;

    if (before && after) {
      const weights: number[] = [];
      for (let i = index; i < end; i++) {
        weights.push(Math.max(1, normalizeAudioText(pairs[i].japanese).length));
      }
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      const span = Math.max(0, after.startMs - before.endMs);

      let consumed = 0;
      let previousEnd = before.endMs;
      for (let i = index; i < end; i++) {
        const start = Math.round(previousEnd);
        consumed += weights[i - index];
        const next = Math.round(before.endMs + (span * consumed) / total);
        timings[i] = { startMs: start, endMs: Math.max(start, next) };
        previousEnd = timings[i]!.endMs;
      }
      timings[end - 1] = {
        startMs: timings[end - 1]!.startMs,
        endMs: after.startMs,
      };
    }

    index = end;
  }
}

/** Cue files occasionally overlap; the reader assumes they never do. */
function keepMonotonic(timings: (PairTiming | null)[]): void {
  let previousEnd = 0;

  for (const timing of timings) {
    if (!timing) continue;
    timing.startMs = Math.max(timing.startMs, previousEnd);
    timing.endMs = Math.max(timing.endMs, timing.startMs);
    previousEnd = timing.endMs;
  }
}
