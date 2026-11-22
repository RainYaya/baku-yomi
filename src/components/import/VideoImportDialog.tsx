import { useEffect, useRef, useState } from 'react';
import {
  FiExternalLink,
  FiFilm,
  FiLink,
  FiUpload,
  FiVideo,
  FiX,
} from 'react-icons/fi';
import { useBookStore } from '../../stores/bookSlice';
import { useUIStore } from '../../stores/uiSlice';
import { registerKeyboardHandler } from '../../lib/keyboard';
import {
  parseSrt,
  parseVtt,
  type SubtitleCue,
} from '../../lib/import/subtitle';
import { buildVideoBook } from '../../lib/import/videoBook';
import {
  assignSubtitleRoles,
  baseName,
  formatDuration,
  pickSubtitleByBaseName,
  subtitleFormatOf,
  videoFormatOf,
} from '../../lib/import/videoFiles';
import { setSessionVideoFile } from '../../lib/video/sessionFiles';
import {
  pickVideoFile,
  saveVideoHandle,
  supportsFileHandles,
  type VideoFileHandle,
} from '../../lib/video/handles';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Exit to the existing subtitle-only import when yt-dlp is unavailable. */
  onFallbackSubtitle?: () => void;
}

interface ResolvedVideo {
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

interface SubtitlePick {
  name: string;
  file: File;
  text: string;
  cues: SubtitleCue[];
}

const MAX_SUBTITLE_BYTES = 4 * 1024 * 1024;
const MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;

function readDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    const finish = (value?: number) => {
      URL.revokeObjectURL(objectUrl);
      resolve(value);
    };

    video.preload = 'metadata';
    video.onloadedmetadata = () =>
      finish(Number.isFinite(video.duration) ? video.duration : undefined);
    video.onerror = () => finish(undefined);
    video.src = objectUrl;
  });
}

async function readSubtitle(file: File): Promise<SubtitlePick> {
  const raw = await file.text();
  const format = subtitleFormatOf(file.name);
  const isVtt =
    format === 'vtt' || raw.replace(/^\uFEFF/, '').trimStart().startsWith('WEBVTT');
  return {
    name: file.name,
    file,
    text: raw,
    cues: isVtt ? parseVtt(raw) : parseSrt(raw),
  };
}

