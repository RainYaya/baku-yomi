# baku-yomi

> **双語回訳** — AI 辅助的日语双语阅读器，通过回译练习学日语。

[English](#english) | [中文](#中文)

<!-- TODO: add screenshot here -->
<!-- ![baku-yomi screenshot](docs/screenshot.png) -->

---

## 中文

导入双语 EPUB，逐句阅读日语原文和中文翻译，尝试用日语回译中文，AI 会分析你的翻译质量并给出改进建议。

### 功能

- **双语对照阅读** — 日语原文 + 中文翻译逐句对齐显示
- **回译练习** — 看中文写日语，AI 打分和纠错
- **TTS 朗读** — Microsoft Edge TTS（免费，无需配置）或 VOICEVOX 日语语音
- **连续朗读** — 一键自动逐句播放，支持预取和缓存
- **书签高亮** — 选中文字标记颜色，方便复习
- **6 种主题** — 夜间 / 月光 / 日间 / 阳光 / 雨天 / 雪天，带 Canvas 动态特效
- **BYOK 模式** — 自带 AI Key（OpenAI / Anthropic / Google），密钥只存浏览器本地

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

1. 打开页面，点击「导入 EPUB」上传双语 EPUB 文件
2. 在设置中配置 AI API Key
3. 从侧栏选择章节开始阅读
4. 点击句子打开练习面板，输入日语回译，提交 AI 分析

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
- **Back-translation practice** — Write Japanese from Chinese, get AI scoring and corrections
- **TTS read-aloud** — Microsoft Edge TTS (free) or VOICEVOX Japanese voices
- **Continuous reading** — Auto-play sentences with prefetch and caching
- **Text bookmarks** — Highlight and color-code text for review
- **6 themes** — Night / Moonlight / Day / Sunny / Rain / Snow with animated canvas overlays
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

1. Open the app and click **Import EPUB** to upload a bilingual EPUB
2. Go to **Settings** and enter your AI API key
3. Select a chapter from the sidebar
4. Click a sentence to open the practice panel, write your back-translation, and submit for AI analysis

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
