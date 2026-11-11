/**
 * Anchoring: map a model-authored table of syntactic units back onto exact
 * character offsets in the source sentence.
 *
 * Why this is not just `indexOf`: a model asked to quote fragments will
 * happily invent one, reorder two, or hand back `he` when the sentence only
 * contains `the`. Rendering those in place would silently teach the wrong
 * thing — the highlight would sit on a word that is not the unit being
 * described. So every row must satisfy:
 *
 *   - the fragment exists in the sentence, at or after the previous row's end
 *     (source order, no overlaps, duplicates consumed left to right)
 *   - it does not start or end in the middle of a word
 *
 * One bad row invalidates the whole table. A partially anchored table reads as
 * authoritative while quietly describing the wrong span, which is worse than
 * no table at all — the caller falls back to prose only.
 */
import type { SentenceUnit } from '../../types';

/**
 * Characters that make a fragment boundary "inside a word".
 *
 * Deliberately *not* `\p{L}`: Japanese has no spaces, so every character in a
 * sentence is a letter and a `\p{L}`-based rule rejects every boundary —
 * 「彼」 followed by 「は」 would count as cutting a word in half. The rule is
 * only meaningful for scripts that separate words with whitespace, which is
 * exactly the Latin/number case it is meant to catch.
 */
const WORD_CHAR = /[A-Za-z0-9_]/u;

const MAX_SENTENCE_LENGTH = 4096;
const MAX_UNITS = 40;
const MAX_CELL_LENGTH = 400;

/**
 * Table headers we accept, in the order the prompt asks for them. The first
 * entry of each pair is the canonical English header, the rest are tolerated
 * translations so a model answering in Japanese or Chinese still lands.
 */
const COLUMNS: ReadonlyArray<ReadonlyArray<string>> = [
  ['text', '原文', '原文片段', '文節', '片段'],
  ['pos', '词性', '詞性', '品詞', '词类'],
  ['role', '句中作用', '作用', '成分', '文の成分', '役割'],
  ['meaning', '含义', '意思', '意味', '释义'],
];

/** Strip the markdown emphasis a model likes to wrap cell contents in. */
function plain(value: string): string {
  return value
    .trim()
    .replace(/^[*`_\s]+/u, '')
    .replace(/[*`_\s]+$/u, '');
}

function normalizeHeader(cell: string): string {
  return plain(cell).toLowerCase().replace(/\s+/gu, '');
}

/** Split a markdown table row into cells, honouring escaped pipes. */
function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/u, '').replace(/\|$/u, '');
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    // A backslash escapes the following pipe, so it must not split the cell.
    const isEscapedPipe = char.charCodeAt(0) === 92 && trimmed[i + 1] === '|';
    if (isEscapedPipe) {
      current += '|';
      i += 1;
      continue;
    }
    if (char === '|') {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

const isSeparatorRow = (cells: string[]): boolean =>
  cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/u.test(cell.replace(/\s/gu, '')));

interface ParsedTable {
  headers: string[];
  rows: string[][];
  /** Line index range in the source markdown, so the caller can strip it. */
  startLine: number;
  endLine: number;
}

/** Find the first markdown table whose header matches the expected columns. */
export function findUnitTable(markdown: string): ParsedTable | null {
  const lines = markdown.split('\n');

  for (let i = 0; i < lines.length - 1; i += 1) {
    if (!lines[i].includes('|') || !lines[i + 1].includes('|')) continue;

    const headers = splitRow(lines[i]);
    if (headers.length !== COLUMNS.length) continue;

    const matched = headers.every((header, index) =>
      COLUMNS[index].includes(normalizeHeader(header))
    );
    if (!matched) continue;

    // The row under the header must be the `|---|---|` separator.
    if (!isSeparatorRow(splitRow(lines[i + 1]))) continue;

    const rows: string[][] = [];
    let end = i + 1;
    for (let j = i + 2; j < lines.length; j += 1) {
      if (!lines[j].includes('|') || !lines[j].trim()) break;
      rows.push(splitRow(lines[j]));
      end = j;
    }

    return { headers, rows, startLine: i, endLine: end };
  }

  return null;
}

