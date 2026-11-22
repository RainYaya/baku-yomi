import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { parseVtt } from '../../src/lib/import/subtitle';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const RESOLVE_TIMEOUT_MS = 60_000;

export interface ParsedYouTubeUrl {
  videoId: string;
  url: string;
}

export interface VideoResolveResult {
  videoId: string;
  url: string;
  title: string;
  channel: string;
  durationSec?: number;
  thumbnailUrl?: string;
  vtt: string;
  cueCount: number;
  language: 'ja';
}

export type VideoErrorCode =
  | 'invalid_url'
  | 'ytdlp_missing'
  | 'no_subtitles'
  | 'timeout'
  | 'resolve_failed';

export interface YtDlpRunOptions {
  cwd: string;
}

export type YtDlpRunner = (
  args: string[],
  options: YtDlpRunOptions
) => Promise<{ stdout: string; stderr: string }>;

export class VideoResolveError extends Error {
  code: VideoErrorCode;

  constructor(code: VideoErrorCode, message: string) {
    super(message);
    this.name = 'VideoResolveError';
    this.code = code;
  }
}

/**
 * Accept only canonical YouTube video URLs. Hosts are checked exactly (no
 * suffix matching), credentials and ports are refused, and the 11-character
 * video id is validated before it ever reaches `yt-dlp`.
 */
export function parseYouTubeUrl(raw: string): ParsedYouTubeUrl {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('只支持 YouTube 视频链接。');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('只支持 YouTube 视频链接。');
  }
  if (parsed.username || parsed.password || parsed.port) {
    throw new Error('只支持 YouTube 视频链接。');
  }

  const host = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) {
    throw new Error('只支持 YouTube 视频链接。');
  }

  let videoId = '';
  if (host.endsWith('youtu.be')) {
    videoId = parsed.pathname.split('/')[1] ?? '';
  } else if (parsed.pathname === '/watch') {
    videoId = parsed.searchParams.get('v') ?? '';
  } else {
    const match = /^\/(?:shorts|embed)\/([^/]+)/.exec(parsed.pathname);
    videoId = match?.[1] ?? '';
  }

  if (!VIDEO_ID.test(videoId)) {
    throw new Error('只支持 YouTube 视频链接。');
  }

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

/** Translate a runner failure into a user action, never raw command output. */
export function mapYtDlpError(
  stderr: string,
  code?: string
): { code: VideoErrorCode; error: string } {
  if (code === 'ENOENT') {
    return {
      code: 'ytdlp_missing',
      error:
        '本机没有找到 yt-dlp。请先安装（例如 brew install yt-dlp），或改用「导入字幕」/「本地视频」。',
    };
  }

  if (code === 'ETIMEDOUT' || /timed?\s*out/i.test(stderr)) {
    return {
      code: 'timeout',
      error: '解析超时。请稍后重试，或改用「导入字幕」/「本地视频」。',
    };
  }

  if (/HTTP Error 429|too many requests/i.test(stderr)) {
    return {
      code: 'resolve_failed',
      error:
        'YouTube 暂时限流了，请稍后再试；也可以先用「导入字幕」或本地视频。',
    };
  }

  if (/no subtitles|there are no subtitles|requested subtitle/i.test(stderr)) {
    return {
      code: 'no_subtitles',
      error: '这个视频没有日文字幕。可以换一个视频，或粘贴字幕文件。',
    };
  }

  return {
    code: 'resolve_failed',
    error: '没能解析这个视频。请确认链接可访问，或改用「导入字幕」/「本地视频」。',
  };
}

function ytDlpArgs(tempDir: string, url: string): string[] {
  return [
    '--skip-download',
    // `--print` implies `--simulate`, which would stop subtitles from being written.
    '--no-simulate',
    '--no-warnings',
    '--no-playlist',
    '--write-subs',
    '--write-auto-subs',
    '--sub-langs',
    'ja',
    '--sub-format',
    'vtt',
    '--print',
    '%(title)s',
    '--print',
    '%(channel)s',
    '--print',
    '%(duration)s',
    '--print',
    '%(thumbnail)s',
    '-o',
    join(tempDir, '%(id)s.%(ext)s'),
    url,
  ];
}

const defaultRunner: YtDlpRunner = (args, { cwd }) =>
  new Promise((resolve, reject) => {
    const child = spawn('yt-dlp', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(
        Object.assign(new Error('yt-dlp timed out'), {
          code: 'ETIMEDOUT',
          timedOut: true,
        })
      );
    }, RESOLVE_TIMEOUT_MS);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (exitCode === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          Object.assign(new Error('yt-dlp failed'), {
            code: `EXIT_${exitCode}`,
            stderr,
          })
        );
      }
    });
  });

