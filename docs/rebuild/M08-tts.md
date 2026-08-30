# M8 · TTS 朗读：双引擎、双层缓存与连续朗读

> 目标：让书被「读」出来——服务端两个 TTS 引擎（微软免费云 + VOICEVOX 本地）、双层字节上限缓存、浏览器端播放管理、连续朗读不卡顿。
> 关联课程：L26（双引擎：msedge-tts vs VOICEVOX）、L27（服务端缓存设计）、L28（客户端音频管理）。
> 前置：完成 M7。M4 已建 `server/routes/ai.ts`（/api/analyze + 限流）并由 `server/index.ts` 挂到 `/api`；M6 已在 ReadingView 留好 `toggleAutoRead` 与 `r` 键位（占位实现，未接真实播放器）。

## 构筑总览（本里程碑结束时的项目结构）

```
baku-yomi/
├── server/
│   ├── index.ts          # 不变（/api 挂载在 M4 已建）
│   ├── routes/ai.ts      # +2 行：import tts + ai.route('/tts', tts)
│   └── tts/
│       ├── types.ts      # TTSProvider / Speaker / SynthesisOptions 契约（新建）
│       ├── microsoft.ts  # msedge-tts 封装，输出 MP3（新建）
│       ├── voicevox.ts   # VOICEVOX 两步合成，输出 WAV（新建）
│       └── index.ts      # provider 注册表 + 字节上限缓存 + 全部 TTS 路由（新建）
└── src/
    ├── lib/tts/voicevox.ts            # 浏览器端门面：Blob 缓存 + 单飞去重 + 播放 + 订阅（新建）
    ├── stores/settingsSlice.ts        # +ttsProvider 与 voicevox 系列设置字段（改）
    └── components/
        ├── settings/VoiceSettingsPanel.tsx   # 新建：引擎切换 + 双层缓存状态
        ├── settings/SettingsModal.tsx        # +「语音」tab（改）
        ├── reader/ReadingView.tsx            # 连读接线：预取 + 回调驱动链（改）
        └── reader/SentencePairCard.tsx       # +播放按钮 / 迷你进度条（改）
```

> 最终差异说明：合成音频从浏览器走到服务端再回来，全程是**字节**——双层缓存、预取、seek 进度条都建立在「音频是可持有的一段数据」之上。前端文件名叫 voicevox.ts 但实际兼容双引擎：请求路径 `/api/tts/${provider}` 由设置的 `ttsProvider` 决定，名字只是历史遗留。

## Step 1 · 统一契约：server/tts/types.ts

**做什么：** 定义两个引擎都必须实现的接口与共享类型。**新建** `server/tts/types.ts`：

```ts
export type SynthesisOptions = {
  speedScale?: number;   // 语速倍率，1 为原速
  pitchScale?: number;   // 音高偏移，0 为不变
  volumeScale?: number;  // 音量倍率，1 为原始
};

export type Speaker = {
  name: string;
  speaker_uuid: string;
  styles: { id: number; name: string }[];
};

export interface TTSProvider {
  readonly name: string;
  synthesize(text: string, speaker: number, options?: SynthesisOptions): Promise<Buffer>;
  getSpeakers(): Promise<Speaker[]>;
}
```

**讲解：** `TTSProvider` 只有两个方法（合成音频、列出音声）——路由层只认接口，对具体引擎零感知，Step 4 的注册表让新引擎接入不改任何路由代码（策略模式）。`SynthesisOptions` 是跨引擎的韵律抽象：两引擎内部单位完全不同（微软用半音符字符串与 0~100 音量、VOICEVOX 用 audioQuery 标量），换算各自写在 provider 里。`Speaker` 照搬 VOICEVOX 的 `/speakers` 结构（角色 + 风格数组），被选为全项目统一音声模型；`synthesize` 的 `speaker` 参数实际传 **style 的数字 id**——全链路（下拉框 → 缓存键 → 引擎参数）都是这个整数。

## Step 2 · MicrosoftTTSProvider：msedge-tts 封装

**做什么：** **新建** `server/tts/microsoft.ts`。用 `msedge-tts` 库复用 Edge 的免费语音接口（无需 Azure Key），输出 24kHz/96kbps 单声道 MP3。

```ts
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type { TTSProvider, SynthesisOptions, Speaker } from './types';

// Japanese voices — id maps to index in this array
const JA_VOICES = [
  'ja-JP-NanamiNeural',   // id 0, female
  'ja-JP-KeitaNeural',    // id 1, male
];

export class MicrosoftTTSProvider implements TTSProvider {
  readonly name = 'microsoft';

  async synthesize(text: string, speaker: number, options?: SynthesisOptions): Promise<Buffer> {
    const voice = JA_VOICES[speaker] ?? JA_VOICES[0];

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    const prosody: { rate?: number; pitch?: string; volume?: number } = {};
    if (options?.speedScale != null) {
      prosody.rate = options.speedScale;
    }
    if (options?.pitchScale != null) {
      // Convert our -0.15~0.15 range to semitone string
      const st = (options.pitchScale * 20).toFixed(1);
      prosody.pitch = `${Number(st) >= 0 ? '+' : ''}${st}st`;
    }
    if (options?.volumeScale != null) {
      // Convert our 0.2~2 range to 0~100
      prosody.volume = Math.round(Math.min(100, Math.max(0, options.volumeScale * 50)));
    }

    const { audioStream } = tts.toStream(text, prosody);

    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.from(chunk));
    }

    tts.close();
    return Buffer.concat(chunks);
  }

  async getSpeakers(): Promise<Speaker[]> {
    try {
      const tts = new MsEdgeTTS();
      const allVoices = await tts.getVoices();
      const jaVoices = allVoices.filter((v) => v.Locale === 'ja-JP');
      tts.close();

      if (jaVoices.length > 0) {
        return jaVoices.map((v, i) => ({
          name: v.FriendlyName,
          speaker_uuid: `ms-${v.ShortName}`,
          styles: [{ id: i, name: v.ShortName }],
        }));
      }
    } catch {
      // Fall back to hardcoded list
    }

    return JA_VOICES.map((voice, i) => ({
      name: voice.replace('Neural', ''),
      speaker_uuid: `ms-${voice}`,
      styles: [{ id: i, name: voice }],
    }));
  }
}
```

