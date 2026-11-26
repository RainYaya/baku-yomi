/**
 * Minimal client for the OpenAI-compatible speech endpoint exposed by
 * VoiceStudio (and by `mock-tts.ts` during development).
 */

export interface SpeechOptions {
  baseUrl: string;
  apiKey?: string;
  /** VoiceStudio's per-session share PIN, when it is exposed to the LAN. */
  pin?: string;
  model: string;
  voice: string;
  text: string;
  /** Total attempts, including the first one. */
  attempts?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorSnippet(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, ' ');
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

class PermanentTtsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentTtsError';
  }
}

/**
 * Synthesize one chunk of text and return the WAV bytes. Network errors, 429
 * and 5xx responses are retried with exponential backoff; every other status
 * fails immediately with the provider's message.
 */
export async function synthesizeSpeech(options: SpeechOptions): Promise<Buffer> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const attempts = Math.max(1, options.attempts ?? 3);
  const url = `${options.baseUrl.replace(/\/+$/, '')}/v1/audio/speech`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.apiKey) headers.Authorization = `Bearer ${options.apiKey}`;
  if (options.pin) headers['X-OmniVoice-Pin'] = options.pin;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: options.model,
          voice: options.voice,
          input: options.text,
          response_format: 'wav',
        }),
      });

      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length === 0) throw new Error('TTS returned an empty audio response');
        return bytes;
      }

      const body = await response.text().catch(() => '');
      const detail = errorSnippet(body);
      const message = `TTS request failed (HTTP ${response.status})${detail ? `: ${detail}` : ''}`;
      if (!isRetryable(response.status)) throw new PermanentTtsError(message);
      lastError = new Error(message);
    } catch (error) {
      if (error instanceof PermanentTtsError) throw error;
      lastError =
        error instanceof Error
          ? new Error(`TTS request failed: ${error.message}`)
          : new Error(`TTS request failed: ${String(error)}`);
    }

    if (attempt < attempts) {
      await sleep(300 * 2 ** (attempt - 1));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('TTS request failed after retries');
}