function pickVtt(files: string[]): string | undefined {
  const vtt = files.filter((file) => file.endsWith('.vtt'));
  return (
    vtt.find((file) => /\.ja\./i.test(file)) ??
    vtt.sort()[0]
  );
}

function toResolveError(error: unknown): VideoResolveError {
  if (error instanceof VideoResolveError) return error;

  const detail = error as {
    code?: string;
    stderr?: string;
    timedOut?: boolean;
  };

  if (detail.timedOut || detail.code === 'ETIMEDOUT') {
    return new VideoResolveError(
      'timeout',
      '解析超时。请稍后重试，或改用「导入字幕」/「本地视频」。'
    );
  }

  const mapped = mapYtDlpError(detail.stderr ?? '', detail.code);
  return new VideoResolveError(mapped.code, mapped.error);
}

export async function resolveYouTubeVideo(input: {
  url: string;
  run?: YtDlpRunner;
  makeTempDir?: () => Promise<string>;
}): Promise<VideoResolveResult> {
  const parsed = parseYouTubeUrl(input.url);
  const tempDir = await (input.makeTempDir ??
    (() => mkdtemp(join(tmpdir(), 'baku-video-'))))();

  try {
    let output: { stdout: string; stderr: string };
    try {
      output = await (input.run ?? defaultRunner)!(
        ytDlpArgs(tempDir, parsed.url),
        { cwd: tempDir }
      );
    } catch (error) {
      throw toResolveError(error);
    }

    const files = await readdir(tempDir).catch(() => [] as string[]);
    const vttName = pickVtt(files);
    if (!vttName) {
      throw new VideoResolveError(
        'no_subtitles',
        '这个视频没有日文字幕。可以换一个视频，或粘贴字幕文件。'
      );
    }

    const vtt = await readFile(join(tempDir, vttName), 'utf8');
    const cues = parseVtt(vtt);
    if (cues.length === 0) {
      throw new VideoResolveError(
        'no_subtitles',
        '这个视频没有日文字幕。可以换一个视频，或粘贴字幕文件。'
      );
    }

    const [title = '', channel = '', duration = '', thumbnail = ''] = output.stdout
      .replace(/\r\n?/g, '\n')
      .split('\n');

    if (!title.trim()) {
      throw new VideoResolveError(
        'resolve_failed',
        '没能读到视频信息，请稍后重试。'
      );
    }

    const durationSec = Number(duration);

    return {
      videoId: parsed.videoId,
      url: parsed.url,
      title: title.trim(),
      channel: channel.trim(),
      durationSec: Number.isFinite(durationSec) ? durationSec : undefined,
      thumbnailUrl: thumbnail.trim() || undefined,
      vtt,
      cueCount: cues.length,
      language: 'ja',
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function createVideoRoute(options?: {
  resolve?: (input: { url: string }) => Promise<VideoResolveResult>;
}) {
  const resolve = options?.resolve ?? resolveYouTubeVideo;
  const route = new Hono();

  const RATE_WINDOW_MS = 60_000;
  const RATE_MAX = 6;
  const MAX_ACTIVE = 2;
  const buckets = new Map<string, { count: number; resetAt: number }>();
  let active = 0;

  route.post('/video/resolve', async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      url?: unknown;
    } | null;
    const raw = typeof body?.url === 'string' ? body.url : '';

    let parsed: ParsedYouTubeUrl;
    try {
      parsed = parseYouTubeUrl(raw);
    } catch {
      return c.json(
        { code: 'invalid_url', error: '请粘贴合法的 YouTube 视频链接。' },
        400
      );
    }

    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const now = Date.now();
    let bucket = buckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
      buckets.set(ip, bucket);
    }
    bucket.count += 1;
    if (bucket.count > RATE_MAX) {
      return c.json(
        { code: 'rate_limited', error: '解析请求太频繁，请稍后再试。' },
        429
      );
    }
    if (active >= MAX_ACTIVE) {
      return c.json(
        { code: 'busy', error: '已有视频在解析中，请等它结束再试。' },
        429
      );
    }

    active += 1;
    try {
      return c.json(await resolve({ url: parsed.url }));
    } catch (error) {
      const resolveError = toResolveError(error);
      const status: 422 | 502 | 503 | 504 =
        resolveError.code === 'ytdlp_missing'
          ? 503
          : resolveError.code === 'timeout'
            ? 504
            : resolveError.code === 'no_subtitles'
              ? 422
              : 502;
      return c.json(
        { code: resolveError.code, error: resolveError.message },
        status
      );
    } finally {
      active -= 1;
    }
  });

  return route;
}

export default createVideoRoute();
