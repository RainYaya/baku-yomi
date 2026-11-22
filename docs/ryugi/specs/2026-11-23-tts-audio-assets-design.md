# baku-yomi · 整书预生成语音（TTS 音频资产）· Design

> 日期：2026-11-23
> 状态：草稿，待用户确认
> 分支：`feat/tts-audio-assets`
> 前置：EPUB 导入（`src/lib/epub/parser.ts`）、现有 TTS provider（`server/tts/`）、阅读器连续朗读（`src/components/reader/ReadingView.tsx`）、备份导出（`src/lib/storage.ts`）
> 一句话：把 EPUB 长篇小说的语音**一次性预生成成“按章一个音频文件 + 句级时间戳”的资产**，让阅读器像视频页一样按时间轴跟读；生成放在用户自己的 GPU 电脑上，Ally 只负责存储和播放。

---

## 1. 为什么做

现在的 TTS 是“点一句、合成一句”。短文章够用，但长篇小说的场景完全不同：

1. VOICEVOX 的音色对长时间听读不够自然，用户明确不满意。
2. 高质量模型（GPT-SoVITS、VoiceStudio 里的 OmniVoice 等）都跑在 GPU 上，Ally 只有 CPU 和 5GB WSL 内存。
3. 整本书重复合成很浪费；用户希望“生成一次，之后任何设备都能听”。
4. 用户有一台 4080 Super 台式机，但不是常开；播放不应依赖它在线。

所以把 TTS 从“运行时服务”改成“材料资产”：生成是离线批处理，播放是本地文件。

---

## 2. 已定的方向

| 决定 | 选择 | 理由 |
| --- | --- | --- |
| 主要场景 | 整本 EPUB 小说 | 短文章继续用现有按需 TTS，不为它做批处理 |
| 音频形态 | 一章一个文件 + 句级时间戳 | 避免一句一个文件（3 万句 ≈ 120MB 块开销）；时间戳复用视频的 `startMs/endMs` 思路 |
| 生成位置 | 用户的 4080 台式机 | Ally CPU 跑不动高质量模型；4080 不常开也不影响播放 |
| 存储位置 | Ally 服务端磁盘 | localStorage 只有 5MB；音频必须落盘 |
| 资产标识 | 章节日文文本的内容哈希 | 同一本书在不同设备/不同导入 id 下也能命中同一份音频 |
| 书数据模型 | 第一版不改 `Book` | 客户端按章哈希向服务端查询可用资产，避免几万个时间戳进 localStorage |
| 播放入口 | 复用现有「朗读整章」 | 已有连续朗读、逐句播放和键盘快捷键，不新造一套播放器 |
| 编码 | Opus 24–32kbps 单声道，默认 24kbps | 10 小时约 108MB；语音质量足够；AAC 作为 Safari 备选 |
| 删除策略 | 手动删除 + 配额提示，不静默 LRU | 音频是材料资产，静默删除会让用户以为书坏了 |

---

## 3. 范围

### 3.1 目标

- 在 4080 上用一个命令行工具，把备份 JSON 里的一本书按章合成语音。
- 每章输出一个 Opus 文件和一个 manifest，包含每句的起止毫秒。
- 资产按内容哈希索引，上传到 Ally 的资产目录后，任何设备打开同一本书都能发现并播放。
- 阅读器：
  - 「朗读整章」优先播放预生成音频，没有资产时回退现有按需 TTS。
  - 当前句跟随音频时间高亮/滚动。
  - 点击某句的播放按钮，跳到该句的 `startMs` 并只播放这一句。
  - 支持语速调节（`playbackRate`，不改音高）。
- 服务端：
  - 资产清单查询、音频流（支持 HTTP Range，能拖动进度）。
  - 用量统计、按书/按章删除。
- 磁盘占用可见：每本书多少 MB、总用量、配额警告。

### 3.2 非目标

- 不做运行时的高质量 TTS 替换；现有 provider 保留给短文本和回退。
- 不做逐词/卡拉 OK 时间戳。
- 不做多角色配音（旁白 + 对白分音色）；第一版整本一个旁白音色。
- 不做 4080 在线检测、自动排队、开机自动补生成。
- 不做浏览器端音频编辑或重新切分。
- 不把音频放进备份 JSON、localStorage 或 IndexedDB。
- 不做移动端离线下载；音频通过服务端流式播放。

