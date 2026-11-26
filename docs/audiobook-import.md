# 添加有声书

一份有声书资源 = 书（EPUB）+ 逐句字幕（SRT）+ 整本音频（m4b/mp3/m4a）。
工具把字幕对到书的段落上，再按章节切成 Opus，产出一个目录；服务器直接读这个目录。

没有现成音频、想让程序自己读出来，看 [audiobook-generate.md](audiobook-generate.md)。

## 1. 在 Mac 上生成

需要 `ffmpeg` / `ffprobe`（`brew install ffmpeg`）。

```bash
pnpm audiobook:build \
  --epub  "~/Downloads/书.epub" \
  --srt   "~/Downloads/书.srt" \
  --audio "~/Downloads/书.m4b" \
  --id mushoku-02 \
  --title "無職転生 2" \
  --author "理不尽な孫の手" \
  --out ~/baku-yomi-data/audio/mushoku-02
```

- `--id` 只能用小写字母、数字和连字符，它会成为 URL 里的一段。
- 输出目录里是 `asset.json` 和每章一个 `chNNN.opus`（默认 32k，可以用 `--bitrate 48k` 调）。
- 看输出里的 `对齐 N/M 段（X%）`：接近 90% 以上可用；明显偏低通常是字幕版本和书对不上。
- 没有 SRT 就没法对齐时间，目前不支持只有音频的书。

## 2. 拷到 Rog

```bash
COPYFILE_DISABLE=1 tar -C ~/baku-yomi-data/audio -czf - mushoku-02 \
  | ssh -i ~/.ssh/id_ed25519 Neal@192.168.210.203 \
      wsl.exe -e tar -C /home/yaya/baku-yomi-data/audio -xzf -
```

`COPYFILE_DISABLE=1` 用来跳过 macOS 的 `._` 元数据文件。

## 3. 在应用里添加

桌面 → 添加材料 → **服务器有声书** → 点「添加到书架」。

- 列表来自服务器上的目录；已经在书架上的会显示「已在书架」。
- 同一个部署下每台设备（每个浏览器）点一次即可，书会记进这台设备的 localStorage。
- 音频始终留在服务器，书架里只存文字、章节和音频地址。

## 删除

- 从书架删书：材料库 → 删除。只删本机的书架条目。
- 删音频：删掉服务器上的 `~/baku-yomi-data/audio/<id>/` 目录。两边互相独立。

## 顺带

`public/default-library.json` 是给部署自带的样例用的：在列表里写一条
`{ "kind": "audiobook", "id": "...", "title": "...", "asset": "/api/audio/<id>/asset.json" }`，
打开应用时会自动加到书架。日常新增有声书用第 3 步的对话框就行，不用改这个文件。
