/** The video side keeps the same width the desk shipped with. */
export const VIDEO_SIDE_DEFAULT = 420;
export const VIDEO_SIDE_MIN = 280;
export const VIDEO_SIDE_MAX = 900;
/** The transcript needs room for a full sentence beside the player. */
export const VIDEO_TRANSCRIPT_MIN = 360;

/**
 * Keep a dragged video width usable: never narrower than the player's
 * controls, never so wide that the transcript loses its reading column.
 */
export function clampVideoSideWidth(
  width: number,
  containerWidth: number
): number {
  const available = Math.max(
    VIDEO_SIDE_MIN,
    containerWidth - VIDEO_TRANSCRIPT_MIN
  );
  return Math.round(
    Math.max(VIDEO_SIDE_MIN, Math.min(width, VIDEO_SIDE_MAX, available))
  );
}