### 3.3 反目标

- 不把 baku-yomi 变成有声书播放器；文字、生词、练习仍是主角，音频是辅助。
- 不让播放依赖 4080 在线。
- 不为了省事把整本书塞进一个超大文件；按章切分才能局部重生成和快速 seek。
- 不把时间戳写进书库持久化数据；manifest 是服务端资产的一部分。

---

## 4. 用户体验

### 4.1 生成（在 4080 上）

1. 在 baku-yomi 里「设置 → 数据 → 导出备份」，得到 `baku-yomi-backup-*.json`。
2. 在 4080 上运行：

   ```bash
   pnpm tts:book \
     --backup ~/Downloads/baku-yomi-backup-2026-11-23.json \
     --book "魔女の旅々１０" \
     --provider openai \
     --endpoint http://127.0.0.1:3900/v1/audio/speech \
     --voice <voice-id> \
     --out ./tts-out \
     --format opus --bitrate 24k
   ```

3. 工具逐章逐句合成，显示进度（章、句、已用时间、预计剩余）。
4. 完成后把 `./tts-out/` 同步到 Ally：

   ```bash
   rsync -a ./tts-out/ yaya@192.168.210.203:~/baku-yomi-data/tts-assets/
   ```

5. 回到 baku-yomi，打开这本书；阅读器底部出现「有声书 · 音色名」和时长。

### 4.2 播放（任何设备）

- 打开有资产的章节，「朗读整章」直接播放，不再逐句请求 TTS。
- 当前句随音频高亮并滚动（受「跟随」开关控制）。
- 点击句子旁的播放按钮：seek 到该句起点，播到 `endMs` 自动停。
- 底部显示：播放/暂停、当前时间/本章时长、语速、音色、资产状态。
- 语速用 `audio.playbackRate`（0.75–1.5），不重新生成。
- 一章播完自动进入下一章；下一章没有资产时停止并提示。

### 4.3 没有资产时

- 阅读器行为完全不变：继续用现有按需 TTS。
- 「朗读整章」旁显示「未生成整书语音」的轻提示，不阻塞阅读。
- 部分章节有资产时：有资产的章用文件播放，其余章回退按需 TTS，并在章节头标注。

### 4.4 管理

- 设置里新增「语音资产」区块：
  - 总用量 / 配额（默认 10GB）。
  - 每本书：标题、音色、章数、总时长、占用、删除按钮。
  - 孤儿资产（书已删除或文本已改）：列出并可清理。
- 达到配额 80% 时提示，不自动删除。

### 4.5 视觉

沿用现有阅读器设计系统，不引入新方向：

- 播放控件放在现有 `.read-foot` 内，使用现有按钮与配色。
- 资产状态用文本 + 现有 muted 色，不加新色板。
- 句子高亮复用阅读器当前句样式，不新增强调色。

---

## 5. 数据与存储

### 5.1 内容哈希

- 章节日文文本：按 pair 顺序取 `pair.japanese`，NFC 规范化，逐行 trim，用 `\n` 连接。
- `chapterHash = sha256(规范化文本)`。
- `assetId = sha256(chapterHash + "\n" + engine + "\n" + model + "\n" + voice + "\n" + format + "\n" + bitrate)`。
- `bookHash = sha256(各章 chapterHash 按章节顺序用 "\n" 连接)`；用于记住每本书选过的音色，加/删章会改变它（重新选一次音色即可）。
- 语速不进哈希：文件按 1.0 生成，播放时用 `playbackRate`。
- 文本改动 → 哈希变化 → 旧资产成为孤儿，由管理界面清理。
- **SHA-256 用 `@noble/hashes` 的纯 JS 实现，不用 `crypto.subtle`**：局域网通过 `http://192.168.210.203:3003` 访问时不是安全上下文，`crypto.subtle` 不存在；纯 JS 实现让浏览器和 Node CLI 得到完全一致的哈希。

### 5.2 资产目录

```
~/baku-yomi-data/tts-assets/
  <assetId>/
    manifest.json
    audio.opus
```

`manifest.json`：

