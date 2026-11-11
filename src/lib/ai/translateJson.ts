export interface TranslationResult {
  id: string;
  chinese: string;
}

function stripFences(raw: string): string {
  return raw.replace(/```(?:json)?/gi, '').trim();
}

/** Return the first balanced JSON array/object in a model response. */
function extractBalanced(text: string): string | null {
  const start = text.search(/[[{]/);
  if (start < 0) return null;

  const open = text[start];
  const close = open === '[' ? ']' : '}';
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

    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

function normalizeItems(parsed: unknown): TranslationResult[] {
  let list: unknown[] = [];

  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.translations)) list = record.translations;
    else if (Array.isArray(record.items)) list = record.items;
    else if (Array.isArray(record.results)) list = record.results;
    else if (typeof record.id === 'string') list = [record];
    else {
      const nested = Object.values(record).find(
        (value): value is unknown[] =>
          Array.isArray(value) &&
          value.some((item) => item !== null && typeof item === 'object')
      );
      if (nested) {
        list = nested;
      } else {
        const entries = Object.entries(record);
        if (entries.every(([, value]) => typeof value === 'string')) {
          list = entries.map(([id, chinese]) => ({ id, chinese: chinese as string }));
        }
      }
    }
  }

  const byId = new Map<string, string>();

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id =
      typeof record.id === 'string'
        ? record.id
        : typeof record.pairId === 'string'
          ? record.pairId
          : null;
    const chinese =
      typeof record.chinese === 'string'
        ? record.chinese
        : typeof record.translation === 'string'
          ? record.translation
          : typeof record.text === 'string'
            ? record.text
            : null;

    if (!id || !chinese || !chinese.trim()) continue;
    const key = id.trim();
    if (!byId.has(key)) byId.set(key, chinese.trim());
  }

  return [...byId].map(([id, chinese]) => ({ id, chinese }));
}

function tryParse(candidate: string): TranslationResult[] {
  if (!candidate.trim()) return [];

  for (const text of [
    candidate,
    candidate.replace(/,\s*([\]}])/g, '$1'),
  ]) {
    try {
      const parsed: unknown = JSON.parse(text);
      const normalized = normalizeItems(parsed);
      if (normalized.length > 0) return normalized;
    } catch {
      // Try the next candidate.
    }
  }

  return [];
}

export function parseTranslationResponse(raw: string): TranslationResult[] {
  const stripped = stripFences(raw);
  const balanced = extractBalanced(stripped);

  const candidates = [stripped, balanced ?? ''];
  for (const candidate of candidates) {
    const result = tryParse(candidate);
    if (result.length > 0) return result;
  }

  return [];
}
