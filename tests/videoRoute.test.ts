import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createVideoRoute,
  mapYtDlpError,
  parseYouTubeUrl,
  resolveYouTubeVideo,
  type YtDlpRunner,
} from '../server/routes/video';

const VTT = `WEBVTT

00:00:01.000 --> 00:00:03.000
こんにちは。

00:00:03.500 --> 00:00:05.000
元気ですか？
`;

const VIDEO_ID = 'abcdefghijk';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'baku-video-test-'));
}

function writingRunner(vtt = VTT): YtDlpRunner {
  return async (_args, options) => {
    writeFileSync(join(options.cwd, `${VIDEO_ID}.ja.vtt`), vtt);
    return {
      stdout: `散歩VLOG\nあかね\n642\nhttps://i.ytimg.com/vi/${VIDEO_ID}/hq.jpg\n`,
      stderr: '',
    };
  };
}

test('parseYouTubeUrl accepts watch, short, shorts and embed links', () => {
  const forms = [
    `https://www.youtube.com/watch?v=${VIDEO_ID}&t=30`,
    `https://youtube.com/watch?v=${VIDEO_ID}`,
    `https://youtu.be/${VIDEO_ID}?si=x`,
    `https://www.youtube.com/shorts/${VIDEO_ID}`,
    `https://www.youtube.com/embed/${VIDEO_ID}`,
  ];

  for (const form of forms) {
    const parsed = parseYouTubeUrl(form);
    assert.equal(parsed.videoId, VIDEO_ID);
    assert.equal(parsed.url, `https://www.youtube.com/watch?v=${VIDEO_ID}`);
  }
});

test('parseYouTubeUrl rejects unsafe and non-video URLs', () => {
  const rejected = [
    'https://youtube.com.evil.example/watch?v=abcdefghijk',
    'https://example.com/watch?v=abcdefghijk',
    'http://www.youtube.com/watch?v=abcdefghijk',
    'https://user:pass@youtube.com/watch?v=abcdefghijk',
    'https://www.youtube.com:8443/watch?v=abcdefghijk',
    'https://www.youtube.com/playlist?list=PL123',
    'https://www.youtube.com/watch?v=short',
    'not a url',
  ];

  for (const url of rejected) {
    assert.throws(() => parseYouTubeUrl(url), /YouTube/);
  }
});

test('resolveYouTubeVideo reads metadata and a Japanese VTT', async () => {
  const dir = tempDir();
  const result = await resolveYouTubeVideo({
    url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    run: writingRunner(),
    makeTempDir: async () => dir,
  });

  assert.equal(result.videoId, VIDEO_ID);
  assert.equal(result.title, '散歩VLOG');
  assert.equal(result.channel, 'あかね');
  assert.equal(result.durationSec, 642);
  assert.equal(result.thumbnailUrl, `https://i.ytimg.com/vi/${VIDEO_ID}/hq.jpg`);
  assert.equal(result.cueCount, 2);
  assert.equal(result.language, 'ja');
  assert.match(result.vtt, /WEBVTT/);
});

test('resolveYouTubeVideo turns off --print simulation so subtitles are written', async () => {
  let args: string[] = [];
  const run: YtDlpRunner = async (received, options) => {
    args = received;
    writeFileSync(join(options.cwd, `${VIDEO_ID}.ja.vtt`), VTT);
    return {
      stdout: 'タイトル\nチャンネル\n120\n\n',
      stderr: '',
    };
  };

  await resolveYouTubeVideo({
    url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    run,
    makeTempDir: async () => tempDir(),
  });

  assert.ok(args.includes('--no-simulate'));
  assert.ok(args.includes('--write-auto-subs'));
});

test('YouTube rate limiting maps to an actionable resolve_failed', () => {
  const mapped = mapYtDlpError(
    "ERROR: Unable to download video subtitles for 'ja': HTTP Error 429: Too Many Requests"
  );
  assert.equal(mapped.code, 'resolve_failed');
  assert.match(mapped.error, /限流|稍后/);
});

