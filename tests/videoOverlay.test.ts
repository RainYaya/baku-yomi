import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampSubtitlePoint,
  SUBTITLE_DEFAULT_POS,
} from '../src/lib/video/overlay';

const player = { width: 800, height: 450 };
const box = { width: 200, height: 60 };

test('keeps a point that already fits inside the player', () => {
  assert.deepEqual(
    clampSubtitlePoint({ x: 0.5, y: 0.6 }, player, box),
    { x: 0.5, y: 0.6 }
  );
});

test('pushes a point at the top-left corner inside the margin', () => {
  const point = clampSubtitlePoint({ x: 0, y: 0 }, player, box, 6);
  assert.deepEqual(point, { x: 106 / 800, y: 36 / 450 });
});

test('pushes a point at the bottom-right corner inside the margin', () => {
  const point = clampSubtitlePoint({ x: 1, y: 1 }, player, box, 6);
  assert.deepEqual(point, { x: 694 / 800, y: 414 / 450 });
});

test('centres the subtitle when the player is narrower than it', () => {
  const point = clampSubtitlePoint(
    { x: 0.9, y: 0.5 },
    { width: 120, height: 200 },
    box,
    6
  );
  assert.equal(point.x, 0.5);
  assert.equal(point.y, 0.5);
});

test('keeps a default point inside a small player', () => {
  const point = clampSubtitlePoint(
    SUBTITLE_DEFAULT_POS,
    { width: 420, height: 236 },
    { width: 380, height: 52 }
  );
  assert.deepEqual(point, { x: 0.5, y: 0.72 });
});

test('falls back to the raw point when the player has no size', () => {
  assert.deepEqual(
    clampSubtitlePoint({ x: -0.2, y: 1.4 }, { width: 0, height: 0 }, box),
    { x: 0, y: 1 }
  );
});
