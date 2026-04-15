# baku-yomi

**双語回訳** — AI 辅助的日语双语阅读器，通过「回译练习」帮助你学日语。

导入双语 EPUB，逐句阅读日语原文和中文翻译，然后尝试用日语回译中文，AI 会分析你的翻译质量并给出改进建议。

## 功能

- **双语对照阅读** — 日语原文 + 中文翻译逐句对齐显示
- **回译练习** — 看中文写日语，AI 打分和纠错
- **TTS 朗读** — Microsoft Edge TTS（免费）或 VOICEVOX 日语语音合成
- **连续朗读** — 一键自动逐句播放，支持预取和缓存
- **书签高亮** — 选中文字标记颜色，方便复习
- **主题切换** — 6 种主题（夜间 / 月光 / 日间 / 阳光 / 雨天 / 雪天），带动态特效
- **BYOK** — 自带 AI Key（OpenAI / Anthropic / Google），数据不经第三方

## 快速开始

### 本地开发

```bash
# 需要 Node.js >= 22, pnpm
pnpm install
pnpm dev
# 前端: http://localhost:5174  后端: http://localhost:3003
```

### 生产部署

```bash
pnpm build
pnpm start
# http://localhost:3003
```

### Docker

```bash
# 基础（Microsoft TTS）
docker compose up

# 带 VOICEVOX 语音
docker compose --profile voicevox up
```

详见 [自托管部署指南](docs/self-hosting.md)。

## 使用方法

1. 打开页面，点击「导入 EPUB」上传双语 EPUB 文件
2. 在设置中配置 AI API Key（OpenAI / Anthropic / Google 任选）
3. 选择章节开始阅读
4. 点击句子打开练习面板，输入日语回译，提交 AI 分析

## 快捷键

| 键 | 功能 |
|----|------|
| `j` / `k` | 选择下一句 / 上一句 |
| `r` | 开启 / 停止连续朗读 |
| `gi` | 进入输入框 |
| `Esc` | 退出输入 / 关闭面板 |
| `N` `M` `D` `S` `W` | 切换主题 |

## 技术栈

- **前端**: React 19 + Zustand + Tailwind CSS + Vite
- **后端**: Hono (Node.js)
- **AI**: Vercel AI SDK (OpenAI / Anthropic / Google)
- **TTS**: msedge-tts (免费) + VOICEVOX (可选)
- **EPUB**: @lingo-reader/epub-parser

## 环境变量

参考 [.env.example](.env.example)。

## License

MIT