```json
{
  "version": 1,
  "assetId": "sha256…",
  "chapterHash": "sha256…",
  "engine": "gpt-sovits",
  "model": "v5",
  "voice": "narrator-a",
  "bookTitle": "魔女の旅々１０",
  "language": "ja",
  "format": "opus",
  "bitrate": "24k",
  "sampleRate": 24000,
  "durationMs": 1234567,
  "textLength": 8421,
  "createdAt": "2026-11-23T12:00:00Z",
  "pairs": [
    { "index": 0, "startMs": 0, "endMs": 3120 },
    { "index": 1, "startMs": 3120, "endMs": 5870 }
  ]
}
```

- 用 `index` 而不是 `pairId`：不同设备导入同一本书时 pair id 不同，顺序稳定。
- `pairs` 只存在服务端；客户端按需读取。

### 5.3 书数据模型

第一版**不改** `Book` / `BookSource`。流程：

1. 打开一本书时，客户端算出每章的 `chapterHash` 和整本的 `bookHash`。
2. `POST /api/tts/assets/query`，body `{ hashes: [h1, h2, …] }`（不用 GET：章节多时 URL 会超长）。
3. 服务端返回每个哈希可用的资产列表（可能有多个音色）。
4. 客户端选择：
   - 所有章都有同一 `(engine, model, voice)` → 整本可播。
   - 部分章有 → 逐章可用。
   - 记住用户选的音色：`settings.audioVoiceByBookHash: Record<bookHash, string>`。
5. 资产删除后，下次打开自然查不到，不需要清理书数据。

**归属与删除语义**：服务端不维护“书 → 资产”的关系，只按章哈希索引；manifest 里的 `bookTitle` 只用于显示。管理界面由客户端用当前设备的书分组：

- 某本书的音频 = 该书各章 `chapterHash` 对应的资产。
- “删除这本书的音频” = 对这些 `assetId` 逐个调用 DELETE；如果某章音频同时被另一本书或另一台设备使用，会一并失效，删除前提示这一点。
- 孤儿 = 服务端存在、但本设备当前没有任何章节匹配的资产；显示为“本设备未关联”，只允许手动确认删除，绝不自动清理（另一台设备的书可能正在用）。

需要“书自带音频、可随备份迁移”时，再进入第二阶段：在 `BookSource` 增加 `audio?: { assetId, voice, format }`，并把 manifest 一起导出。第一版不做。

### 5.4 服务端接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/tts/assets/query` | 按章哈希批量查询可用资产 |
| GET | `/api/tts/assets` | 列出全部资产（管理界面用，含 `bookTitle`、大小、`lastAccessAt`） |
| GET | `/api/tts/assets/:assetId/manifest` | 读取 manifest |
| GET | `/api/tts/assets/:assetId/audio` | 音频流，支持 `Range`，返回 206 |
| GET | `/api/tts/assets/usage` | 总用量、配额、按资产占用 |
| DELETE | `/api/tts/assets/:assetId` | 删除单个资产 |

- 资产目录由 `TTS_ASSET_DIR` 配置，默认 `~/baku-yomi-data/tts-assets`。
- 音频不做内存缓存；直接流式读文件，支持 `Range: bytes=…`。
- 访问统计写入 `index.json`（assetId → lastAccessAt），用于管理界面排序，**不用于自动删除**。
- 上传不通过 HTTP API：第一版用 `rsync`/`scp`，避免给服务端加写接口和鉴权。
- 配额是建议值，不是强制：上传绕过服务端，服务端只能统计；CLI 可选 `--server` 在上传前查询用量并警告。

### 5.5 用量与体积（2026-11-23 实测）

- Ally Windows C: 剩余约 **36.8GiB**；WSL 虚拟盘上限 945GiB 不代表宿主机空间。
- 10 小时音频：

| 格式 | 大小 |
| --- | --- |
| WAV 24kHz 16bit | 1.7GB |
| MP3 128kbps | 576MB |
| AAC 48kbps | 216MB |
| Opus 32kbps | 144MB |
| Opus 24kbps | 108MB |
| Opus 16kbps | 72MB |

