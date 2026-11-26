import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Book } from '../src/types/book';
import { toAudioId } from './audioId';
import { CancelledError } from './cancelled';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface TtsJob {
  id: string;
  audioId: string;
  bookId: string;
  title: string;
  author?: string;
  model: string;
  voice: string;
  status: JobStatus;
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

export interface JobInput {
  book: Book;
  model: string;
  voice: string;
  bitrate: string;
}

export interface JobProgress {
  chaptersDone?: number;
  pairsDone?: number;
  currentChapterTitle?: string;
}

export interface JobHooks {
  updateProgress: (progress: JobProgress) => void;
  isCancelled: () => boolean;
}

export type JobRunner = (
  input: JobInput & { audioId: string },
  job: TtsJob,
  hooks: JobHooks
) => Promise<{ files?: string[] }>;

export interface JobManagerOptions {
  workdir: string;
  run: JobRunner;
  now?: () => number;
}

export interface JobManager {
  enqueue: (input: JobInput) => Promise<TtsJob>;
  list: () => TtsJob[];
  get: (id: string) => TtsJob | undefined;
  /** The queued or running job for this asset, if one exists. */
  findActive: (audioId: string) => TtsJob | undefined;
  cancel: (id: string) => Promise<TtsJob | null>;
  /** Resolves once nothing is queued or running. */
  whenIdle: () => Promise<void>;
}

const TERMINAL: ReadonlySet<JobStatus> = new Set(['done', 'failed', 'cancelled']);
const MAX_JOBS = 50;

/** Recent history only: the browser lists every job on every dialog open. */
function trimHistory(jobs: TtsJob[]): void {
  if (jobs.length <= MAX_JOBS) return;
  jobs.splice(0, jobs.length - MAX_JOBS);
}

function isTerminal(status: JobStatus): boolean {
  return TERMINAL.has(status);
}

function countPairs(book: Book): number {
  return book.chapters.reduce((total, chapter) => total + chapter.pairs.length, 0);
}

function createJobId(now: number): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `job-${now}-${random}`;
}

function parseJobs(text: string): TtsJob[] {
  try {
    const raw: unknown = JSON.parse(text);
    if (!Array.isArray(raw)) return [];
    return raw.filter((job): job is TtsJob =>
      typeof job === 'object' &&
      job !== null &&
      typeof (job as { id?: unknown }).id === 'string'
    );
  } catch {
    return [];
  }
}

export async function createJobManager(
  options: JobManagerOptions
): Promise<JobManager> {
  const now = options.now ?? Date.now;
  const jobsPath = join(options.workdir, 'jobs.json');

  await mkdir(options.workdir, { recursive: true });

  let jobs: TtsJob[] = [];
  try {
    jobs = parseJobs(await readFile(jobsPath, 'utf8'));
  } catch {
    jobs = [];
  }

  // Interrupted jobs cannot be resumed without their book payload, so show
  // them as failed instead of leaving a stale `running` row forever.
  for (const job of jobs) {
    if (job.status === 'queued' || job.status === 'running') {
      job.status = 'failed';
      job.error = 'worker restarted';
      job.finishedAt = now();
    }
  }
  trimHistory(jobs);

  const queue: string[] = [];
  const inputs = new Map<string, JobInput>();
  let running: string | null = null;
  let idleResolvers: Array<() => void> = [];
  let writeQueue: Promise<void> = Promise.resolve();

  function persist(): Promise<void> {
    const write = writeQueue.then(async () => {
      // The directory can disappear under a running worker (a cleanup, a
      // removed temp root). Recreate it instead of failing every later job.
      await mkdir(options.workdir, { recursive: true });
      const temp = `${jobsPath}.tmp`;
      await writeFile(temp, JSON.stringify(jobs, null, 2), 'utf8');
      await rename(temp, jobsPath);
    });
    // Keep the chain usable after a failed write.
    writeQueue = write.catch(() => undefined);
    return write;
  }

  function find(id: string): TtsJob | undefined {
    return jobs.find((job) => job.id === id);
  }

  function resolveIdle(): void {
    if (running || queue.length > 0) return;
    const resolvers = idleResolvers;
    idleResolvers = [];
    for (const resolve of resolvers) resolve();
  }

  async function pump(): Promise<void> {
    if (running) return;

    const id = queue.shift();
    if (!id) {
      resolveIdle();
      return;
    }

    const job = find(id);
    if (!job || job.status !== 'queued') {
      void pump();
      return;
    }

    const input = inputs.get(id);
    if (!input) {
      job.status = 'failed';
      job.error = 'job payload missing';
      job.finishedAt = now();
      await persist();
      void pump();
      return;
    }

    running = id;
    job.status = 'running';
    job.startedAt = now();
    await persist();

    const hooks: JobHooks = {
      updateProgress: (progress) => {
        if (job.status !== 'running') return;
        if (progress.chaptersDone !== undefined) job.chaptersDone = progress.chaptersDone;
        if (progress.pairsDone !== undefined) job.pairsDone = progress.pairsDone;
        if (progress.currentChapterTitle !== undefined) {
          job.currentChapterTitle = progress.currentChapterTitle;
        }
      },
      isCancelled: () => job.status === 'cancelled',
    };

    try {
      const result = await options.run(
        { ...input, audioId: toAudioId(input.book.id) },
        job,
        hooks
      );
      if (job.status === 'running') {
        job.status = 'done';
        job.finishedAt = now();
        job.files = result.files ?? [];
      } else if (job.status === 'cancelled') {
        job.finishedAt ??= now();
      }
    } catch (error) {
      // Cancel runs from an HTTP handler while the runner is awaiting, so the
      // compiler's narrowing of `job.status` from the line above is stale.
      const status = job.status as JobStatus;
      if (status === 'cancelled' || error instanceof CancelledError) {
        job.status = 'cancelled';
      } else {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : String(error);
      }
      job.finishedAt ??= now();
    } finally {
      inputs.delete(id);
      running = null;
      await persist();
      void pump();
    }
  }

  // Persist the repaired statuses before accepting work.
  await persist();

  return {
    enqueue: async (input) => {
      const created = now();
      const audioId = toAudioId(input.book.id);
      const job: TtsJob = {
        id: createJobId(created),
        audioId,
        bookId: input.book.id,
        title: input.book.title,
        author: input.book.author || undefined,
        model: input.model,
        voice: input.voice,
        status: 'queued',
        chaptersTotal: input.book.chapters.length,
        chaptersDone: 0,
        pairsTotal: countPairs(input.book),
        pairsDone: 0,
        createdAt: created,
      };

      jobs.push(job);
      trimHistory(jobs);
      inputs.set(job.id, input);
      queue.push(job.id);
      await persist();
      // Snapshot before the pump flips the live object to `running`, so the
      // POST response describes the job as the user just created it.
      const snapshot = { ...job };
      void pump();
      return snapshot;
    },

    list: () => jobs,

    get: find,

    findActive: (audioId) =>
      jobs.find((job) => job.audioId === audioId && !isTerminal(job.status)),

    cancel: async (id) => {
      const job = find(id);
      if (!job || isTerminal(job.status)) return job ?? null;

      job.status = 'cancelled';
      job.finishedAt = now();
      await persist();
      return job;
    },

    whenIdle: () => {
      if (!running && queue.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        idleResolvers.push(resolve);
      });
    },
  };
}