export interface AnchorResult {
  units: SentenceUnit[];
  /** Rows that could not be placed, kept so the UI can be honest about it. */
  dropped: number;
  /** True when a table existed but produced no usable rows. */
  rejected: boolean;
}

/**
 * Anchor table rows onto `sentence`.
 *
 * A strict all-or-nothing rule was the first design here, on the theory that
 * a partially anchored table reads as authoritative while describing the
 * wrong span. Probing the actual model showed that is too brittle: asked to
 * break down 「読みながら」 it will emit both 「読みながら」 *and* 「ながら」,
 * which overlap by construction, and one such row killed the whole table.
 *
 * So rows are now placed individually and bad rows are dropped:
 *
 *   - a row whose fragment is not in the sentence, or would cut a word in
 *     half, is skipped
 *   - a row that overlaps the previously placed unit is skipped (nested
 *     units are a legitimate thing for a grammarian to want, but they cannot
 *     be rendered as non-overlapping highlights, so the outer unit wins)
 *   - source order is still enforced, so the result reads left to right
 *
 * What stays strict: if *nothing* anchors, `rejected` is true and the caller
 * hides the table rather than showing an empty frame. And a table where most
 * rows were dropped is treated as unreliable wholesale, because that pattern
 * means the model was paraphrasing rather than quoting.
 */
const MAX_DROPPED_RATIO = 0.5;

export function anchorUnits(rows: string[][], sentence: string): AnchorResult {
  if (!sentence || sentence.length > MAX_SENTENCE_LENGTH) {
    return { units: [], dropped: rows.length, rejected: rows.length > 0 };
  }
  if (rows.length === 0) return { units: [], dropped: 0, rejected: false };
  if (rows.length > MAX_UNITS) return { units: [], dropped: rows.length, rejected: true };

  const units: SentenceUnit[] = [];
  let dropped = 0;
  let cursor = 0;

  for (const row of rows) {
    if (row.length !== COLUMNS.length) {
      dropped += 1;
      continue;
    }

    const [rawText, rawPos, rawRole, rawMeaning] = row.map(plain);
    if (!rawText || !rawPos || !rawRole || !rawMeaning) {
      dropped += 1;
      continue;
    }
    if (
      rawText.length > MAX_CELL_LENGTH ||
      rawRole.length > MAX_CELL_LENGTH ||
      rawMeaning.length > MAX_CELL_LENGTH
    ) {
      dropped += 1;
      continue;
    }

    // Search from the cursor so rows stay in source order; fall back to a
    // whole-sentence search for a row the model emitted slightly out of order
    // rather than losing it.
    let start = sentence.indexOf(rawText, cursor);
    if (start < 0) start = sentence.indexOf(rawText);
    if (start < 0) {
      dropped += 1;
      continue;
    }
    const end = start + rawText.length;

    // Overlaps the previous unit: keep the outer one.
    if (start < cursor) {
      dropped += 1;
      continue;
    }

    // Do not cut a word in half.
    const before = start > 0 ? sentence[start - 1] : '';
    const after = end < sentence.length ? sentence[end] : '';
    if (before && WORD_CHAR.test(before) && WORD_CHAR.test(rawText[0])) {
      dropped += 1;
      continue;
    }
    if (after && WORD_CHAR.test(after) && WORD_CHAR.test(rawText[rawText.length - 1])) {
      dropped += 1;
      continue;
    }

    units.push({
      text: rawText,
      start,
      end,
      pos: rawPos,
      role: rawRole,
      meaning: rawMeaning,
    });
    cursor = end;
  }

  const total = rows.length;
  const unreliable = total > 0 && dropped / total > MAX_DROPPED_RATIO;

  return {
    units: unreliable ? [] : units,
    dropped,
    rejected: units.length === 0 || unreliable,
  };
}

/**
 * Remove the unit table from the prose so the reader can render it as
 * highlights instead of a second, redundant copy.
 */
export function stripUnitTable(markdown: string, table: ParsedTable | null): string {
  if (!table) return markdown;
  const lines = markdown.split('\n');
  lines.splice(table.startLine, table.endLine - table.startLine + 1);
  return lines
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}
