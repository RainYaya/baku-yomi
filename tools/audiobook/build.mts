#!/usr/bin/env node
/**
 * Build an audiobook asset from a book, its narration transcript and its audio.
 *
 *   pnpm audiobook:build \
 *     --epub book.epub --srt book.srt --audio book.m4b \
 *     --id mushoku-01 --title "無職転生 1" --out ~/baku-yomi-data/audio/mushoku-01
 *
 * The EPUB is parsed exactly as the app parses it, the SRT is aligned to the
 * book text (ruby- and punctuation-insensitive), and ffmpeg cuts one Opus file
 * per chapter. The result is a directory the server can serve as-is.
 */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DOMParser } from 'linkedom';
import { initEpubFile } from '@lingo-reader/epub-parser';
import { alignPairsToCues, normalizeAudioText } from '../../src/lib/audiobook/align.ts';
import { buildBookFromEpub } from '../../src/lib/epub/parser.ts';
import { parseSrt } from '../../src/lib/import/subtitle.ts';
import type { Book } from '../../src/types/book.ts';

// The EPUB parser reads chapter HTML through DOMParser; linkedom provides one.
(globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser = DOMParser;

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

interface Options {
  epub: string;
  srt: string;
  audio: string;
  id: string;
  title?: string;
  author?: string;
  bitrate: string;
  out: string;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name: string): string {
  const value = option(name);
  if (!value) throw new Error(`缺少参数 --${name}`);
  return value;
}

function parseOptions(): Options {
  const id = required('id');
  if (!ID_PATTERN.test(id)) {
    throw new Error('--id 只能用小写字母、数字和连字符，例如 mushoku-01');
  }

  return {
    epub: resolve(required('epub')),
    srt: resolve(required('srt')),
    audio: resolve(required('audio')),
    id,
    title: option('title'),
    author: option('author'),
    bitrate: option('bitrate') ?? '32k',
    out: resolve(option('out') ?? join(process.cwd(), 'audiobook-out', id)),
  };
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} 退出码 ${code}\n${stderr.trim()}`));
    });
  });
}

/** Duration of a media file in milliseconds, from ffprobe. */
function probeDurationMs(path: string): Promise<number> {
  return new Promise((resolveProbe, reject) => {
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
        reject(new Error(`ffprobe 读不了 ${path}\n${stderr.trim()}`));
        return;
      }
      resolveProbe(Math.round(seconds * 1000));
    });
  });
}

function format(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function main() {
  const options = parseOptions();
  for (const path of [options.epub, options.srt, options.audio]) {
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) throw new Error(`找不到文件：${path}`);
  }

  await mkdir(options.out, { recursive: true });

  console.log(`读取 EPUB：${basename(options.epub)}`);
  const resources = await mkdtemp(join(tmpdir(), 'baku-epub-'));
  let book: Book;
  try {
    const epub = await initEpubFile(options.epub, resources);
    book = await buildBookFromEpub(epub, {
      fileName: basename(options.epub),
      bookId: options.id,
    });
  } finally {
    await rm(resources, { recursive: true, force: true });
  }

  if (book.chapters.length === 0) throw new Error('EPUB 里没有可读的章节。');

  const pairs = book.chapters.flatMap((chapter) => chapter.pairs);
  console.log(`章节 ${book.chapters.length} · 段落 ${pairs.length}`);

  // A Japanese novel whose table of contents has kanji-only headings makes the
  // importer pair neighbouring headings as if one translated the other. A
  // genuinely bilingual book pairs far more than a few percent of its lines,
  // so a stray handful here is noise.
  const imported = pairs.filter((pair) => pair.translationSource === 'imported');
  if (imported.length > 0 && imported.length < pairs.length * 0.03) {
    for (const pair of imported) {
      pair.chinese = '';
      pair.translationSource = undefined;
    }
    console.log(`清掉 ${imported.length} 处误判的"译文"（目录里的汉字行）`);
  }

  const cues = parseSrt(await readFile(options.srt, 'utf8'));
  if (cues.length === 0) throw new Error('字幕里没有可用的时间轴。');
  console.log(`字幕 ${cues.length} 条 · 末条 ${format(cues[cues.length - 1].endMs)}`);

  const { timings, matched } = alignPairsToCues(pairs, cues);
  for (let index = 0; index < pairs.length; index++) {
    const timing = timings[index];
    if (!timing) continue;
    pairs[index].startMs = timing.startMs;
    pairs[index].endMs = timing.endMs;
  }
  console.log(
    `对齐 ${matched}/${pairs.length} 段（${Math.round((100 * matched) / pairs.length)}%）`
  );

  const totalMs = await probeDurationMs(options.audio);

  // One file per chapter that has timed text. Boundaries sit halfway through
  // the silence between two chapters, so nothing spoken falls outside a file.
  const spans: { chapterIndex: number; startMs: number; endMs: number }[] = [];
  for (const chapter of book.chapters) {
    const timed = chapter.pairs.filter(
      (pair) => pair.startMs !== undefined && pair.endMs !== undefined
    );
    if (timed.length === 0) continue;
    spans.push({
      chapterIndex: chapter.index,
      startMs: Math.min(...timed.map((pair) => pair.startMs!)),
      endMs: Math.max(...timed.map((pair) => pair.endMs!)),
    });
  }

  if (spans.length === 0) throw new Error('没有任何段落对齐成功，检查字幕和书是否同一本。');

  const audioChapters: {
    index: number;
    file: string;
    startMs: number;
    durationMs: number;
  }[] = [];

  for (let index = 0; index < spans.length; index++) {
    const span = spans[index];
    const previous = spans[index - 1];
    const next = spans[index + 1];

    const startMs = previous
      ? Math.max(0, Math.round((previous.endMs + span.startMs) / 2))
      : 0;
    const endMs = next
      ? Math.min(totalMs, Math.round((span.endMs + next.startMs) / 2))
      : totalMs;

    if (endMs - startMs < 1000) continue;

    const file = `ch${String(span.chapterIndex).padStart(3, '0')}.opus`;
    const path = join(options.out, file);
    process.stdout.write(
      `  ${file}  ${format(startMs)} - ${format(endMs)}  ${book.chapters[span.chapterIndex].title}\n`
    );

    await run('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-ss',
      String(startMs / 1000),
      '-i',
      options.audio,
      '-t',
      String((endMs - startMs) / 1000),
      '-vn',
      '-map',
      '0:a:0',
      '-ac',
      '1',
      '-c:a',
      'libopus',
      '-b:a',
      options.bitrate,
      '-application',
      'audio',
      path,
    ]);

    audioChapters.push({
      index: span.chapterIndex,
      file,
      startMs,
      durationMs: await probeDurationMs(path),
    });
  }

  book.title = options.title ?? book.title;
  book.author = options.author ?? book.author;

  const assetPath = join(options.out, 'asset.json');
  await writeFile(
    assetPath,
    JSON.stringify({ version: 1, book, audio: { chapters: audioChapters } }),
    'utf8'
  );

  let size = 0;
  for (const chapter of audioChapters) {
    size += await stat(join(options.out, chapter.file)).then((info) => info.size);
  }

  console.log('');
  console.log(`资产：${assetPath}`);
  console.log(`音频：${audioChapters.length} 章 · ${(size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`目录：${dirname(assetPath)}`);
  if (matched < pairs.length) {
    console.log(
      `提示：${pairs.length - matched} 段靠插值计时；检查抽样的时间戳就知道对不对。`
    );
  }
  const untimed = pairs.filter((pair) => !normalizeAudioText(pair.japanese)).length;
  if (untimed > 0) console.log(`另有 ${untimed} 段没有文字（只有符号），不影响播放。`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
