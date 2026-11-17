import type { VocabFillFields, VocabSynonym } from '../../types';

function stripFences(raw: string): string {
  return raw.replace(/```(?:json)?/gi, '').trim();
}

/** Return the first balanced JSON object in a model response. */
function extractBalanced(text: string): string | null {
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

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseSynonym(value: unknown): VocabSynonym | null {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;
    const match = text.match(/^(.+?)[（(]([^（）()]*)[）)]$/);
    return match
      ? { word: match[1].trim(), nuance: match[2].trim() || undefined }
      : { word: text };
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const word = readString(record.word);
    if (!word) return null;
    return { word, nuance: readString(record.nuance) };
  }

  return null;
}

function parseSynonyms(value: unknown): VocabSynonym[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const synonyms = value
    .map(parseSynonym)
    .filter((synonym): synonym is VocabSynonym => synonym !== null);
  return synonyms.length > 0 ? synonyms : undefined;
}

function normalize(parsed: unknown): VocabFillFields | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const fields: VocabFillFields = {
    reading: readString(record.reading),
    meaning: readString(record.meaning),
    synonyms: parseSynonyms(record.synonyms),
    core: readString(record.core),
    example: readString(record.example),
  };

  const hasField = Object.values(fields).some((value) => value !== undefined);
  return hasField ? fields : null;
}

export function parseVocabResponse(raw: string): VocabFillFields | null {
  const stripped = stripFences(raw);
  if (!stripped) return null;

  const candidates = [stripped, extractBalanced(stripped) ?? ''];
  for (const candidate of candidates) {
    if (!candidate.trim()) continue;
    for (const text of [candidate, candidate.replace(/,\s*([\]}])/g, '$1')]) {
      try {
        const result = normalize(JSON.parse(text));
        if (result) return result;
      } catch {
        // Try the next candidate.
      }
    }
  }

  return null;
}
