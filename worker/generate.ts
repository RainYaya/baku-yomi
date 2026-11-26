import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Book, Chapter, SentencePair } from '../src/types/book';
import { CancelledError } from './cancelled';
import {
  chunkText,
  layoutTimeline,
  pauseAfter,
  type PairTiming,
} from './timeline';
import { synthesizeSpeech } from './tts';

const SAMPLE_RATE = 24000;

export interface GenerateOptions {
  workdir: string;
  book: Book;
  audioId: string;
  baseUrl: string;
  apiKey?: string;
  pin?: string;
  model: string;
  voice: string;
  bitrate: string;
  onProgress?: (progress: {
    chaptersDone: number;
    pairsDone: number;
    currentChapterTitle: string;
  }) => void;
  isCancelled?: () => boolean;
  fetchImpl?: typeof fetch;
}

export interface GeneratedAsset {
  audioId: string;
  dir: string;
  /** Opus files first, `asset.json` last. */
  files: string[];
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}\n${stderr.trim()}`));
    });
  });
}

function probeDurationMs(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nw=1:nk=1',
      path,
    ]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const seconds = Number.parseFloat(stdout.trim());
      if (code !== 0 || !Number.isFinite(seconds)) {
        reject(new Error(`ffprobe cannot read ${path}\n${stderr.trim()}`));
        return;
      }
      resolve(Math.round(seconds * 1000));
    });
  });
}

/** Decode whatever the speech server sent and re-encode as canonical PCM. */
function normalizeToWav(input: Buffer, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-i',
        'pipe:0',
        '-vn',
        '-ac',
        '1',
        '-ar',
        String(SAMPLE_RATE),
        '-c:a',
        'pcm_s16le',
        '-f',
        'wav',
        output,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] }
    );

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg could not read the TTS wav\n${stderr.trim()}`));
    });
    child.stdin.end(input);
  });
}

async function isFile(path: string): Promise<boolean> {
  return stat(path)
    .then((info) => info.isFile())
    .catch(() => false);
}

/** Content hash, so a regenerated chapter never reuses an old file name. */
function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex').slice(0, 8)));
  });
}

function concatLine(path: string): string {
  return `file '${path.replace(/'/g, "'\\''")}'`;
}

function timedPair(pair: SentencePair, timing: PairTiming | undefined): SentencePair {
  const copy = { ...pair };
  delete copy.startMs;
  delete copy.endMs;
  copy.startMs = timing?.startMs ?? 0;
  copy.endMs = timing?.endMs ?? 0;
  return copy;
}

/**
 * Synthesize a whole book into one Opus file per chapter plus `asset.json`.
 *
 * Chunks are cached by model, voice and text, so cancelling and re-running a
 * long book only pays for the sentences that were not finished yet.
 */