/** One entry, two tabs: fetch a YouTube transcript, or pick a local video. */
export function VideoImportDialog({ open, onClose, onFallbackSubtitle }: Props) {
  const addBook = useBookStore((s) => s.addBook);
  const setCurrentBook = useBookStore((s) => s.setCurrentBook);
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const setCurrentView = useUIStore((s) => s.setCurrentView);

  const [tab, setTab] = useState<'online' | 'local'>('online');
  const [url, setUrl] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<ResolvedVideo | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoHandle, setVideoHandle] = useState<VideoFileHandle | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | undefined>();
  const [japanesePick, setJapanesePick] = useState<SubtitlePick | null>(null);
  const [chinesePick, setChinesePick] = useState<SubtitlePick | null>(null);
  const [reading, setReading] = useState(false);
  const [formatWarning, setFormatWarning] = useState<string | null>(null);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTab('online');
    setUrl('');
    setResolving(false);
    setResolved(null);
    setTitle('');
    setError(null);
    setErrorCode(null);
    setVideoFile(null);
    setVideoHandle(null);
    setVideoDuration(undefined);
    setJapanesePick(null);
    setChinesePick(null);
    setReading(false);
    setFormatWarning(null);

    return registerKeyboardHandler('video-import', 100, (event) => {
      if (event.key !== 'Escape') return false;
      onClose();
      return true;
    });
  }, [onClose, open]);

  if (!open) return null;

  const save = (bookId: string) => {
    setCurrentBook(bookId);
    setCurrentChapter(0);
    setCurrentView('reader');
    onClose();
  };

  const handleResolve = async () => {
    setResolving(true);
    setError(null);
    setErrorCode(null);
    setResolved(null);
    try {
      const response = await fetch('/api/video/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as Partial<ResolvedVideo> & {
        code?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? '没能解析这个视频。');
        setErrorCode(data.code ?? 'resolve_failed');
        return;
      }
      setResolved(data as ResolvedVideo);
      setTitle(data.title ?? '视频');
    } catch {
      setError('网络请求失败，检查服务是否在运行。');
      setErrorCode('resolve_failed');
    } finally {
      setResolving(false);
    }
  };

  const handleOnlineImport = () => {
    if (!resolved) return;
    try {
      const cues = parseVtt(resolved.vtt);
      const book = buildVideoBook({
        title,
        author: resolved.channel,
        video: {
          provider: 'youtube',
          videoId: resolved.videoId,
          url: resolved.url,
          channel: resolved.channel,
          thumbnailUrl: resolved.thumbnailUrl,
          durationSec: resolved.durationSec,
        },
        cues,
      });
      addBook(book);
      save(book.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入失败，请检查字幕。');
    }
  };

  const handleVideoFile = async (
    chosen: File,
    handle?: VideoFileHandle
  ) => {
    if (!videoFormatOf(chosen.name)) {
      setFormatWarning('浏览器通常不能播放 MKV，建议先转成 mp4 / webm。');
    } else {
      setFormatWarning(null);
    }
    if (chosen.size > MAX_VIDEO_BYTES) {
      setError('视频文件超过 4 GB，浏览器可能无法读取。');
    }

    setVideoFile(chosen);
    setVideoHandle(handle ?? null);
    setTitle((current) => current || baseName(chosen.name));
    setVideoDuration(await readDuration(chosen));
  };

  const chooseVideo = async () => {
    if (!supportsFileHandles()) {
      videoInputRef.current?.click();
      return;
    }

    try {
      const picked = await pickVideoFile();
      if (picked) await handleVideoFile(picked.file, picked.handle);
    } catch {
      setError('读取视频失败，换一个文件试试。');
    }
  };

  const handleSubtitleFiles = async (files: File[]) => {
    setError(null);
    setReading(true);
    try {
      const picks: SubtitlePick[] = [];
      for (const file of files) {
        if (!subtitleFormatOf(file.name)) continue;
        if (file.size > MAX_SUBTITLE_BYTES) {
          setError('字幕文件不能超过 4 MB。');
          continue;
        }
        picks.push(await readSubtitle(file));
      }

      if (picks.length === 0) {
        setError('请选择 .srt 或 .vtt 字幕文件。');
        return;
      }

      const matched = videoFile
        ? pickSubtitleByBaseName(
            videoFile.name,
            picks.map((pick) => pick.file)
          )
        : null;
      const ordered = matched
        ? [
            picks.find((pick) => pick.file === matched)!,
            ...picks.filter((pick) => pick.file !== matched),
          ]
        : picks;
      const { japanese, chinese } = assignSubtitleRoles(ordered);

      if (!japanese) {
        setError('请选择 .srt 或 .vtt 字幕文件。');
        return;
      }

      if (japanese.cues.length === 0) {
        setError('日文字幕里没有读到句子，检查一下文件内容。');
      }
      setJapanesePick(japanese);
      setChinesePick(chinese);
      setTitle((current) => current || baseName(japanese.file.name));
    } catch {
      setError('读取字幕失败，换一个文件试试。');
    } finally {
      setReading(false);
    }
  };

  const handleLocalImport = () => {
    if (!videoFile) {
      setError('先选择一个本地视频。');
      return;
    }
    if (!japanesePick) {
      setError('再选择日文字幕（.srt / .vtt）。');
      return;
    }
    try {
      const book = buildVideoBook({
        title,
        author: videoFile.name,
        video: {
          provider: 'local',
          fileName: videoFile.name,
          fileSize: videoFile.size,
          fileLastModified: videoFile.lastModified,
          mimeType: videoFile.type || undefined,
          durationSec: videoDuration,
        },
        cues: japanesePick.cues,
        chineseCues: chinesePick?.cues,
      });
      setSessionVideoFile(book.id, videoFile);
      if (videoHandle) void saveVideoHandle(book.id, videoHandle);
      addBook(book);
      save(book.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入失败，请检查字幕。');
    }
  };

  return (
    <div className="paste-overlay" onClick={onClose}>
      <section
        className="paste-dialog video-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-import-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="paste-head">
          <div>
            <span className="paste-kicker">VIDEO</span>
            <h2 id="video-import-title">导入视频</h2>
          </div>
          <button className="settings-close-btn" onClick={onClose} aria-label="关闭">
            <FiX size={18} />
          </button>
        </header>

        <div className="video-tabs" role="tablist" aria-label="视频来源">
          <button
            role="tab"
            aria-selected={tab === 'online'}
            className={`video-tab${tab === 'online' ? ' active' : ''}`}
            onClick={() => {
              setTab('online');
              setError(null);
              setErrorCode(null);
            }}
          >
            <FiLink size={13} /> 在线视频
          </button>
          <button
            role="tab"
            aria-selected={tab === 'local'}
            className={`video-tab${tab === 'local' ? ' active' : ''}`}
            onClick={() => {
              setTab('local');
              setError(null);
              setErrorCode(null);
            }}
          >
            <FiVideo size={13} /> 本地视频
          </button>
        </div>

        <div className="paste-body">
          {tab === 'online' ? (
            <>
              <label className="paste-field">
                <span>YouTube 链接</span>
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=…"
                  aria-label="YouTube 链接"
                />
              </label>

              <div className="generate-actions">
                <button
                  className="shelf-btn primary"
                  onClick={() => void handleResolve()}
                  disabled={resolving || !url.trim()}
                >
                  <FiLink size={13} /> {resolving ? '解析中…' : '解析链接'}
                </button>
                <span className="video-hint">
                  只取日文字幕；视频仍在 YouTube 播放。
                </span>
              </div>

              {error && <p className="paste-error">{error}</p>}

              {errorCode === 'ytdlp_missing' && (
                <div className="video-fallback">
                  <span>也可以先只导入字幕，或改用本地视频。</span>
                  <div className="generate-actions">
                    {onFallbackSubtitle && (
                      <button
                        className="quiet-link"
                        onClick={() => {
                          onClose();
                          onFallbackSubtitle();
                        }}
                      >
                        导入字幕
                      </button>
                    )}
                    <button className="quiet-link" onClick={() => setTab('local')}>
                      本地视频
                    </button>
                  </div>
                </div>
              )}

              {resolved && (
                <div className="video-preview">
                  <div
                    className="video-preview-cover"
                    style={
                      resolved.thumbnailUrl
                        ? { backgroundImage: `url("${resolved.thumbnailUrl}")` }
                        : undefined
                    }
                  >
                    {!resolved.thumbnailUrl && <FiFilm size={22} />}
                  </div>
                  <div className="video-preview-copy">
                    <b>{resolved.title}</b>
                    <span>
                      {resolved.channel || 'YouTube'} ·{' '}
                      {formatDuration(resolved.durationSec)}
                    </span>
                    <span>
                      {resolved.cueCount} 条日文字幕 · 中文：未翻译
                    </span>
                    <a
                      href={resolved.url}
                      target="_blank"
                      rel="noreferrer"
                      className="video-open-link"
                    >
                      在 YouTube 打开 <FiExternalLink size={11} />
                    </a>
                  </div>
                </div>
              )}

              {resolved && (
                <>
                  <label className="paste-field">
                    <span>材料标题</span>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </label>
                  <div className="generate-actions">
                    <button
                      className="shelf-btn primary"
                      onClick={handleOnlineImport}
                      disabled={!title.trim()}
                    >
                      <FiFilm size={13} /> 导入并阅读
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                className="subtitle-drop"
                onClick={() => void chooseVideo()}
                disabled={reading}
              >
                <FiUpload size={20} />
                <b>{videoFile ? videoFile.name : '选择本地视频（mp4 / webm / mov）'}</b>
                <small>
                  视频只在浏览器本地读取，不上传。句柄恢复只在桌面 localhost 的
                  Chromium 生效，其他环境下次需要重选。
                </small>
              </button>
              <input
                ref={videoInputRef}
                type="file"
                accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"
                hidden
                onChange={(event) => {
                  const chosen = event.target.files?.[0];
                  event.target.value = '';
                  if (chosen) void handleVideoFile(chosen);
                }}
              />

              <button
                type="button"
                className="subtitle-drop"
                onClick={() => subtitleInputRef.current?.click()}
                disabled={reading}
              >
                <FiUpload size={20} />
                <b>
                  {reading
                    ? '读取字幕中…'
                    : japanesePick
                      ? `${japanesePick.file.name}${
                          chinesePick ? ` + ${chinesePick.file.name}` : ''
                        }`
                      : '选择字幕（.srt / .vtt，可多选）'}
                </b>
                <small>
                  同时选日文和中文字幕时，按时间重叠配对；文件名相同会优先配对。
                </small>
              </button>
              <input
                ref={subtitleInputRef}
                type="file"
                accept=".srt,.vtt"
                multiple
                hidden
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = '';
                  if (files.length > 0) void handleSubtitleFiles(files);
                }}
              />

              {videoFile && (
                <div className="video-preview">
                  <div className="video-preview-cover">
                    <FiVideo size={22} />
                  </div>
                  <div className="video-preview-copy">
                    <b>{videoFile.name}</b>
                    <span>{formatDuration(videoDuration)}</span>
                    <span>
                      {japanesePick
                        ? `${japanesePick.cues.length} 条日文字幕`
                        : '还没有字幕'}
                      {chinesePick ? ` · 中文 ${chinesePick.cues.length} 条` : ''}
                    </span>
                  </div>
                </div>
              )}

              {formatWarning && <p className="video-warning">{formatWarning}</p>}
              {error && <p className="paste-error">{error}</p>}

              {videoFile && (
                <label className="paste-field">
                  <span>材料标题</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
              )}

              <div className="generate-actions">
                <button
                  className="shelf-btn primary"
                  onClick={handleLocalImport}
                  disabled={!videoFile || !japanesePick || reading}
                >
                  <FiFilm size={13} /> 导入并阅读
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