- 默认配额 10GB ≈ 90 本 10 小时小说（Opus 24k）。
- 一章一个文件：3 万句的书约 20–40 个文件，而不是 3 万个。
- WSL vhdx 删除文件后不会自动缩小；大量删除后需要 `wsl --manage <distro> --set-sparse true` 或手动 compact。文档中提示。

---

## 6. 生成管线

### 6.1 工具位置

`tools/tts-book/`（Node ESM，和主项目共用 TypeScript/tsx 运行方式）。

职责：

1. 读备份 JSON，找到目标书：备份结构是 `{ app, version, exportedAt, data }`，书库在 `data['book-store'].state.books`；取出各章 `pairs`。
2. 对每个 pair 调用 provider，得到音频字节。
3. 用 ffmpeg/ffprobe：
   - 统一采样率、单声道；
   - 测量每句时长；
   - 顺序拼接；
   - 输出一章一个 Opus 文件。
4. 写 manifest（累计 `startMs/endMs`）。
5. 已存在且哈希相同的资产跳过（可断点续跑）。
6. 中途失败保留已完成章节；重新运行只补缺失章。

### 6.2 Provider 适配

第一版只做 **OpenAI 兼容**：

```http
POST {endpoint}
Authorization: Bearer {key}
Content-Type: application/json

{ "model": "...", "voice": "...", "input": "一句日文", "language": "ja", "response_format": "wav", "speed": 1.0 }
```

适配 VoiceStudio（`:3900/v1/audio/speech`）和任何同协议服务。阶段 0 如果选 GPT-SoVITS 且它只有原生 `/tts`，先在工具内加一个 adapter（参数映射、ref audio、语言代码），再进入阶段 3；`engine` / `model` / `voice` 的取值由 CLI 参数决定，写进 manifest 和 `assetId`。

### 6.3 4080 环境要求

- Windows + Node 20+、ffmpeg（含 ffprobe）。
- TTS 服务在本机监听（例如 VoiceStudio Docker `127.0.0.1:3900`）。
- 生成期间不需要 Ally 可达；完成后一次性 rsync。

### 6.4 失败与重试

- 单句失败重试 2 次，仍失败则记录章/句索引，跳过该句并在 manifest 标记 `missing: true`。
- 有缺失句的章不写正式资产（避免时间轴错位），保留失败清单供重跑。
- 进程中断：临时文件写在 `out/.work/`，下次启动清理。

---

## 7. 播放实现

- 复用 `src/lib/video/timeline.ts` 的时间查找思路，抽成通用 `pairIndexAtTime(pairs, ms)`（已有实现，可直接用）。
- 客户端维护一个 `HTMLAudioElement`，切章时换 `src`。
- 播放状态接入现有 `autoReadMachine`，新增事件：`PLAY_ASSET`、`SEEK_PAIR`、`CHAPTER_ENDED`。
- 当前句：`currentMs` 由 `timeupdate` 驱动，找到 `startMs <= t < endMs` 的 pair。
- 单句播放：`seek(startMs)`，在 `endMs` 处暂停。
- 整章播放：不按句暂停；到文件末尾自动下一章。
- 语速：`playbackRate`；音高不变。
- 回退：资产不存在或加载失败 → 走现有按需 TTS，并提示一次。

---

## 8. 风险与限制

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 日文自然度未验证 | 可能白做 | 先做第 0 阶段：一章试听，满意再继续 |
| 逐句合成导致语调断裂 | 长文听感差 | 第一版接受；后续可试“按段合成 + 句内按字数估时” |
| Opus 在 Safari/iOS 的支持 | 部分设备不能播 | 提供 `--format m4a`（AAC 48k）选项 |
| 4080 不常开 | 无法生成新书 | 播放不依赖它；生成是手动批处理 |
| Ally 磁盘有限 | 配额被占满 | 默认 10GB、用量可见、手动删除、孤儿清理 |
| WSL vhdx 不自动缩小 | 删除后宿主空间不回收 | 文档提示 compact |
| 文本修改导致资产失效 | 旧音频成孤儿 | 哈希变化即失配；管理界面列出孤儿 |
| 模型/权重许可证 | 分发受限 | VoiceStudio 默认权重 CC-BY-NC；个人使用可以，公开分发需重新评估 |
| 多音色/多角色 | 小说对白单一旁白 | 第一版单旁白；多角色是后续独立项目 |

