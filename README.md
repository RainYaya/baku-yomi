# baku-yomi

> **双語回訳** — AI 辅助的日语双语阅读器，通过回译练习学日语。

[English](#english) | [中文](#中文)

<!-- TODO: add screenshot here -->
<!-- ![baku-yomi screenshot](docs/screenshot.png) -->

---

## 中文

导入双语 EPUB，逐句阅读日语原文和中文翻译，尝试用日语回译中文，AI 会分析你的翻译质量并给出改进建议。

> 换一台电脑继续开发？先读 [交接文档](docs/HANDOFF.md)：环境、代码地图、数据模型、设计系统、部署都在里面。

### 功能

- **双语对照阅读** — 日语原文 + 中文翻译逐句对齐显示
- **材料聚合** — EPUB / 粘贴 / URL / 合集 / note 短文 / AI 情景 / SRT·VTT 字幕 / 视频，同一个材料库按来源筛选
- **note 阅读源** — 话题或作者的最新文章，点开才抓正文，可翻译、存生词
- **AI 情景材料** — 描述场景（如「在日本买衣服」），生成双语对话，预览可改后保存
- **字幕导入** — `.srt` / `.vtt`，双语自动配对，单语日语也可读
- **视频材料** — YouTube 只取日文字幕，或本地 mp4/webm/mov + 外挂字幕；文稿按时间轴跟播，当前句可讲解、练习。本地视频不复制、不上传，下次打开重新授权文件即可
- **练习记录** — 所有材料的批改汇总，可按材料/来源/分数/错误筛选，展开看每次回译
- **随机练习** — 从全部或指定材料随机抽一句，避开最近抽过的句子
- **回译练习** — 看中文写日语，AI 打分和纠错
- **TTS 朗读** — Microsoft Edge TTS（免费，无需配置）或 VOICEVOX 日语语音
- **连续朗读** — 一键自动逐句播放，支持预取和缓存
- **书签高亮** — 选中文字标记颜色，方便复习
- **双主题** — paper（纸页）/ night（夜读），移动端单栏
- **BYOK 模式** — 自带 AI Key（OpenAI / Anthropic / Google），密钥只存浏览器本地；也内置免 key 的免费供应商

### 快速开始

#### 前提条件

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/)
- AI API Key（OpenAI / Anthropic / Google 任选一个）

#### 本地开发

```bash
git clone https://github.com/YOUR_USERNAME/baku-yomi.git
cd baku-yomi
pnpm install
pnpm dev
```

前端 `http://localhost:5174`，API `http://localhost:3003`。

#### 生产部署

```bash
pnpm build
pnpm start
# → http://localhost:3003
```

#### Docker 部署

```bash
# 默认（Microsoft TTS，免费）
docker compose up

# 带 VOICEVOX 语音引擎
docker compose --profile voicevox up
```

详见 [自托管部署指南](docs/self-hosting.md)。

### 使用方法

1. 点「添加材料」：导入 EPUB、粘贴文本/URL、导入字幕、导入视频，或让 AI 按情景生成材料
2. 在设置中选择 AI 供应商（内置免 key 供应商，也可填自己的 Key）
3. 从首页或材料库打开材料开始阅读；视频书按时间轴跟播，点句可跳转
4. 点击句子打开练习面板，输入日语回译，提交 AI 分析
5. 在「练习记录」里查看所有材料的练习，或点「随机练一句」抽一句复习

> YouTube 字幕需要本机安装 `yt-dlp`；没有时仍可只导入字幕，或改用本地视频 + 字幕文件。

> 想每天读天声人语这类文章：新建一个合集，每天把 URL 或正文追加进去即可。baku-yomi 不会自动抓取报纸/专栏，也不绕过付费墙。

### 快捷键

| 键 | 功能 |
|----|------|
| `j` / `k` | 选择下一句 / 上一句 |
| `r` | 开启 / 停止连续朗读 |
| `gi` | 进入输入框 |
| `Esc` | 退出输入 / 关闭面板 |
| `N` `M` `D` `S` `W` | 切换主题 |

---

## English

Import bilingual EPUB books, read Japanese with aligned Chinese translations, then practice by back-translating Chinese into Japanese. AI analyzes your translation and provides detailed feedback.

### Features

- **Bilingual reading** — Japanese + Chinese sentence-aligned display
- **Material library** — EPUB / pasted text / URLs / collections / note articles / AI scenarios / subtitle files / videos, filterable by source
- **Video material** — YouTube transcripts (subtitles only) or a local mp4/webm/mov with subtitle files; the transcript follows playback and the current line can be explained or practiced. Local videos are never copied or uploaded
- **Back-translation practice** — Write Japanese from Chinese, get AI scoring and corrections
- **TTS read-aloud** — Microsoft Edge TTS (free) or VOICEVOX Japanese voices
- **Continuous reading** — Auto-play sentences with prefetch and caching
- **Text bookmarks** — Highlight and color-code text for review
- **Two themes** — paper (day) / night with a single-column mobile layout
- **BYOK** — Bring your own AI key (OpenAI / Anthropic / Google). Keys never leave your browser.

### Quick Start

#### Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/)
- An AI API key (OpenAI / Anthropic / Google — pick one)

#### Development

```bash
git clone https://github.com/YOUR_USERNAME/baku-yomi.git
cd baku-yomi
pnpm install
pnpm dev
```

Frontend on `http://localhost:5174`, API on `http://localhost:3003`.

#### Production

```bash
pnpm build
pnpm start
# → http://localhost:3003
```

#### Docker

```bash
# With Microsoft TTS (default, free)
docker compose up

# With VOICEVOX voices
docker compose --profile voicevox up
```

See the [self-hosting guide](docs/self-hosting.md) for details.

### Usage

1. Open the app and click **Add material** to import an EPUB, paste text, add a URL, import subtitles or a video, or generate an AI scenario
2. Go to **Settings** and enter your AI API key
3. Open a material; for videos, click a transcript line to seek
4. Click a sentence to open the practice panel, write your back-translation, and submit for AI analysis
5. Review all practice in **Practice log**, or draw a random sentence

> YouTube transcripts require `yt-dlp` on the machine running the API. Without it you can still import subtitle files, or use a local video with subtitles.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` / `k` | Next / previous sentence |
| `r` | Toggle continuous read-aloud |
| `gi` | Focus input field |
| `Esc` | Exit input / close panel |
| `N` `M` `D` `S` `W` | Switch themes |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Zustand, Tailwind CSS 4, Vite |
| Backend | Hono (Node.js) |
| AI | Vercel AI SDK (OpenAI / Anthropic / Google) |
| TTS | msedge-tts (free), VOICEVOX (optional) |
| EPUB | @lingo-reader/epub-parser |

## Project Structure

```
src/
  components/     # React UI components
  hooks/          # Custom React hooks
  lib/            # Core logic (AI, EPUB parsing, TTS)
  stores/         # Zustand state management
  theme/          # Theme system with canvas overlays
  types/          # TypeScript definitions
server/
  routes/         # API endpoints
  tts/            # TTS providers (Microsoft, VOICEVOX)
docs/             # Documentation
```

## Environment Variables

See [.env.example](.env.example).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
