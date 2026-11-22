import type { Book, SentencePair } from '../../types';
import { createBookId } from '../id';
import { createPairId } from '../epub/pairId';
import { buildPairs } from '../epub/pairBuilder';
import { detectLanguage } from '../epub/languageDetector';

export type SubtitleFormat = 'srt' | 'vtt';

export interface SubtitleCue {
  index: number;
  start: string;
  end: string;
  /** Cue start in milliseconds, parsed from `start`. */
  startMs: number;
  /** Cue end in milliseconds, parsed from `end`. */
  endMs: number;
  /** Cue text with formatting tags removed; multiple lines keep their breaks. */
  text: string;
  /** Translation attached from a second subtitle file, if any. */
  translation?: string;
}

const TIMESTAMP =
  /((?:\d+:)?\d{2}:\d{2}[,.]\d{3})\s*-->\s*((?:\d+:)?\d{2}:\d{2}[,.]\d{3})/;

const IGNORED_BLOCKS = /^(?:WEBVTT|NOTE|STYLE|REGION)\b/i;

/**
 * Read a subtitle timestamp. SRT uses `HH:MM:SS,mmm`; VTT also allows
 * `MM:SS.mmm`. Returns NaN for anything else so callers can skip the cue.
 */
export function parseTimestamp(value: string): number {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})$/.exec(value.trim());
  if (!match) return Number.NaN;

  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4]);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/** Drop ASS overrides (`{\an8}`) and inline markup (`<i>`, `<c.foo>`). */
export function stripSubtitleTags(text: string): string {
  return decodeEntities(
    text
      .replace(/\{[^}]*\}/g, '')
      .replace(/<[^>]+>/g, '')
  ).trim();
}

function parseCues(raw: string): SubtitleCue[] {
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const blocks = normalized.split(/\n\s*\n+/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    const first = lines[0]?.trim() ?? '';
    if (!first || IGNORED_BLOCKS.test(first)) continue;

    const timingIndex = lines.findIndex((line) => TIMESTAMP.test(line));
    if (timingIndex < 0) continue;

    const match = TIMESTAMP.exec(lines[timingIndex]);
    if (!match) continue;

    const text = stripSubtitleTags(
      lines
        .slice(timingIndex + 1)
        .join('\n')
    );
    if (!text) continue;

    const startMs = parseTimestamp(match[1]);
    const endMs = parseTimestamp(match[2]);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;

    cues.push({
      index: cues.length,
      start: match[1],
      end: match[2],
      startMs,
      endMs,
      text,
    });
  }

  // The timeline lookup walks by start time, so file order cannot be trusted.
  return cues
    .sort((a, b) => a.startMs - b.startMs || a.index - b.index)
    .map((cue, index) => ({ ...cue, index }));
}

export function parseSrt(text: string): SubtitleCue[] {
  return parseCues(text);
}

export function parseVtt(text: string): SubtitleCue[] {
  return parseCues(text);
}

/** Join consecutive same-language lines, keeping speaker turns separate. */
function cueSegments(text: string): string[] {
  const lines = text
    .split('\n')
    .map((line) => stripSubtitleTags(line))
    .filter(Boolean);

  const segments: string[] = [];
  for (const line of lines) {
    const last = segments[segments.length - 1];
    const language = detectLanguage(line);
    if (
      last &&
      language !== 'unknown' &&
      !line.startsWith('- ') &&
      !last.startsWith('- ') &&
      detectLanguage(last) === language
    ) {
      segments[segments.length - 1] = last + line;
    } else {
      segments.push(line);
    }
  }
  return segments;
}

/**
 * Turn cues into sentence pairs. A Japanese cue wrapped over several physical
 * lines becomes one sentence, while bilingual cues and adjacent JA/ZH cues
 * pair up through the same detector the text importer uses. A Japanese-only
 * file keeps its Chinese empty so the reader can translate it later.
 */
export function cuesToPairs(
  cues: readonly SubtitleCue[],
  chapterIndex = 0
): SentencePair[] {
  const lines = cues
    .flatMap((cue) => cueSegments(cue.text))
    .map((text) => ({ text }));

  if (lines.length === 0) return [];
  return buildPairs(lines, chapterIndex);
}

interface CueLanguages {
  japanese: string;
  chinese: string;
}

