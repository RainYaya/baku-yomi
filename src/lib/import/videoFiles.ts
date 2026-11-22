import { detectLanguage } from '../epub/languageDetector';

export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov'] as const;
export type VideoFormat = (typeof VIDEO_EXTENSIONS)[number];
export type SubtitleFileFormat = 'srt' | 'vtt';

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function videoFormatOf(name: string): VideoFormat | null {  const extension = extensionOf(name);
  return (VIDEO_EXTENSIONS as readonly string[]).includes(extension)
    ? (extension as VideoFormat)
    : null;
}

export function subtitleFormatOf(name: string): SubtitleFileFormat | null {
  const extension = extensionOf(name);
  return extension === 'srt' || extension === 'vtt' ? extension : null;
}

/** `walk.vlog.mp4` → `walk.vlog`; `walk` → `walk`. */
export function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * A video and its subtitle usually share a base name. Match case-insensitively
 * so `Walk.MP4` finds `walk.srt`.
 */
export function pickSubtitleByBaseName<T extends { name: string }>(
  videoName: string,
  files: readonly T[]
): T | null {
  const videoBase = baseName(videoName).toLowerCase();
  return (
    files.find((file) => {
      if (!subtitleFormatOf(file.name)) return false;
      return baseName(file.name).toLowerCase() === videoBase;
    }) ?? null
  );
}

export interface SubtitleRolePick {
  name: string;
  cues: readonly { text: string }[];
}

/**
 * Two subtitle files are usually Japanese and Chinese, but the file picker
 * does not promise an order. Detect the Japanese file by kana and only fall
 * back to pick order when neither file contains kana.
 */
export function assignSubtitleRoles<T extends SubtitleRolePick>(
  picks: readonly T[]
): { japanese: T | null; chinese: T | null } {
  const japaneseIndex = picks.findIndex((pick) =>
    pick.cues.some((cue) => detectLanguage(cue.text) === 'ja')
  );
  const japanese = japaneseIndex >= 0 ? picks[japaneseIndex] : picks[0] ?? null;
  const chinese =
    picks.find(
      (pick) =>
        pick !== japanese &&
        pick.cues.some((cue) => detectLanguage(cue.text) === 'zh')
    ) ??
    picks.find((pick) => pick !== japanese) ??
    null;

  return { japanese, chinese };
}

export function formatDuration(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '--:--';
  }

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