**讲解：** 韵律换算三连：`speedScale` 语义一致直通 `rate`；`pitchScale × 20` 换成半音符 `st`（`>= 0` 决定要不要 `+` 号）；`volumeScale × 50` 换到微软 0~100 刻度——三个数字最终落进 SSML 的 `<prosody>` 属性，provider 只是做单位翻译。`for await` 流收集 + `Buffer.from(chunk)` 逐块复制：底层 WebSocket 是流式协议，这里等完整音频才 resolve，对外是极简的 `Promise<Buffer>`。**`tts.close()` 必须调用**——每次 synthesize 新建一条 WebSocket，不关就逐次泄漏连接，这是 provider 里唯一的资源管理点。`getSpeakers()` 有**两层降级**（网络失败走 catch 回落硬编码；网络成功但日语列表为空也落到尾部硬编码）——「免配置」特性靠它成立。依赖：`pnpm add msedge-tts`。

## Step 3 · VoicevoxProvider：VOICEVOX 两步合成

**做什么：** **新建** `server/tts/voicevox.ts`。VOICEVOX 是开源日语 TTS 引擎，以 HTTP 服务跑在本机（默认 50021）。合成分两步：先拿「音频查询计划」改参数，再真正合成。

```ts
import type { TTSProvider, SynthesisOptions, Speaker } from './types';

export class VoicevoxProvider implements TTSProvider {
  readonly name = 'voicevox';
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl ?? process.env.VOICEVOX_ENGINE_URL ?? 'http://localhost:50021').replace(/\/$/, '');
  }

  async synthesize(text: string, speaker: number, options?: SynthesisOptions): Promise<Buffer> {
    const queryRes = await fetch(
      `${this.baseUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`,
      { method: 'POST' },
    );

    if (!queryRes.ok) {
      const detail = await queryRes.text();
      throw new Error(`audio_query failed: ${detail}`);
    }

    const audioQuery = (await queryRes.json()) as Record<string, unknown>;

    if (options && typeof options === 'object') {
      if (typeof options.speedScale === 'number') {
        audioQuery.speedScale = Math.max(0.5, Math.min(2, options.speedScale));
      }
      if (typeof options.pitchScale === 'number') {
        audioQuery.pitchScale = Math.max(-0.15, Math.min(0.15, options.pitchScale));
      }
      if (typeof options.volumeScale === 'number') {
        audioQuery.volumeScale = Math.max(0.2, Math.min(2, options.volumeScale));
      }
    }

    const synthRes = await fetch(`${this.baseUrl}/synthesis?speaker=${speaker}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(audioQuery),
    });

    if (!synthRes.ok) {
      const detail = await synthRes.text();
      throw new Error(`synthesis failed: ${detail}`);
    }

    return Buffer.from(await synthRes.arrayBuffer());
  }

  async getSpeakers(): Promise<Speaker[]> {
    const response = await fetch(`${this.baseUrl}/speakers`);

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`speakers failed: ${detail}`);
    }

    return (await response.json()) as Speaker[];
  }
}
```

**讲解：** **为什么分两步**：`audio_query` 返回引擎的中间表示（音素时长、语调曲线都在里面），客户端改参数后再提交合成——本项目只改三个顶层标量并做区间钳制（speed ∈ [0.5,2]、pitch ∈ [-0.15,0.15]、volume ∈ [0.2,2]），钳制防引擎对越界参数报错。每个 fetch 都检查 `res.ok` 并透传引擎报错文本，调试时直接能看到 VOICEVOX 说了什么。返回 WAV（响应头 `audio/wav`），比 MP3 大一个数量级——这是 Step 4 缓存按**字节**而非条数管理的原因。`getSpeakers()` 简单透传（VOICEVOX 本身就是这套结构的出处）。引擎本体可选：本地开发先微软验证全链路，VOICEVOX 引擎由 M11 部署里程碑的 docker-compose 提供。

## Step 4 · tts/index.ts：注册表 + 字节上限缓存 + 路由

**做什么：** **新建** `server/tts/index.ts`（147 行，服务端最核心的缓存代码）。三件事：provider 注册表、字节上限 LRU 缓存、全部 TTS 路由。

```ts
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import type { TTSProvider, SynthesisOptions } from './types';
import { VoicevoxProvider } from './voicevox';
import { MicrosoftTTSProvider } from './microsoft';

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------
const providers = new Map<string, TTSProvider>();
providers.set('voicevox', new VoicevoxProvider());
providers.set('microsoft', new MicrosoftTTSProvider());

const defaultProviderName = process.env.TTS_DEFAULT_PROVIDER ?? 'microsoft';

function getProvider(name?: string): TTSProvider {
  const key = name ?? defaultProviderName;
  const provider = providers.get(key);
  if (!provider) throw new Error(`Unknown TTS provider: ${key}`);
  return provider;
}