function cueLanguages(cue: SubtitleCue): CueLanguages {
  if (cue.translation) {
    return {
      japanese: cue.text.replace(/\s*\n\s*/g, ''),
      chinese: cue.translation,
    };
  }

  const lines = cue.text
    .split('\n')
    .map((line) => stripSubtitleTags(line))
    .filter(Boolean);

  let japanese = '';
  let chinese = '';

  for (const line of lines) {
    const language = detectLanguage(line);
    if (language === 'zh') chinese += line;
    // Unknown lines inside a Japanese material are kana-less Japanese
    // (numbers, punctuation) and belong with the source, not the gloss.
    else japanese += line;
  }

  return { japanese, chinese };
}

/**
 * Turn cues into timed pairs without splitting a cue into multiple sentences.
 *
 * A bilingual cue pairs its two languages internally. A Japanese-only cue
 * followed by a Chinese-only cue within 500 ms merges into one pair, which is
 * how two files exported separately usually line up. Orphan Chinese lines and
 * consecutive duplicate auto-caption lines are dropped or folded so the
 * timeline stays one pair per spoken sentence.
 */
export function cuesToTimedPairs(
  cues: readonly SubtitleCue[],
  chapterIndex = 0
): SentencePair[] {
  const pairs: SentencePair[] = [];

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const { japanese, chinese } = cueLanguages(cue);

    if (!japanese) {
      // A Chinese-only cue directly after a Japanese pair is that pair's
      // translation. Anything else is an orphan.
      const previous = pairs[pairs.length - 1];
      if (
        chinese &&
        previous &&
        !previous.chinese &&
        cue.startMs <= (previous.endMs ?? 0) + 500
      ) {
        previous.chinese = chinese;
        previous.translationSource = 'imported';
        previous.endMs = Math.max(previous.endMs ?? 0, cue.endMs);
      }
      continue;
    }

    let chineseText = chinese;
    let endMs = cue.endMs;

    if (!chineseText) {
      const next = cues[i + 1];
      const nextLanguages = next ? cueLanguages(next) : null;
      if (
        next &&
        nextLanguages &&
        !nextLanguages.japanese &&
        nextLanguages.chinese &&
        next.startMs <= cue.endMs + 500
      ) {
        chineseText = nextLanguages.chinese;
        endMs = next.endMs;
        i++;
      }
    }

    const previous = pairs[pairs.length - 1];
    if (
      previous &&
      previous.japanese === japanese &&
      previous.chinese === chineseText &&
      cue.startMs <= (previous.endMs ?? 0) + 500
    ) {
      previous.endMs = Math.max(previous.endMs ?? 0, endMs);
      continue;
    }

    pairs.push({
      id: `timed-${chapterIndex}-${pairs.length}`,
      japanese,
      chinese: chineseText,
      translationSource: chineseText ? 'imported' : undefined,
      chapterIndex,
      pairIndex: pairs.length,
      startMs: cue.startMs,
      endMs,
    });
  }

  return pairs;
}

/**
 * Attach a second, Chinese-only subtitle file to Japanese cues by time
 * overlap. Multiple Chinese cues that overlap the same Japanese cue are
 * concatenated in file order.
 */
export function mergeTranslatedCues(
  japanese: readonly SubtitleCue[],
  chinese: readonly SubtitleCue[]
): SubtitleCue[] {
  return japanese.map((cue) => {
    const overlaps = chinese
      .filter((item) => item.startMs < cue.endMs && item.endMs > cue.startMs)
      .sort((a, b) => a.startMs - b.startMs);

    if (overlaps.length === 0) return cue;

    const translated = overlaps
      .map((item) => item.text.replace(/\s*\n\s*/g, ''))
      .join('');

    return { ...cue, translation: translated };
  });
}

export function buildSubtitleBook(input: {
  title: string;
  text: string;
  format: SubtitleFormat;
}): Book {
  const cues =
    input.format === 'vtt' ? parseVtt(input.text) : parseSrt(input.text);
  const pairs = cuesToPairs(cues);

  if (pairs.length === 0) {
    throw new Error('字幕里没有可用的句子。');
  }

  const bookId = createBookId();
  const title = input.title.trim() || '字幕';

  return {
    id: bookId,
    title,
    author: '字幕',
    importedAt: Date.now(),
    source: { kind: 'subtitle' },
    chapters: [
      {
        id: `${bookId}-ch0`,
        title,
        index: 0,
        pairs: pairs.map((pair, pairIndex) => ({
          ...pair,
          id: createPairId(bookId, 0, pair.pairIndex),
          chapterIndex: 0,
          pairIndex,
        })),
      },
    ],
  };
}
