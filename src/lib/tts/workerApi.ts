import type { Book } from '../../types';

/**
 * The app server proxies these calls to the LAN worker. The browser stays
 * same-origin; nothing here knows the worker's address.
 */
export type TtsJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface TtsJob {
  id: string;
  audioId: string;
  bookId: string;
  title: string;
  author?: string;
  model: string;
  voice: string;
  status: TtsJobStatus;
  chaptersTotal: number;
  chaptersDone: number;
  pairsTotal: number;
  pairsDone: number;
  currentChapterTitle?: string;
  error?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  files?: string[];
}

export interface TtsStatus {
  available: boolean;
  model?: string;
  voice?: string;
}

export interface TtsConfig {
  model: string;
  voice: string;
  bitrate?: string;
  /** Advertised by the speech server; empty when it cannot list them. */
  models: string[];
  voices: string[];
}

export interface CreateTtsJobOptions {
  model: string;
  voice: string;
  bitrate?: string;
}

const INVALID_ID = /[^a-z0-9]+/g;

/** Mirrors the worker/server asset id rule. */
export function toAudioId(bookId: string): string {
  const sanitized = bookId
    .toLowerCase()
    .replace(INVALID_ID, '-')
    .replace(/^-+|-+$/g, '');
  return `tts-${sanitized || 'book'}`;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

const STATUSES: ReadonlySet<string> = new Set<TtsJobStatus>([
  'queued',
  'running',
  'done',
  'failed',
  'cancelled',
]);

function isJob(value: unknown): value is TtsJob {
  if (typeof value !== 'object' || value === null) return false;
  const job = value as Partial<TtsJob>;
  // The dialog looks its labels up by status and decides what to poll from it;
  // an unknown status would leave the row blank and poll forever.
  return (
    typeof job.id === 'string' &&
    typeof job.audioId === 'string' &&
    typeof job.status === 'string' &&
    STATUSES.has(job.status) &&
    typeof job.createdAt === 'number'
  );
}

function readJob(body: unknown): TtsJob | null {
  if (typeof body !== 'object' || body === null) return null;
  const job = (body as { job?: unknown }).job;
  return isJob(job) ? job : null;
}

async function getJson(
  path: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
  accept: (status: number) => boolean = (status) => status >= 200 && status < 300
): Promise<unknown | null> {
  try {
    const response = await fetcher(path, { cache: 'no-store', ...init });
    if (!accept(response.status)) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export async function fetchTtsStatus(
  fetcher: typeof fetch = fetch
): Promise<TtsStatus> {
  const body = await getJson('/api/tts/status', {}, fetcher);
  if (typeof body !== 'object' || body === null) return { available: false };
  const raw = body as Record<string, unknown>;
  if (raw.available !== true) return { available: false };
  return {
    available: true,
    model: text(raw.model) || undefined,
    voice: text(raw.voice) || undefined,
  };
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export async function fetchTtsConfig(
  fetcher: typeof fetch = fetch
): Promise<TtsConfig | null> {
  const body = await getJson('/api/tts/config', {}, fetcher);
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as Record<string, unknown>;
  const model = text(raw.model);
  const voice = text(raw.voice);
  if (!model || !voice) return null;
  return {
    model,
    voice,
    bitrate: text(raw.bitrate) || undefined,
    models: strings(raw.models),
    voices: strings(raw.voices),
  };
}

export async function createTtsJob(
  book: Book,
  options: CreateTtsJobOptions,
  fetcher: typeof fetch = fetch
): Promise<TtsJob | null> {
  const body = await getJson(
    '/api/tts/jobs',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        book,
        model: options.model,
        voice: options.voice,
        bitrate: options.bitrate,
      }),
    },
    fetcher,
    // 409 means this book is already being generated; adopt that job rather
    // than queueing a second one over the same audio files.
    (status) => (status >= 200 && status < 300) || status === 409
  );
  return readJob(body);
}

/** Every job the worker still remembers, newest last. */
export async function fetchTtsJobs(
  fetcher: typeof fetch = fetch
): Promise<TtsJob[]> {
  const body = await getJson('/api/tts/jobs', {}, fetcher);
  if (typeof body !== 'object' || body === null) return [];
  const raw = (body as { jobs?: unknown }).jobs;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isJob);
}

/** The queued or running job for one asset; the newest one wins. */
export function pickActiveJob(
  jobs: readonly TtsJob[],
  audioId: string
): TtsJob | null {
  let newest: TtsJob | null = null;
  for (const job of jobs) {
    if (job.audioId !== audioId) continue;
    if (job.status !== 'queued' && job.status !== 'running') continue;
    if (!newest || job.createdAt > newest.createdAt) newest = job;
  }
  return newest;
}

/** The newest job for one asset, whatever its status. */
export function pickLatestJob(
  jobs: readonly TtsJob[],
  audioId: string
): TtsJob | null {
  let newest: TtsJob | null = null;
  for (const job of jobs) {
    if (job.audioId !== audioId) continue;
    if (!newest || job.createdAt > newest.createdAt) newest = job;
  }
  return newest;
}

export async function fetchTtsJob(
  id: string,
  fetcher: typeof fetch = fetch
): Promise<TtsJob | null> {
  const body = await getJson(
    `/api/tts/jobs/${encodeURIComponent(id)}`,
    {},
    fetcher
  );
  return readJob(body);
}

export async function cancelTtsJob(
  id: string,
  fetcher: typeof fetch = fetch
): Promise<TtsJob | null> {
  const body = await getJson(
    `/api/tts/jobs/${encodeURIComponent(id)}/cancel`,
    { method: 'POST' },
    fetcher
  );
  return readJob(body);
}

/** Exposed for the dialog's snapshots; `number` keeps tests honest. */
export const jobProgress = (job: TtsJob): number => {
  if (job.pairsTotal <= 0) return job.status === 'done' ? 100 : 0;
  return Math.min(100, Math.round((number(job.pairsDone) / job.pairsTotal) * 100));
};
