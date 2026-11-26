/**
 * Best-effort list of the models and voices the speech server advertises.
 *
 * Nothing depends on it: a server that only implements `/v1/audio/speech`
 * answers 404 here and the dialog falls back to free-text fields. The list
 * exists so the common case is a dropdown instead of typing names.
 */

export interface SpeechCatalog {
  models: string[];
  voices: string[];
}

/**
 * VoiceStudio takes about two seconds to answer each list request, so a short
 * budget silently produced empty dropdowns. Ten seconds still fails fast when
 * the server is gone.
 */
const TIMEOUT_MS = 10_000;

export interface CatalogOptions {
  baseUrl: string;
  apiKey?: string;
  /** VoiceStudio's per-session share PIN, when it is exposed to the LAN. */
  pin?: string;
  fetcher?: typeof fetch;
  /** Overrides the request budget; tests use a short one. */
  timeoutMs?: number;
}

/** TTS servers disagree on the list name and the id key. */
function itemsOf(body: unknown, listName: string): unknown[] {
  if (typeof body !== 'object' || body === null) return [];
  const raw = body as Record<string, unknown>;
  for (const key of ['data', listName]) {
    if (Array.isArray(raw[key])) return raw[key] as unknown[];
  }
  return [];
}

function idsOf(body: unknown, listName: string): string[] {
  const ids: string[] = [];
  for (const item of itemsOf(body, listName)) {
    if (typeof item === 'string') {
      ids.push(item);
      continue;
    }
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as { id?: unknown; voice_id?: unknown; voicestudio?: unknown };
    // VoiceStudio tags its models; anything tagged with another kind (speech
    // to text, say) cannot narrate a book.
    const meta = entry.voicestudio as { kind?: unknown } | undefined;
    if (typeof meta?.kind === 'string' && meta.kind !== 'tts') continue;
    const id = typeof entry.id === 'string' ? entry.id : entry.voice_id;
    if (typeof id === 'string') ids.push(id);
  }
  return ids;
}

async function readList(
  options: CatalogOptions,
  path: string,
  listName: string
): Promise<string[]> {
  const fetcher = options.fetcher ?? fetch;
  const headers: Record<string, string> = {};
  if (options.apiKey) headers.Authorization = `Bearer ${options.apiKey}`;
  if (options.pin) headers['X-OmniVoice-Pin'] = options.pin;

  try {
    const response = await fetcher(
      `${options.baseUrl.replace(/\/+$/, '')}${path}`,
      { headers, signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS) }
    );
    if (!response.ok) return [];
    return idsOf(await response.json(), listName);
  } catch {
    return [];
  }
}

export async function readCatalog(
  options: CatalogOptions
): Promise<SpeechCatalog> {
  const [models, voices] = await Promise.all([
    readList(options, '/v1/models', 'data'),
    readList(options, '/v1/audio/voices', 'voices'),
  ]);
  return { models, voices };
}
