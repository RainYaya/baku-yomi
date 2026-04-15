# baku-yomi 自托管部署指南

baku-yomi 是一款 AI 辅助的日语阅读器。你可以在自己的电脑上一键运行。

## 前提条件

- 安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)（Windows / macOS / Linux 均可）
- 准备一个 AI API Key（OpenAI / Anthropic / Google 任选其一）

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/your-org/baku-yomi.git
cd baku-yomi
```

### 2. 启动服务

```bash
docker compose up -d
```

等待构建完成后，打开浏览器访问：

```
http://localhost:3003
```

### 3. 配置 AI

首次打开页面后，点击右上角设置图标，填入你的 AI API Key 即可开始使用。

> baku-yomi 采用 BYOK（Bring Your Own Key）模式，你的 API Key 只存在浏览器本地，不会发送到任何第三方服务器。

---

## 启用 VOICEVOX 语音合成（可选）

默认使用 Microsoft TTS（免费，无需配置）。如果你想使用 [VOICEVOX](https://voicevox.hiroshiba.jp/) 的日语语音：

```bash
docker compose --profile voicevox up -d
```

> VOICEVOX 引擎镜像约 2GB，首次拉取需要一些时间。

启动后在设置面板中将 TTS 引擎切换为「VOICEVOX」即可。

---

## 环境变量

可以创建 `.env` 文件自定义配置（参考 `.env.example`）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3003` | 服务端口 |
| `TTS_DEFAULT_PROVIDER` | `microsoft` | 默认 TTS 引擎（`microsoft` / `voicevox`） |
| `VOICEVOX_ENGINE_URL` | `http://voicevox:50021` | VOICEVOX 引擎地址（Docker 网络内自动解析） |
| `TTS_CACHE_MAX_BYTES` | `125829120` | 服务端 TTS 缓存上限（字节，默认 120MB） |

---

## 不用 Docker 的方式

如果你不想用 Docker，也可以手动运行：

```bash
# 需要 Node.js >= 22 和 pnpm
pnpm install
pnpm build
pnpm start
```

然后访问 `http://localhost:3003`。

---

## 停止服务

```bash
docker compose down
```

## 更新到最新版本

```bash
git pull
docker compose up -d --build
```

---

## 常见问题

**Q: 页面打开是空白的？**
A: 检查构建是否成功完成。运行 `docker compose logs app` 查看日志。

**Q: VOICEVOX 语音没有声音？**
A: 确认使用了 `--profile voicevox` 启动，并在设置中切换 TTS 引擎为 VOICEVOX。运行 `docker compose logs voicevox` 检查引擎状态。

**Q: API Key 安全吗？**
A: 安全。Key 仅保存在你浏览器的 localStorage 中，请求只会直接从你的服务器转发到对应的 AI 服务商，不经过任何中间服务器。
