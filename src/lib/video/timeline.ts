import type { SentencePair } from '../../types';

/**
 * The sentence playing at `ms`. A gap between cues keeps the previous
 * sentence highlighted; before the first cue the first sentence is the
 * resting position, and an empty timeline returns -1.
 */
export function pairIndexAtTime(
  pairs: readonly Pick<SentencePair, 'startMs' | 'endMs'>[],
  ms: number
): number {
  if (pairs.length === 0) return -1;

  let low = 0;
  let high = pairs.length - 1;
  let found = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if ((pairs[middle].startMs ?? 0) <= ms) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return found;
}

export function formatTimecode(ms?: number): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return '--:--';

  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?enablejsapi=1&playsinline=1&rel=0`;
}

export function youtubeToggleCommand(
  playing: boolean
): 'playVideo' | 'pauseVideo' {
  return playing ? 'pauseVideo' : 'playVideo';
}
