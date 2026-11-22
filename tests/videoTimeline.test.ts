import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatTimecode,
  pairIndexAtTime,
  youtubeEmbedUrl,
  youtubeToggleCommand,
} from '../src/lib/video/timeline';
import { useSettingsStore } from '../src/stores/settingsSlice';

const pairs = [
  { startMs: 1000, endMs: 2000 },
  { startMs: 3000, endMs: 4000 },
  { startMs: 6000, endMs: 8000 },
];

test('pairIndexAtTime returns -1 for an empty timeline', () => {
  assert.equal(pairIndexAtTime([], 0), -1);
});

test('pairIndexAtTime clamps before the first sentence to the first index', () => {
  assert.equal(pairIndexAtTime(pairs, 0), 0);
});

test('pairIndexAtTime finds the sentence under the playhead', () => {
  assert.equal(pairIndexAtTime(pairs, 1000), 0);
  assert.equal(pairIndexAtTime(pairs, 3500), 1);
});

test('pairIndexAtTime keeps the previous sentence inside a gap', () => {
  assert.equal(pairIndexAtTime(pairs, 2500), 0);
  assert.equal(pairIndexAtTime(pairs, 5500), 1);
});

test('pairIndexAtTime clamps after the last sentence', () => {
  assert.equal(pairIndexAtTime(pairs, 99_000), 2);
});

test('formatTimecode reads mm:ss and h:mm:ss', () => {
  assert.equal(formatTimecode(75_000), '01:15');
  assert.equal(formatTimecode(3_723_000), '1:02:03');
  assert.equal(formatTimecode(0), '00:00');
  assert.equal(formatTimecode(undefined), '--:--');
});

test('youtubeEmbedUrl builds the embed page for a video id', () => {
  assert.equal(
    youtubeEmbedUrl('abcdefghijk'),
    'https://www.youtube.com/embed/abcdefghijk?enablejsapi=1&playsinline=1&rel=0'
  );
});

test('youtubeToggleCommand pauses a playing player and plays a paused one', () => {
  assert.equal(youtubeToggleCommand(true), 'pauseVideo');
  assert.equal(youtubeToggleCommand(false), 'playVideo');
});

test('video language mode defaults to both and switches', () => {
  assert.equal(useSettingsStore.getState().videoLanguageMode, 'both');

  useSettingsStore.getState().setVideoLanguageMode('zh');
  assert.equal(useSettingsStore.getState().videoLanguageMode, 'zh');

  useSettingsStore.getState().setVideoLanguageMode('both');
});