---

## 9. 实施顺序

1. **阶段 0 · 听感验证（在 4080 上，不写代码）**
   - 选一本日语小说的一章，用 GPT-SoVITS 或 VoiceStudio 生成 3–5 句。
   - 确认音色、自然度、语速可控；记录单句耗时。
   - 不满意就停止，不进入实现。
2. **阶段 1 · 哈希与 manifest**
   - 新增依赖 `@noble/hashes`（纯 JS SHA-256，浏览器和 Node 通用）。
   - `src/lib/tts/assetHash.ts`：规范化、chapterHash、assetId、bookHash。
   - 单测：同文本不同空白/换行一致；不同文本不同；NFC 归一；浏览器与 Node 结果一致。
3. **阶段 2 · 服务端资产库**
   - 目录扫描、查询、manifest、Range 流、用量、删除。
   - 测试：Range 206、越界 416、缺失 404、用量统计。
   - 新增路由后需要重启 `baku-yomi.service`；若服务端引用 `src/lib/tts`，同步更新 Dockerfile 的 `COPY` 列表。
4. **阶段 3 · 生成 CLI**
   - 备份解析、provider 适配、ffmpeg 拼接、断点续跑。
   - 用 mock provider + 生成的静音 WAV 做端到端测试。
5. **阶段 4 · 客户端发现与播放**
   - 打开书时批量查资产；音频元素；`autoReadMachine` 新事件；逐句 seek。
   - 单测时间映射；浏览器验证一章播放、跳句、切章、回退。
6. **阶段 5 · 管理界面**
   - 用量、配额提示、按书删除、孤儿清理。
7. **阶段 6 · 真机验证**
   - 4080 生成一整章 → rsync → Ally → 浏览器播放；记录体积与耗时。

---

## 10. 验证

- `pnpm test`：哈希、manifest、时间映射、Range 解析、配额统计。
- `pnpm exec tsc -b`、`pnpm build`、ESLint。
- 浏览器（本地/线上）：
  - 有资产：整章播放、当前句跟随、点句跳转、语速、切章、刷新后仍可用。
  - 无资产：回退按需 TTS，行为与现在一致。
  - 部分资产：逐章回退并标注。
- 真机：4080 生成 → Ally 播放，确认音画（句）同步、文件大小与预估一致。

---

## 11. 由构建者决定

- 资产目录的具体布局（`<assetId>/` 还是 `<chapterHash>/<assetId>/`）。
- `index.json` 的写入时机与并发保护（单进程文件锁即可）。
- `autoReadMachine` 的事件命名与状态划分。
- 音频元素的复用方式（单例 vs 每章新建）。
- 生成工具的参数命名与日志格式。
- 是否把 `pairIndexAtTime` 从 `lib/video` 抽到通用 `lib/timeline`（建议抽）。

---

## 12. 留给用户确认的假设

1. **先试听哪个引擎**：GPT-SoVITS 的固定旁白音色，还是 VoiceStudio 的 OpenAI 兼容接口？工具两者都能接，但阶段 0 的试听对象不同；如果选 GPT-SoVITS 且它没有 OpenAI 兼容端点，阶段 3 前要先加 adapter。
2. **是否必须兼容 iPhone/Safari**：只在桌面 Chromium/Android 用，默认 Opus 24k；必须兼容 iOS 就默认 AAC 48k（m4a），体积约翻倍（10 小时约 216MB）。
3. **音频是否必须跟着书走**：第一版按哈希存在服务端，备份 JSON 不带音频引用，换服务器/恢复备份后需要重新 rsync。若必须随备份迁移，就要加 `BookSource.audio` 和导出格式，范围会明显变大。
4. **能否接受整本一个旁白音色**：小说对白不分角色。不能接受的话，多角色是另一个独立项目，建议先不做。
5. **10GB 默认配额是否合适**：超限只提示、手动删除；是否还需要“一键清理最久未听”。

---

## 13. 已使用的画板与文档

- 本设计未使用画板；UI 复用现有阅读器控件与设计 token。
- 相关既有文档：`docs/ryugi/specs/2026-11-22-video-material-design.md`（视频时间轴与按内容存储的先例）。