test('resolveYouTubeVideo removes its temporary directory on success', async () => {
  const dir = tempDir();
  await resolveYouTubeVideo({
    url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    run: writingRunner(),
    makeTempDir: async () => dir,
  });

  assert.equal(existsSync(dir), false);
});

test('resolveYouTubeVideo removes its temporary directory on failure', async () => {
  const dir = tempDir();
  const failing: YtDlpRunner = async () => {
    throw Object.assign(new Error('spawn yt-dlp ENOENT'), { code: 'ENOENT' });
  };

  await assert.rejects(
    resolveYouTubeVideo({
      url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      run: failing,
      makeTempDir: async () => dir,
    })
  );
  assert.equal(existsSync(dir), false);
});

test('a missing binary maps to ytdlp_missing', () => {
  const mapped = mapYtDlpError('', 'ENOENT');
  assert.equal(mapped.code, 'ytdlp_missing');
  assert.match(mapped.error, /yt-dlp/);
});

test('a timeout maps to timeout', () => {
  const mapped = mapYtDlpError('', 'ETIMEDOUT');
  assert.equal(mapped.code, 'timeout');
});

test('missing Japanese subtitles map to no_subtitles', async () => {
  const run: YtDlpRunner = async () => ({
    stdout: 'タイトル\nチャンネル\n120\n\n',
    stderr: '',
  });

  await assert.rejects(
    resolveYouTubeVideo({
      url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      run,
      makeTempDir: async () => tempDir(),
    }),
    (error: unknown) =>
      (error as { code?: string }).code === 'no_subtitles'
  );
});

test('the route rejects an invalid URL without calling the resolver', async () => {
  let called = false;
  const route = createVideoRoute({
    resolve: async () => {
      called = true;
      throw new Error('should not run');
    },
  });

  const response = await route.request('/video/resolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/watch?v=abcdefghijk' }),
  });

  assert.equal(response.status, 400);
  assert.equal(called, false);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, 'invalid_url');
});

test('the route returns the resolver result as JSON', async () => {
  const route = createVideoRoute({
    resolve: async (input) => ({
      videoId: 'abcdefghijk',
      url: input.url,
      title: '散歩VLOG',
      channel: 'あかね',
      durationSec: 642,
      thumbnailUrl: 'https://example.com/thumb.jpg',
      vtt: VTT,
      cueCount: 2,
      language: 'ja',
    }),
  });

  const response = await route.request('/video/resolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: 'https://youtu.be/abcdefghijk',
    }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { title: string; cueCount: number };
  assert.equal(body.title, '散歩VLOG');
  assert.equal(body.cueCount, 2);
});

test('the video route limits requests per client', async () => {
  const route = createVideoRoute({
    resolve: async () => ({
      videoId: 'abcdefghijk',
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
      title: 'タイトル',
      channel: 'チャンネル',
      vtt: VTT,
      cueCount: 2,
      language: 'ja',
    }),
  });
  const request = () =>
    route.request('/video/resolve', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.7',
      },
      body: JSON.stringify({ url: 'https://youtu.be/abcdefghijk' }),
    });

  for (let index = 0; index < 6; index += 1) {
    assert.equal((await request()).status, 200);
  }
  const limited = await request();
  assert.equal(limited.status, 429);
});

test('the video route refuses more than two concurrent resolves', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const route = createVideoRoute({
    resolve: async () => {
      await gate;
      return {
        videoId: 'abcdefghijk',
        url: 'https://www.youtube.com/watch?v=abcdefghijk',
        title: 'タイトル',
        channel: 'チャンネル',
        vtt: VTT,
        cueCount: 2,
        language: 'ja',
      };
    },
  });
  const request = () =>
    route.request('/video/resolve', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.8',
      },
      body: JSON.stringify({ url: 'https://youtu.be/abcdefghijk' }),
    });

  const first = request();
  const second = request();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const third = await request();
  assert.equal(third.status, 429);

  release();
  assert.equal((await first).status, 200);
  assert.equal((await second).status, 200);
});