// ---------------------------------------------------------------------------
// Server-side TTS cache (shared across all providers)
// ---------------------------------------------------------------------------
type TtsCacheItem = {
  key: string;
  wav: Buffer;
  size: number;
  lastAccessAt: number;
};

const ttsCache = new Map<string, TtsCacheItem>();
const TTS_CACHE_MAX_BYTES = Number(process.env.TTS_CACHE_MAX_BYTES ?? 120 * 1024 * 1024);
let ttsCacheBytes = 0;
let ttsCacheHits = 0;
let ttsCacheMisses = 0;
let ttsCacheEvictions = 0;

function makeCacheKey(provider: string, text: string, speaker: number, options?: SynthesisOptions): string {
  const speed = options?.speedScale ?? 1;
  const pitch = options?.pitchScale ?? 0;
  const volume = options?.volumeScale ?? 1;
  return createHash('sha1').update(`${provider}::${speaker}::${speed}::${pitch}::${volume}::${text}`).digest('hex');
}

function evictIfNeeded(max = TTS_CACHE_MAX_BYTES): void {
  if (ttsCacheBytes <= max) return;
  const items = [...ttsCache.values()].sort((a, b) => a.lastAccessAt - b.lastAccessAt);
  for (const item of items) {
    ttsCache.delete(item.key);
    ttsCacheBytes -= item.size;
    ttsCacheEvictions += 1;
    if (ttsCacheBytes <= max) break;
  }
}

function readCache(key: string): Buffer | null {
  const item = ttsCache.get(key);
  if (!item) return null;
  item.lastAccessAt = Date.now();
  ttsCacheHits += 1;
  return item.wav;
}

