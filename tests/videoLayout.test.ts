import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampVideoSideWidth,
  VIDEO_SIDE_DEFAULT,
  VIDEO_SIDE_MAX,
  VIDEO_SIDE_MIN,
  VIDEO_TRANSCRIPT_MIN,
} from '../src/lib/video/layout';

test('video side starts at the current fixed width', () => {
  assert.equal(VIDEO_SIDE_DEFAULT, 420);
});

test('video side respects its own minimum and maximum', () => {
  assert.equal(clampVideoSideWidth(100, 1400), VIDEO_SIDE_MIN);
  assert.equal(clampVideoSideWidth(2000, 2000), VIDEO_SIDE_MAX);
});

test('video side leaves the transcript its minimum width', () => {
  assert.equal(clampVideoSideWidth(600, 800), 800 - VIDEO_TRANSCRIPT_MIN);
  assert.equal(clampVideoSideWidth(600, 600), VIDEO_SIDE_MIN);
});

test('video side width is a whole pixel value', () => {
  assert.equal(clampVideoSideWidth(412.6, 1400), 413);
});
