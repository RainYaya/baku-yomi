export interface SubtitlePoint {
  /** Horizontal centre of the subtitle box, as a fraction of player width. */
  x: number;
  /** Vertical centre of the subtitle box, as a fraction of player height. */
  y: number;
}

/** Sits above the browser's own control bar on a local <video>. */
export const SUBTITLE_DEFAULT_POS: SubtitlePoint = { x: 0.5, y: 0.72 };
/** Keeps the box off the player's rounded edge. */
export const SUBTITLE_MARGIN = 6;

interface Size {
  width: number;
  height: number;
}

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Keep the dragged subtitle inside the player: its centre may move, its
 * edges may not leave the frame. When the box is wider or taller than the
 * player, centre it on that axis instead of picking a side.
 */
export function clampSubtitlePoint(
  point: SubtitlePoint,
  player: Size,
  box: Size,
  margin = SUBTITLE_MARGIN
): SubtitlePoint {
  if (player.width <= 0 || player.height <= 0) {
    return { x: clampUnit(point.x), y: clampUnit(point.y) };
  }

  const axis = (
    value: number,
    playerSize: number,
    boxSize: number
  ): number => {
    const half = boxSize / 2 + margin;
    if (playerSize <= half * 2) return 0.5;
    return Math.min(Math.max(value * playerSize, half), playerSize - half) /
      playerSize;
  };

  return {
    x: axis(point.x, player.width, box.width),
    y: axis(point.y, player.height, box.height),
  };
}