export async function generateAsset(
  options: GenerateOptions
): Promise<GeneratedAsset> {
  const cacheDir = join(options.workdir, 'cache');
  const outputDir = join(options.workdir, 'output', options.audioId);
  await mkdir(cacheDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const workDir = await mkdtemp(join(tmpdir(), 'baku-tts-'));
  try {
    const durationCache = new Map<string, number>();
    let tempCounter = 0;

    const cancelled = () => options.isCancelled?.() === true;

    async function ensureChunk(text: string): Promise<{ path: string; durationMs: number }> {
      const key = createHash('sha1')
        .update(`${options.model}|${options.voice}|${text}`)
        .digest('hex');
      const path = join(cacheDir, `${key}.wav`);

      if (!(await isFile(path))) {
        const audio = await synthesizeSpeech({
          baseUrl: options.baseUrl,
          apiKey: options.apiKey,
          pin: options.pin,
          model: options.model,
          voice: options.voice,
          text,
          fetchImpl: options.fetchImpl,
        });
        const temp = join(cacheDir, `${key}.tmp-${process.pid}-${tempCounter++}`);
        try {
          await normalizeToWav(audio, temp);
          await rename(temp, path);
        } catch (error) {
          await rm(temp, { force: true });
          throw error;
        }
      }

      let durationMs = durationCache.get(path);
      if (durationMs === undefined) {
        durationMs = await probeDurationMs(path);
        durationCache.set(path, durationMs);
      }
      return { path, durationMs };
    }

    async function ensureSilence(ms: number): Promise<string> {
      const path = join(cacheDir, `silence-${ms}.wav`);
      if (await isFile(path)) return path;
      const temp = join(cacheDir, `silence-${ms}.wav.tmp-${process.pid}-${tempCounter++}`);
      await run('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        `anullsrc=r=${SAMPLE_RATE}:cl=mono`,
        '-t',
        String(ms / 1000),
        '-c:a',
        'pcm_s16le',
        '-f',
        'wav',
        temp,
      ]);
      await rename(temp, path);
      return path;
    }

    const chapterDurations: number[][] = [];
    const chapterGaps: number[][] = [];
    const chapterPieces: string[][] = [];
    let pairsDone = 0;
    let chaptersDone = 0;
    const totalPairs = options.book.chapters.reduce(
      (total, chapter) => total + chapter.pairs.length,
      0
    );

    for (const chapter of options.book.chapters) {
      if (cancelled()) throw new CancelledError();
      options.onProgress?.({
        chaptersDone,
        pairsDone,
        currentChapterTitle: chapter.title,
      });

      const durations: number[] = [];
      const gaps: number[] = [];
      const pieces: string[] = [];

      for (let pairIndex = 0; pairIndex < chapter.pairs.length; pairIndex++) {
        if (cancelled()) throw new CancelledError();
        const pair = chapter.pairs[pairIndex];
        let pairDuration = 0;

        for (const chunk of chunkText(pair.japanese)) {
          if (cancelled()) throw new CancelledError();
          const wav = await ensureChunk(chunk);
          pieces.push(wav.path);
          pairDuration += wav.durationMs;
        }

        durations.push(pairDuration);
        const pause = pauseAfter(pair.japanese);
        gaps.push(pause);
        if (pairIndex < chapter.pairs.length - 1) {
          pieces.push(await ensureSilence(pause));
        }

        pairsDone += 1;
        options.onProgress?.({
          chaptersDone,
          pairsDone,
          currentChapterTitle: chapter.title,
        });
      }

      chapterDurations.push(durations);
      chapterGaps.push(gaps);
      chapterPieces.push(pieces);
    }

    if (pairsDone !== totalPairs) {
      throw new Error(`synthesized ${pairsDone} of ${totalPairs} pairs`);
    }

    const timeline = layoutTimeline(chapterDurations, chapterGaps);
    const opusFiles: string[] = [];
    const audioChapters: {
      index: number;
      file: string;
      startMs: number;
      durationMs: number;
    }[] = [];

    for (let position = 0; position < options.book.chapters.length; position++) {
      if (cancelled()) throw new CancelledError();
      const chapter = options.book.chapters[position];
      const pieces = chapterPieces[position];

      if (pieces.length > 0) {
        const temp = join(workDir, `ch${position}.part`);
        const listPath = join(workDir, `ch${position}.txt`);
        await writeFile(listPath, pieces.map(concatLine).join('\n') + '\n', 'utf8');

        await run('ffmpeg', [
          '-v',
          'error',
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          listPath,
          '-vn',
          '-ac',
          '1',
          // One chapter-level pass so a book does not drift in loudness
          // between sentences; chunk-level gains would pump instead.
          '-af',
          'loudnorm=I=-16:TP=-1.5:LRA=11',
          '-ar',
          '48000',
          '-c:a',
          'libopus',
          '-b:a',
          options.bitrate,
          '-application',
          'audio',
          '-f',
          'opus',
          temp,
        ]);

        // The hash in the name is what makes a re-run safe: old and new
        // chapters never share a URL, so a half-finished upload cannot be
        // played against the previous manifest's timings.
        const hash = await hashFile(temp);
        const file = `ch${String(chapter.index).padStart(3, '0')}-${hash}.opus`;
        const output = join(outputDir, file);
        await rename(temp, output);
        opusFiles.push(output);
        audioChapters.push({
          index: chapter.index,
          file,
          startMs: timeline.chapters[position].startMs,
          // Use the laid-out duration rather than the probed file length: Opus
          // padding would otherwise make adjacent chapters overlap on the book
          // timeline by a few milliseconds.
          durationMs: timeline.chapters[position].durationMs,
        });
      }

      chaptersDone += 1;
      options.onProgress?.({
        chaptersDone,
        pairsDone,
        currentChapterTitle: chapter.title,
      });
    }

    const timedChapters: Chapter[] = options.book.chapters.map((chapter, position) => ({
      ...chapter,
      pairs: chapter.pairs.map((pair, pairIndex) =>
        timedPair(pair, timeline.chapters[position]?.pairs[pairIndex])
      ),
    }));

    const book = {
      ...options.book,
      id: options.audioId,
      chapters: timedChapters,
      source: { kind: 'audiobook' as const },
    };
    delete (book as { audio?: unknown }).audio;
    delete (book as { demo?: unknown }).demo;

    // Uploaded last; the server publishes it only after every chapter it
    // names is on disk, so a broken upload leaves the previous audiobook.
    const assetPath = join(outputDir, 'asset.json.next');
    await writeFile(
      assetPath,
      JSON.stringify({ version: 1, book, audio: { chapters: audioChapters } }),
      'utf8'
    );

    return {
      audioId: options.audioId,
      dir: outputDir,
      files: [...opusFiles, assetPath],
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
