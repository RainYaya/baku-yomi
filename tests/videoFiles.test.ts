import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignSubtitleRoles,
  baseName,
  formatDuration,
  pickSubtitleByBaseName,
  subtitleFormatOf,
  videoFormatOf,
} from '../src/lib/import/videoFiles';

test('videoFormatOf reads supported extensions case-insensitively', () => {
  assert.equal(videoFormatOf('walk.MP4'), 'mp4');
  assert.equal(videoFormatOf('walk.webm'), 'webm');
  assert.equal(videoFormatOf('walk.Mov'), 'mov');
  assert.equal(videoFormatOf('walk.mkv'), null);
  assert.equal(videoFormatOf('walk'), null);
});

test('subtitleFormatOf accepts srt and vtt only', () => {
  assert.equal(subtitleFormatOf('walk.SRT'), 'srt');
  assert.equal(subtitleFormatOf('walk.vtt'), 'vtt');
  assert.equal(subtitleFormatOf('walk.ass'), null);
  assert.equal(subtitleFormatOf('walk'), null);
});

test('baseName drops the last extension', () => {
  assert.equal(baseName('walk.vlog.mp4'), 'walk.vlog');
  assert.equal(baseName('walk'), 'walk');
  assert.equal(baseName('.hidden.srt'), '.hidden');
});

test('pickSubtitleByBaseName finds the subtitle beside the video', () => {
  const files = [
    { name: 'other.srt' },
    { name: 'Walk.VTT' },
    { name: 'walk.srt' },
  ];

  assert.equal(pickSubtitleByBaseName('walk.mp4', files), files[1]);
  assert.equal(pickSubtitleByBaseName('missing.mp4', files), null);
});

test('formatDuration reads mm:ss and h:mm:ss', () => {
  assert.equal(formatDuration(642), '10:42');
  assert.equal(formatDuration(3723), '1:02:03');
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(undefined), '--:--');
  assert.equal(formatDuration(Number.NaN), '--:--');
});

test('assignSubtitleRoles detects Japanese regardless of pick order', () => {
  const chinese = { name: 'a.srt', cues: [{ text: '你好。' }] };
  const japanese = { name: 'b.srt', cues: [{ text: 'こんにちは。' }] };

  const roles = assignSubtitleRoles([chinese, japanese]);
  assert.equal(roles.japanese, japanese);
  assert.equal(roles.chinese, chinese);
});

test('assignSubtitleRoles falls back to pick order when neither has kana', () => {
  const first = { name: 'a.srt', cues: [{ text: '元気？' }] };
  const second = { name: 'b.srt', cues: [{ text: '你好吗？' }] };

  const roles = assignSubtitleRoles([first, second]);
  assert.equal(roles.japanese, first);
  assert.equal(roles.chinese, second);
});
