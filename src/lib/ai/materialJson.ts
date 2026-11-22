export type MaterialLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
export type MaterialFormat = 'dialogue' | 'prose';
export type MaterialLength = 'short' | 'medium' | 'long';

export interface MaterialLine {
  speaker?: string;
  japanese: string;
  chinese: string;
}

export interface MaterialNote {
  word: string;
  reading: string;
  meaning: string;
}

export interface GeneratedMaterial {
  title: string;
  level: MaterialLevel;
  format: MaterialFormat;
  lines: MaterialLine[];
  notes: MaterialNote[];
}

export type MaterialValidation =
  | { ok: true; material: GeneratedMaterial }
  | { ok: false; error: string };

export const MATERIAL_LEVELS: MaterialLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];
export const MAX_MATERIAL_LINES = 20;
export const MATERIAL_ERROR = 'AI 返回的材料格式不正确，请重试。';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLevel(value: unknown): MaterialLevel {
  const raw = textOf(value).toUpperCase();
  return (MATERIAL_LEVELS as string[]).includes(raw)
    ? (raw as MaterialLevel)
    : 'N3';
}

function normalizeFormat(value: unknown): MaterialFormat {
  return value === 'prose' ? 'prose' : 'dialogue';
}

/**
 * Validate the model's material object. Individual lines missing either
 * language are dropped; a material with no lines left is an error the preview
 * can show, not an empty book.
 */
export function validateMaterial(input: unknown): MaterialValidation {
  const record = asRecord(input);
  if (!record) return { ok: false, error: MATERIAL_ERROR };

  const title = textOf(record.title).slice(0, 120);
  if (!title) return { ok: false, error: MATERIAL_ERROR };

  if (!Array.isArray(record.lines)) {
    return { ok: false, error: MATERIAL_ERROR };
  }

  const lines: MaterialLine[] = [];
  for (const raw of record.lines) {
    const line = asRecord(raw);
    if (!line) continue;
    const japanese = textOf(line.japanese);
    const chinese = textOf(line.chinese);
    if (!japanese || !chinese) continue;

    const speaker = textOf(line.speaker);
    lines.push({
      japanese,
      chinese,
      ...(speaker ? { speaker } : {}),
    });
  }

  if (lines.length === 0) return { ok: false, error: MATERIAL_ERROR };

  const notes: MaterialNote[] = [];
  if (Array.isArray(record.notes)) {
    for (const raw of record.notes) {
      const note = asRecord(raw);
      if (!note) continue;
      const word = textOf(note.word);
      if (!word) continue;
      notes.push({
        word,
        reading: textOf(note.reading),
        meaning: textOf(note.meaning),
      });
    }
  }

  return {
    ok: true,
    material: {
      title,
      level: normalizeLevel(record.level),
      format: normalizeFormat(record.format),
      lines: lines.slice(0, MAX_MATERIAL_LINES),
      notes: notes.slice(0, 8),
    },
  };
}

function stripFences(raw: string): string {
  return raw.replace(/```(?:json)?/gi, '').trim();
}

/** Return the first balanced JSON object in a model response. */
function extractBalancedObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaping) escaping = false;
      else if (char === '\\') escaping = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

/** Parse a model response into a validated material, fences and prose included. */
export function parseMaterialJson(raw: string): MaterialValidation {
  const stripped = stripFences(raw);
  if (!stripped) return { ok: false, error: MATERIAL_ERROR };

  const balanced = extractBalancedObject(stripped);
  const candidates = [stripped, balanced ?? ''].filter(Boolean);

  for (const candidate of candidates) {
    for (const text of [candidate, candidate.replace(/,\s*([\]}])/g, '$1')]) {
      try {
        return validateMaterial(JSON.parse(text));
      } catch {
        // Try the next candidate.
      }
    }
  }

  return { ok: false, error: MATERIAL_ERROR };
}
