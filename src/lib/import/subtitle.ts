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
  /** Cue text with formatting tags removed; multiple lines keep their breaks. */
  text: string;
}

const TIMESTAMP =
  /((?:\d{2}:)?\d{2}:\d{2}[,.]\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}[,.]\d{3})/;

const IGNORED_BLOCKS = /^(?:WEBVTT|NOTE|STYLE|REGION)\b/i;

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

    cues.push({
      index: cues.length,
      start: match[1],
      end: match[2],
      text,
    });
  }

  return cues;
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