function writeCache(key: string, wav: Buffer): void {
  const existing = ttsCache.get(key);
  if (existing) ttsCacheBytes -= existing.size;

  ttsCache.set(key, { key, wav, size: wav.byteLength, lastAccessAt: Date.now() });
  ttsCacheBytes += wav.byteLength;
  evictIfNeeded();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const tts = new Hono();

// Cache routes — must be registered before /:provider to avoid param match
tts.get('/cache/stats', (c) => {
  return c.json({
    items: ttsCache.size,
    totalBytes: ttsCacheBytes,
    maxBytes: TTS_CACHE_MAX_BYTES,
    hits: ttsCacheHits,
    misses: ttsCacheMisses,
    evictions: ttsCacheEvictions,
  });
});

tts.post('/cache/clear', (c) => {
  ttsCache.clear();
  ttsCacheBytes = 0;
  return c.json({ ok: true });
});

// Speakers list
tts.get('/:provider/speakers', async (c) => {
  const providerName = c.req.param('provider');

  try {
    const provider = getProvider(providerName);
    const speakers = await provider.getSpeakers();
    return c.json(speakers, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

// Synthesize — works for any provider
tts.post('/:provider', async (c) => {
  const providerName = c.req.param('provider');
  const body = await c.req.json();
  const { text, speaker = 1, options } = body ?? {};

  if (!text || typeof text !== 'string') {
    return c.json({ error: 'Missing required field: text' }, 400);
  }

  try {
    const provider = getProvider(providerName);
    const cacheKey = makeCacheKey(provider.name, text, speaker, options);
    const contentType = provider.name === 'microsoft' ? 'audio/mpeg' : 'audio/wav';

    const cached = readCache(cacheKey);
    if (cached) {
      return new Response(cached, {
        headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-TTS-Cache': 'HIT' },
      });
    }

    ttsCacheMisses += 1;
    const wav = await provider.synthesize(text, speaker, options);
    writeCache(cacheKey, wav);

    return new Response(wav, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-TTS-Cache': 'MISS' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

export default tts;
```

**讲解：**
- **注册表 = 策略模式的 Map 变体**：模块加载时装配一次，之后所有请求查表。`getProvider` 在 URL 缺 provider 名时回落环境变量指定的默认引擎。
- **缓存键五维**：provider / speaker / speed / pitch / volume / text——任何一维漏掉都会「改了设置却播旧音频」。缺省值归一化（`?? 1`/`?? 0`）保证「不传 options」和「显式传默认值」命中同一键；`::` 分隔符防字段拼接歧义；SHA1 把任意长文本压成定长摘要（纯防碰撞，n=100 万条时碰撞概率约 3×10⁻³⁷）。
- **为什么按字节而非条数**：一句 10 字的 WAV 约 80KB，一段 200 字的长句轻松破 1MB。`ttsCacheBytes` 增量维护 O(1) 可查；驱逐按 `lastAccessAt` 升序删到达标——**简化 LRU**（真 LRU 应双向链表 + 哈希表 O(1)，这里为 20 行代码可读性牺牲渐近复杂度，面试可主动指出）。
- **读路径**命中即刷新 `lastAccessAt`（LRU 的灵魂一行）+ `hits++`；**写路径**同键覆盖先归还旧体积、再加新体积、最后触发驱逐——任何时刻 `ttsCacheBytes` 都是结算过的。
- **路由顺序即语义**：`/cache/stats`、`/cache/clear` 必须注册在 `/:provider` 之前，否则被参数路由吞掉（注释即防御文档）。
- **主路由**：HIT 直接返回（带 `X-TTS-Cache` 头）；MISS 合成 → 写缓存 → 返回。`Cache-Control: no-store` 禁止浏览器/代理再叠一层 HTTP 缓存（会让清缓存失效）。contentType 按 provider 分派（MP3 vs WAV），键含 provider 维度不会串格式。**speakers 路由不走缓存**——音声列表不是合成产物，叠缓存只会引入「引擎装新音色后列表多久更新」的失效难题。
- 诚实缺口：服务端**没有请求去重**（`voicePending` 只在客户端），两个同键请求同时到达会双写缓存、浪费一次合成——单用户可容忍，多用户再上 `pendingMap`。

**验证（挂载后，curl 系列）：**
```bash
# 1) 首次合成：MISS
curl -s -X POST http://localhost:3003/api/tts/microsoft -H "Content-Type: application/json" \
  -d '{"text":"こんにちは","speaker":1}' -o /tmp/a.mp3 -D - | grep -i x-tts-cache
# 2) 同参数再发：HIT，且两次产物字节一致（cmp /tmp/a.mp3 /tmp/b.mp3）
curl -s -X POST http://localhost:3003/api/tts/microsoft -H "Content-Type: application/json" \
  -d '{"text":"こんにちは","speaker":1}' -o /tmp/b.mp3 -D - | grep -i x-tts-cache
# 3) 改语速参数：新键 → MISS（五维键生效）   4) 统计接口六项数字随之变化
curl -s http://localhost:3003/api/tts/cache/stats
```

## Step 5 · 挂载：把 tts 路由接进 /api

**做什么：** 在 `server/routes/ai.ts` 加两行（import + 挂载），`server/index.ts` **不用改**——M4 已把 `ai` 子应用挂到 `/api`。

```ts
// server/routes/ai.ts（M4 版本上追加）
import tts from '../tts/index';

const ai = new Hono();

// Mount TTS sub-routes
ai.route('/tts', tts);
```

**讲解：** 路由嵌套链路是 `server/index.ts: app.route('/api', ai)` → `ai.route('/tts', tts)` → `tts.post('/:provider')`，浏览器最终请求 `POST /api/tts/microsoft`。TTS 挂 ai 子应用下而非主应用，因为 `/api` 前缀统一由入口提供——M4 定下的约定，新子路由只需 `route` 一行。

**验证：** 重启 `pnpm dev:server` 后跑通 Step 4 的 curl 系列；`pnpm dev` 后浏览器访问 `http://localhost:5174/api/tts/microsoft/speakers` 也能拿到 JSON（Vite 代理生效）。

## Step 6 · 前端门面：src/lib/tts/voicevox.ts

**做什么：** **新建** `src/lib/tts/voicevox.ts`（最终版 362 行，本步给出核心的完整实现）。一个**纯 TS 模块**：模块级单例状态 + 导出函数 + 订阅接口，React 组件只是它的「遥控器」。核心机制三个：Blob URL 缓存（80MB 上限 + LRU）、`voicePending` 进行中请求去重（single-flight）、单例 `HTMLAudioElement` 播放 + 状态广播。

```ts
export type VoicevoxSpeakerStyle = { id: number; name: string };
export type VoicevoxSpeaker = { name: string; speaker_uuid: string; styles: VoicevoxSpeakerStyle[] };
export type VoicevoxSynthesisOptions = { speedScale?: number; pitchScale?: number; volumeScale?: number };

type VoicevoxPlaybackState = { pairId: string | null; isLoading: boolean; isPlaying: boolean; currentTime: number; duration: number };
type PlaybackListener = (state: VoicevoxPlaybackState) => void;
type PlaybackEndedListener = (pairId: string | null) => void;
type VoiceCacheItem = { key: string; url: string; size: number; lastAccessAt: number };

import { useSettingsStore } from '../../stores/settingsSlice';

// —— 模块级单例状态：全部可变私有状态集中在此 ——
let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;
const voiceCache = new Map<string, VoiceCacheItem>();        // 层1：成品 URL 缓存
const voicePending = new Map<string, Promise<string>>();     // 层2：进行中请求去重
const DEFAULT_MAX_CACHE_BYTES = 80 * 1024 * 1024;
let cacheMaxBytes = DEFAULT_MAX_CACHE_BYTES;
let cacheBytes = 0, cacheHits = 0, cacheMisses = 0, cacheEvictions = 0;
let cachedSpeakers: VoicevoxSpeaker[] | null = null;
let speakersRequest: Promise<VoicevoxSpeaker[]> | null = null;
const listeners = new Set<PlaybackListener>();
const endedListeners = new Set<PlaybackEndedListener>();
let playbackState: VoicevoxPlaybackState = { pairId: null, isLoading: false, isPlaying: false, currentTime: 0, duration: 0 };

// —— 发布-订阅骨架：每次状态变化广播完整快照（不可变替换） ——
function setPlaybackState(partial: Partial<VoicevoxPlaybackState>): void {
  playbackState = { ...playbackState, ...partial };
  for (const listener of listeners) listener(playbackState);
}
function emitPlaybackEnded(pairId: string | null): void {
  for (const listener of endedListeners) listener(pairId);
}

/** 在 React 外读 store：设置面板切引擎后下一次请求立刻生效 */
function getCurrentTtsProvider(): string {
  return useSettingsStore.getState().ttsProvider;
}

function makeVoiceCacheKey(text: string, speaker: number, options?: VoicevoxSynthesisOptions): string {
  const provider = getCurrentTtsProvider();
  const speed = options?.speedScale ?? 1;
  const pitch = options?.pitchScale ?? 0;
  const volume = options?.volumeScale ?? 1;
  return `${provider}::${speaker}::${speed}::${pitch}::${volume}::${text}`;
}

// —— 缓存写入：同键覆盖先 revoke 旧 URL；驱逐按 lastAccessAt 升序，逐条 revoke ——
function evictVoiceCache(targetBytes = cacheMaxBytes): void {
  if (cacheBytes <= targetBytes) return;
  const candidates = [...voiceCache.values()].sort((a, b) => a.lastAccessAt - b.lastAccessAt);
  for (const item of candidates) {
    voiceCache.delete(item.key);
    cacheBytes -= item.size;
    cacheEvictions += 1;
    URL.revokeObjectURL(item.url);
    if (cacheBytes <= targetBytes) break;
  }
}

function saveVoiceCache(key: string, url: string, size: number): void {
  const existing = voiceCache.get(key);
  if (existing) {
    cacheBytes -= existing.size;
    URL.revokeObjectURL(existing.url);
  }
  voiceCache.set(key, { key, url, size, lastAccessAt: Date.now() });
  cacheBytes += size;
  evictVoiceCache(cacheMaxBytes);
}

async function requestVoiceBlob(text: string, speaker: number, options?: VoicevoxSynthesisOptions): Promise<Blob> {
  const provider = getCurrentTtsProvider();
  const response = await fetch(`/api/tts/${provider}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, speaker, options }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || 'TTS request failed');
  }
  return response.blob();
}

// —— 核心双检：成品缓存 → 进行中请求共享 → 发起网络 ——
async function ensureVoiceUrl(text: string, speaker: number, options?: VoicevoxSynthesisOptions): Promise<string> {
  const key = makeVoiceCacheKey(text, speaker, options);
  const cached = voiceCache.get(key);
  if (cached) {
    cacheHits += 1;
    cached.lastAccessAt = Date.now();
    return cached.url;
  }
  const pending = voicePending.get(key);
  if (pending) return pending;   // 别人正在请求同一句：共享同一个 Promise
  cacheMisses += 1;
  const task = (async () => {
    const blob = await requestVoiceBlob(text, speaker, options);
    const url = URL.createObjectURL(blob);
    saveVoiceCache(key, url, blob.size);
    return url;
  })();
  voicePending.set(key, task);
  try {
    return await task;
  } finally {
    voicePending.delete(key);   // 成败都摘除，失败的 key 允许重试
  }
}

/** 预取 = 提前调用 ensureVoiceUrl 并丢弃结果；结果必然落进 voiceCache */
export function prefetchVoicevox(text: string, speaker = 1, options?: VoicevoxSynthesisOptions): Promise<void> {
  return ensureVoiceUrl(text, speaker, options).then(() => undefined);
}

function cleanupCurrentAudio(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio.onended = null;   // 六个事件处理器逐一摘除，防旧回调串音
    currentAudio.onerror = null;
    currentAudio.ontimeupdate = null;
    currentAudio.onplay = null;
    currentAudio.onpause = null;
    currentAudio.onloadedmetadata = null;
  }
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);   // 安全阀：正常路径恒为 null
  }
  currentAudio = null;
  currentAudioUrl = null;
  setPlaybackState({ pairId: null, isLoading: false, isPlaying: false, currentTime: 0, duration: 0 });
}

export function subscribeVoicevoxPlayback(listener: PlaybackListener): () => void {
  listeners.add(listener);
  listener(playbackState);
  return () => listeners.delete(listener);
}

export function subscribeVoicevoxEnded(listener: PlaybackEndedListener): () => void {
  endedListeners.add(listener);
  return () => endedListeners.delete(listener);
}

export async function playVoicevox(text: string, speaker = 1, pairId?: string, options?: VoicevoxSynthesisOptions): Promise<void> {
  cleanupCurrentAudio();   // 打断上一句（单例纪律）
  setPlaybackState({ pairId: pairId ?? null, isLoading: true, isPlaying: false });

  const url = await ensureVoiceUrl(text, speaker, options);
  const audio = new Audio(url);

  currentAudio = audio;
  currentAudioUrl = null;   // URL 归 voiceCache 所有，播放层只借用

  audio.onloadedmetadata = () => setPlaybackState({ duration: audio.duration || 0 });
  audio.ontimeupdate = () => setPlaybackState({ currentTime: audio.currentTime || 0 });
  audio.onplay = () => setPlaybackState({ isLoading: false, isPlaying: true });
  audio.onpause = () => setPlaybackState({ isPlaying: false });

  audio.onended = () => {
    const endedPairId = playbackState.pairId;   // 清理前先抄出「播的是哪句」
    cleanupCurrentAudio();
    emitPlaybackEnded(endedPairId);             // 触发连续朗读链
  };

  audio.onerror = () => cleanupCurrentAudio();

  try {
    await audio.play();
  } catch (error) {
    cleanupCurrentAudio();
    throw error;
  }
}
```

其余导出（最终版同款、一行一组）：`toggleVoicevoxPause`（`currentAudio.paused ? play() : pause()`，`void` 忽略 play 的 Promise）、`seekVoicevox(seconds)`（`currentTime` 钳制到 `[0, duration||0]`）、`stopVoicevoxPlayback`（= `cleanupCurrentAudio`）、`setVoicevoxCacheLimit`（钳到 ≥1MB 并立即驱逐）、`getVoicevoxCacheStats`、`clearVoicevoxCache`（逐条 revoke + 清零）、`getVoicevoxSpeakers`（`cachedSpeakers` + `speakersRequest` 双检记忆化，与 `ensureVoiceUrl` 同构）。

**讲解（重点：双层缓存读写路径与预取）：** `ensureVoiceUrl` 是唯一入口——① 查 `voiceCache`（成品 URL，命中刷新 LRU 时间戳）；② 查 `voicePending`（同一句请求进行中 → 共享 Promise）；③ 都没有 → `requestVoiceBlob` 打 `POST /api/tts/{provider}`（服务端 Step 4 缓存兜这一层：HIT 立即返回字节，MISS 合成并入库）→ `URL.createObjectURL` → `saveVoiceCache`。**两层缓存是镜像结构**（键五维一致、字节上限 + LRU），唯一区别：客户端不哈希、键直接是字符串（条目少、调试可读），且驱逐时必须 `URL.revokeObjectURL` 释放 Blob 内存——服务端 Buffer 直接丢弃即可。**Blob URL 生命周期**：创建 1 处（`ensureVoiceUrl`）、释放 3 处（驱逐 / 同键覆盖 / `clearVoicevoxCache`），`playVoicevox` 里 `currentAudioUrl = null` 表示播放层只借用——**所有权单一化**是不泄漏的根因。**预取没有特殊通道**：`prefetchVoicevox` 就是提前调 `ensureVoiceUrl` 并丢弃结果，与实取共享同一套缓存/去重/统计代码，不存在两套逻辑漂移。

**消费方接线（ReadingView，M6 的 toggleAutoRead 占位填入真实实现）：**

```tsx
// 播放当前句时为后续句子铺路：把接下来 N 句的音频请求好
const prefetchAhead = useCallback((fromPairId: string, count = PREFETCH_WINDOW) => {
  if (!currentChapter) return;
  const startIndex = currentChapter.pairs.findIndex((p) => p.id === fromPairId);
  if (startIndex < 0) return;
  const candidates = currentChapter.pairs.slice(startIndex + 1, startIndex + 1 + count);
  for (const pair of candidates) {
    void prefetchVoicevox(pair.japanese, voicevoxSpeakerId, {
      speedScale: voicevoxSpeed, pitchScale: voicevoxPitch, volumeScale: voicevoxVolume,
    }).catch((error) => console.warn('Prefetch failed:', error));   // 预取失败安静降级
  }
}, [currentChapter, voicevoxPitch, voicevoxSpeakerId, voicevoxSpeed, voicevoxVolume, PREFETCH_WINDOW]);

const startPlayPair = useCallback(async (pairId: string) => {
  if (!currentChapter) return;
  const pair = currentChapter.pairs.find((p) => p.id === pairId);
  if (!pair) return;
  setIsAutoReadBusy(true);
  try {
    prefetchAhead(pair.id);
    await playVoicevox(pair.japanese, voicevoxSpeakerId, pair.id, {
      speedScale: voicevoxSpeed, pitchScale: voicevoxPitch, volumeScale: voicevoxVolume,
    });
  } catch (error) {
    console.error('Auto read failed:', error);
    autoReadRequestedRef.current = false;
    setIsAutoReadOn(false);
  } finally {
    setIsAutoReadBusy(false);
  }
}, [currentChapter, prefetchAhead, voicevoxPitch, voicevoxSpeakerId, voicevoxSpeed, voicevoxVolume]);

// 播完一句 → 定位下一句 → 滚动居中 → 再播放（回调驱动，零轮询）
useEffect(() => {
  if (!currentChapter) { autoReadRequestedRef.current = false; setIsAutoReadOn(false); return; }
  const unsubscribe = subscribeVoicevoxEnded((endedPairId) => {
    if (!autoReadRequestedRef.current) return;   // Esc/停止后立即失效
    const endedIndex = endedPairId ? currentChapter.pairs.findIndex((p) => p.id === endedPairId) : -1;
    if (endedIndex < 0 || endedIndex >= currentChapter.pairs.length - 1) {
      autoReadRequestedRef.current = false;
      setIsAutoReadOn(false);   // 播完最后一句自然终止
      return;
    }
    const nextPair = currentChapter.pairs[endedIndex + 1];
    handleSelectPair(nextPair.id);
    scrollPairToCenter(nextPair.id);
    void startPlayPair(nextPair.id);
  });
  return unsubscribe;
}, [currentChapter, scrollPairToCenter, startPlayPair]);
```

`SentencePairCard` 侧接线（照最终版源码）：卡片右侧 `mini-audio-button` + `mini-audio-progress`（range + 填充条），`handlePlayToggle` 调 `playVoicevox(pair.japanese, voicevoxSpeakerId, pair.id, {speedScale, pitchScale, volumeScale})`（点击处 `e.stopPropagation()` 防触发卡片选中），`subscribeVoicevoxPlayback` 订阅后按 `state.pairId === pair.id` 过滤自己的播放态（isPlaying/isLoading/currentTime/duration），`isActiveAudio` 时按钮变暂停、进度条可 `seekVoicevox` 拖动。

**验证（行为级）：**
- `pnpm dev` 后点任意句子播放按钮 → 出声；再点 → 暂停；进度条可拖动 seek
- 按 `r` 开启连续朗读 → 播完一句自动下一句并滚动居中；最后一句自然停止；Esc/停止立即中断无残留
- 连读时 Network 观察：当前句播放时后续 N 句请求已提前发出（预取）；重复播放同一句零网络请求（缓存命中）

## Step 7 · 设置面板：TTS 引擎切换（VoiceSettingsPanel 最小版）

**做什么：** 给 `settingsSlice` 补 TTS 字段，新建 `VoiceSettingsPanel.tsx`（最小版：引擎切换 + 双层缓存状态），并在 `SettingsModal` 加「语音」tab。

**settingsSlice 追加（M4 的 AI 配置之后）：**

```ts
export type TTSProviderType = 'microsoft' | 'voicevox';
// SettingsState 接口追加：
ttsProvider: TTSProviderType;
voicevoxSpeakerId: number;
voicevoxSpeed: number;
voicevoxPitch: number;
voicevoxVolume: number;
voicevoxPrefetchWindow: number;
voicevoxCacheLimitMB: number;
setTtsProvider: (provider: TTSProviderType) => void;
setVoicevoxSpeakerId: (speakerId: number) => void;
setVoicevoxSpeed: (speed: number) => void;
setVoicevoxPitch: (pitch: number) => void;
setVoicevoxVolume: (volume: number) => void;
setVoicevoxPrefetchWindow: (window: number) => void;
setVoicevoxCacheLimitMB: (mb: number) => void;
// 初始值与 setter（初值：voicevox / 1 / 1 / 0 / 1 / 4 / 80；setter 各带区间钳制）：
ttsProvider: 'voicevox' as TTSProviderType,
voicevoxSpeakerId: 1,
voicevoxSpeed: 1,
voicevoxPitch: 0,
voicevoxVolume: 1,
voicevoxPrefetchWindow: 4,
voicevoxCacheLimitMB: 80,
setTtsProvider: (provider) => set({ ttsProvider: provider }),
setVoicevoxSpeakerId: (speakerId) => set({ voicevoxSpeakerId: speakerId }),
setVoicevoxSpeed: (speed) => set({ voicevoxSpeed: Math.max(0.5, Math.min(2, speed)) }),
setVoicevoxPitch: (pitch) => set({ voicevoxPitch: Math.max(-0.15, Math.min(0.15, pitch)) }),
setVoicevoxVolume: (volume) => set({ voicevoxVolume: Math.max(0.2, Math.min(2, volume)) }),
setVoicevoxPrefetchWindow: (window) => set({ voicevoxPrefetchWindow: Math.max(1, Math.min(10, Math.round(window))) }),
setVoicevoxCacheLimitMB: (mb) => set({ voicevoxCacheLimitMB: Math.max(16, Math.min(512, Math.round(mb))) }),
```

**VoiceSettingsPanel.tsx（最小版，`src/components/settings/` 新建）：**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useSettingsStore, type TTSProviderType } from '../../stores/settingsSlice';
import {
  clearVoicevoxCache,
  getVoicevoxCacheStats,
  getVoicevoxSpeakers,
  type VoicevoxSpeaker,
} from '../../lib/tts/voicevox';

type ServerCacheStats = { items: number; totalBytes: number; maxBytes: number; hits: number; misses: number; evictions: number };

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VoiceSettingsPanel() {
  const { ttsProvider, setTtsProvider, voicevoxSpeakerId, setVoicevoxSpeakerId } = useSettingsStore();

  const [voicevoxSpeakers, setVoicevoxSpeakers] = useState<VoicevoxSpeaker[]>([]);
  const [localStatsText, setLocalStatsText] = useState('');
  const [serverStats, setServerStats] = useState<ServerCacheStats | null>(null);

  const speakerOptions = useMemo(
    () =>
      voicevoxSpeakers.flatMap((speaker) =>
        speaker.styles.map((style) => ({
          id: style.id,
          label: `${speaker.name} / ${style.name}`,
        }))
      ),
    [voicevoxSpeakers]
  );

  const refreshStats = async () => {
    const local = getVoicevoxCacheStats();
    setLocalStatsText(
      `前端缓存：${formatMB(local.totalBytes)} / ${formatMB(local.maxBytes)}，条目 ${local.items}，命中 ${local.hits}，未命中 ${local.misses}`
    );
    try {
      const response = await fetch('/api/tts/cache/stats');
      if (!response.ok) return;
      setServerStats((await response.json()) as ServerCacheStats);
    } catch {
      // silent
    }
  };

  const clearBothCaches = async () => {
    clearVoicevoxCache();
    try { await fetch('/api/tts/cache/clear', { method: 'POST' }); } catch { /* silent */ }
    await refreshStats();
  };

  useEffect(() => {
    let cancelled = false;
    if (ttsProvider === 'voicevox') {
      const loadSpeakers = async () => {
        try {
          const speakers = await getVoicevoxSpeakers();
          if (!cancelled) setVoicevoxSpeakers(speakers);
        } catch (error) {
          console.error('Failed to load VOICEVOX speakers:', error);
        }
      };
      void loadSpeakers();
    }
    void refreshStats();
    return () => { cancelled = true; };
  }, [ttsProvider]);

  return (
    <div className="space-y-5">
      <div>
        <label className="settings-label">TTS 引擎</label>
        <select
          value={ttsProvider}
          onChange={(e) => setTtsProvider(e.target.value as TTSProviderType)}
          className="settings-input"
        >
          <option value="voicevox">VOICEVOX</option>
          <option value="microsoft">Microsoft TTS（免费）</option>
        </select>
      </div>

      {ttsProvider === 'microsoft' && (
        <p className="settings-note">Microsoft TTS 使用 Edge 浏览器内置的免费语音合成，无需额外配置。</p>
      )}

      {ttsProvider === 'voicevox' && (
        <div>
          <label className="settings-label">VOICEVOX 声音（全局）</label>
          <select
            value={voicevoxSpeakerId}
            onChange={(e) => setVoicevoxSpeakerId(Number(e.target.value))}
            className="settings-input"
          >
            {speakerOptions.length > 0 ? (
              speakerOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))
            ) : (
              <option value={voicevoxSpeakerId}>声音 {voicevoxSpeakerId}</option>
            )}
          </select>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="settings-label !mb-0">缓存状态</label>
          <button className="settings-mini-btn" onClick={() => void refreshStats()}>刷新</button>
        </div>
        <p className="settings-note">{localStatsText || '前端缓存：读取中...'}</p>
        <p className="settings-note">
          {serverStats
            ? `服务端缓存：${formatMB(serverStats.totalBytes)} / ${formatMB(serverStats.maxBytes)}，条目 ${serverStats.items}，命中 ${serverStats.hits}，未命中 ${serverStats.misses}`
            : '服务端缓存：读取中...'}
        </p>
        <div className="flex justify-end">
          <button className="settings-mini-btn danger" onClick={() => void clearBothCaches()}>
            清空前后端缓存
          </button>
        </div>
      </div>
    </div>
  );
}
```

**SettingsModal 加 tab（M4 版本上追加）：** `type SettingsTab = 'ai' | 'voice'`；tab 区加「语音」按钮；内容区 `activeTab === 'ai' ? <AISettingsPanel /> : <VoiceSettingsPanel />`。

**讲解：** 「引擎切换无需重启」的奥秘：`ttsProvider` 存在 store 里，`getCurrentTtsProvider()` 每次取键/请求时实时读它——切换后下一次播放自然走新引擎。缓存统计面板直接消费 Step 4/Step 6 的 stats 接口，清空按钮同时打两边。

**验证：** 设置里切引擎 → 播放按钮立刻换引擎出声（Network 可见 `/api/tts/microsoft` ↔ `/api/tts/voicevox` 变化）；缓存两行数字随播放增长；清空后重新播放重新请求；VOICEVOX 引擎未启动时错误文案可读、不崩。

## 收尾验收清单

- [ ] `curl POST /api/tts/microsoft` 首请求 `X-TTS-Cache: MISS`，同参数再发 `HIT` 且产物字节一致；改任一韵律参数 → 新键（MISS）
- [ ] `/cache/stats`、`/cache/clear` 不被 `/:provider` 吞掉；缺 `text` 返回 400；stats 六项数字可观测
- [ ] 前端播放单例：播放/暂停/seek 正常，换句自动打断上一句；重复播放同一句零网络请求
- [ ] `r` 连续朗读：自动下一句 + 滚动居中；最后一句自然终止；Esc/停止立即中断
- [ ] 预取：当前句播放时后续 N 句请求已提前发出；预取失败不阻塞主链路
- [ ] 设置面板切引擎即时生效；清空缓存后重新请求
- [ ] 能画出双层缓存读写路径（客户端缓存 → 服务端缓存 → 引擎）与 Blob URL 创建/释放配对
- [ ] 能说出：为什么按字节管理缓存 / 为什么键含五维 / 为什么客户端不哈希而服务端哈希

## 与最终代码的差异复盘

1. `server/tts/index.ts`——本卡即最终版。已知缺口：服务端无请求去重（`voicePending` 只在客户端），同键并发双写浪费一次合成——单用户可容忍，多用户再上 `pendingMap`。
2. `src/lib/tts/voicevox.ts`——本卡给全核心；最终版还含 `toggleVoicevoxPause`/`seekVoicevox`/`setVoicevoxCacheLimit`/`getVoicevoxSpeakers`/`clearVoicevoxCache`（一行一组已列出）。`getVoicevoxSpeakers` 的 `speakersRequest` 单飞与 `ensureVoiceUrl` 同构。
3. `VoiceSettingsPanel`——本卡是**最小版**；最终版加语速/音高/音量滑杆、预取句数、缓存上限设置（store 字段本卡已全建，UI 照 range/number 输入补即可）。
4. `ReadingView`——最终版还有缓存日志（`console.debug`）、切章清缓存、`setVoicevoxCacheLimit` 同步；`SentencePairCard` 的按钮/进度条 JSX 在最终版源码直接照抄。
5. M11 部署里程碑会在 docker-compose 加 `voicevox` profile（按需启停本地引擎）与 `TTS_CACHE_MAX_BYTES`/`TTS_DEFAULT_PROVIDER` 环境变量，`.env.example` 同步补上。

## 设计注记（历史弯路）

- **VOICEVOX 先行、Microsoft 后补**（c31af75 → b1b0206）：最初只有本地 VOICEVOX（纯本地工具时期），Microsoft TTS 是**部署里程碑**才补的——部署后「免配置、免 2GB 引擎」变成刚需。复刻反过来也成立：先微软验证全链路、再补 VOICEVOX（本卡即微软先行）。
- **缓存与预取是后加的工程化**：初版 TTS 没缓存，每点一次合成一次，连续朗读卡顿明显——缓存（L27 服务端 / L28 客户端）和预取是性能问题逼出来的。印证 M0 教训：先跑通最小链路，再按真实瓶颈优化。
- **双层缓存键同构但实现不同**：服务端 SHA1 压缩（防任意长文本撑爆 Map 键）、客户端裸字符串（条目少、调试可读）——同一问题两侧答案不同，面试可讲。
- **TTS 挂 ai 子应用、位于限流之后**：合成请求也受 M4 的 30 次/分钟限流保护；合成错误统一 500 + 透传引擎 detail，前端播放失败只 `console.error` 不崩 UI。

## 下一步

进入 [M9 · 书架与多书管理](./M09-bookshelf.md)——练习、书签、TTS 都按书与章节归属，书架页成为新的入口。
