# 自己生成有声书

书架里的任何一本书（EPUB、字幕、视频转录都算）都能一键变成有声版：
合成和打包在 4080 那台机器上跑，成品传到 Rog，浏览器只负责点两下。

## 分工

- **4080**：跑 voicestudio（语音模型）+ `pnpm tts:worker`（逐句合成、ffmpeg 打包、上传）。
- **Rog**：跑应用本身，`/api/tts/*` 把浏览器的请求转发给 worker，并接收 worker 传上来的成品。
- **浏览器**：只知道「生成中 / 已完成」，不需要知道两边怎么连。

## 4080 上要配的环境变量

写在这个仓库根目录的 `.env` 里（`pnpm tts:worker` 用 `--env-file-if-exists=.env` 读它），或者启动时直接带上：

```bash
VOICESTUDIO_URL=http://127.0.0.1:3900   # voicestudio 的 OpenAI 兼容地址
VOICESTUDIO_MODEL=omnivoice             # 换模型只改这一行
VOICESTUDIO_VOICE=default
BAKU_TTS_BITRATE=32k                    # 成品码率，32k / 48k / 64k
BAKU_TTS_PORT=3910
BAKU_ROG_URL=http://192.168.210.203:3003
BAKU_IMPORT_TOKEN=<和 Rog 上一致的一串>
```

worker 和 voicestudio 在同一台机器上时，用 `127.0.0.1:3900` 就够。如果 voicestudio
那边开了「分享 / 远程访问」（底部 Local 图标 → Network，或 Settings → Sharing &
Remote Access），它会多开一个对局域网监听的端口（实测是 `0.0.0.0:3901`），并要求
随身带一个 6 位 PIN：

```bash
VOICESTUDIO_URL=http://<台式机局域网 IP>:3901
VOICESTUDIO_PIN=<应用里显示的那 6 位>
```

PIN 每次重新打开分享都会换一个，换了要同步改 `.env` 再重启 worker。model / voice
填 `/v1/models` 和 `/v1/audio/voices` 里列出的 id（例如 `tts-1` + `alloy`），
对话框里也会直接变成下拉框。

然后 `pnpm tts:worker`。需要 `ffmpeg` 和 `ffprobe` 在 PATH 里。

## Rog 上要配的环境变量

```bash
BAKU_TTS_WORKER=http://<4080 的局域网 IP>:3910   # 台式机的地址，不是 Rog 自己
BAKU_IMPORT_TOKEN=<和 4080 上一致的一串>
```

重启 `baku-yomi.service` 生效。两边的 token 必须一样，它是 worker 上传成品的唯一凭证。

worker 本身没有登录鉴权，只带一个导入 token 保护上传接口。把它留在局域网里，
别把 3910 端口映射到公网。

## 用法

1. 桌面 → 添加材料 → 导入一本 EPUB（和平时一样）。
2. 书架里那本书的耳机按钮 → 确认 model / voice → **开始生成**。
3. 生成完点「打开有声书」；它是一本同名的新书，文字原样保留。

model 和 voice 是下拉框，选项来自语音服务的 `/v1/models` 和 `/v1/audio/voices`；
服务不提供这两条接口时退回输入框，只有默认值也照样能跑。

一本书同一时间只有一个任务。关掉对话框不会中断生成，再打开这本书会直接接上
正在跑的那个任务；重复点也不会排第二个。任务在你关着窗口时跑完了，再打开对话框
会自动把成品拉进书架，不用重新生成。已经生成过的书再点一次是**重做**，
会覆盖服务器上的音频，书架里替换原来那张卡，不会多出一本。

想中途停就点「取消」；已经合成的句子会缓存在 `~/.baku-tts/cache/`，
再跑一次只补没做完的部分。

重做会换掉服务器上的章节文件（文件名带内容哈希），所以另一台设备或另一个浏览器里
还留着旧卡片的，播不出来是正常的：删掉那张卡，从「添加材料 → 服务器有声书」重新导入就行。

生成期间浏览器每 2 秒问一次进度。如果连续 10 秒都连不上 worker，对话框会停下来并
告诉你进度不再更新；生成本身在另一台机器上，关掉窗口再打开就能接上或看到结果。

## 时长与字幕

一句话合成一段音频，时间轴是**拼出来就知道的**，不需要 SRT，也不需要强制对齐。
每句之间按句尾标点留白：一般 250ms，句号 / 问号 / 感叹号后 350ms，省略号后 450ms。
章节一个 Opus 文件，`asset.json` 里记着每句的起止毫秒。

打包时每章过一次响度归一化（`loudnorm I=-16 TP=-1.5`），避免不同句子听起来忽大忽小。

## 换模型 / 换机器

- 模型：只改 `VOICESTUDIO_MODEL`（和对话框里的 model 输入框），缓存按 模型+音色+文本 分开存。
- 想试听效果不花 GPU 时间：`pnpm tts:mock` 起一个假语音服务，把 `VOICESTUDIO_URL` 指到 `http://127.0.0.1:3901`，几秒就能跑完整条链路。

## 已生成的书放哪

成品在 Rog 的 `~/baku-yomi-data/audio/tts-<书 id>/`，和手工导入的有声书同一个目录，
所以在「添加材料 → 服务器有声书」里也能看到。删这本书的书架条目只删本机记录，
音频要删就去删目录。
