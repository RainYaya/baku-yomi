import type { Book, VideoSource } from '../../types';
import { createBookId } from '../id';
import { createPairId } from '../epub/pairId';
import {
  cuesToTimedPairs,
  mergeTranslatedCues,
  type SubtitleCue,
} from './subtitle';

/** One hour of speech is roughly 600 cues; this cap keeps a single book
 *  from filling the 5 MB library with subtitles. */
export const MAX_VIDEO_CUES = 6000;
export const MAX_VIDEO_TEXT_BYTES = 1_500_000;

export interface VideoBookInput {
  title: string;
  author?: string;
  video: VideoSource;
  cues: SubtitleCue[];
  chineseCues?: SubtitleCue[];
}

function assertSubtitleFits(cues: readonly SubtitleCue[]): void {
  if (cues.length > MAX_VIDEO_CUES) {
    throw new Error(`字幕太长：${cues.length} 条，最多 ${MAX_VIDEO_CUES} 条。`);
  }

  const bytes = new TextEncoder().encode(
    cues.map((cue) => cue.text).join('')
  ).length;
  if (bytes > MAX_VIDEO_TEXT_BYTES) {
    throw new Error('字幕太长：文本超过约 1.5 MB，请换一个更短的视频。');
  }
}

export function buildVideoBook(input: VideoBookInput): Book {
  const cues = input.chineseCues
    ? mergeTranslatedCues(input.cues, input.chineseCues)
    : input.cues;

  assertSubtitleFits(cues);

  const pairs = cuesToTimedPairs(cues);
  if (pairs.length === 0) {
    throw new Error('字幕里没有可用的句子。');
  }

  const bookId = createBookId();
  const title = input.title.trim() || '视频';
  const author =
    input.author?.trim() ||
    input.video.channel ||
    input.video.fileName ||
    '视频';

  return {
    id: bookId,
    title,
    author,
    importedAt: Date.now(),
    source: {
      kind: 'video',
      url: input.video.url,
      fileName: input.video.fileName,
      video: input.video,
    },
    chapters: [
      {
        id: `${bookId}-ch0`,
        title,
        index: 0,
        pairs: pairs.map((pair, pairIndex) => ({
          ...pair,
          id: createPairId(bookId, 0, pairIndex),
          chapterIndex: 0,
          pairIndex,
        })),
      },
    ],
  };
}
