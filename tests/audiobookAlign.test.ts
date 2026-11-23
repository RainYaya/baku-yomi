import assert from 'node:assert/strict';
import test from 'node:test';
import { alignPairsToCues, type AlignCue } from '../src/lib/audiobook/align';

function cue(startSec: number, endSec: number, text: string): AlignCue {
  return { startMs: startSec * 1000, endMs: endSec * 1000, text };
}

const pair = (japanese: string) => ({ japanese });

test('maps one pair per cue when the text matches', () => {
  const cues = [cue(0, 2, 'おはよう。'), cue(2, 5, '今日はいい天気ですね。')];
  const result = alignPairsToCues(
    [pair('おはよう。'), pair('今日はいい天気ですね。')],
    cues
  );

  assert.deepEqual(
    result.timings.map((timing) => timing && [timing.startMs, timing.endMs]),
    [
      [0, 2000],
      [2000, 5000],
    ]
  );
});

test('spans a pair split across several cues', () => {
  const cues = [
    cue(0, 1, '今日は'),
    cue(1, 2, 'いい天気'),
    cue(2, 3, 'ですね。'),
  ];
  const result = alignPairsToCues([pair('今日はいい天気ですね。')], cues);

  assert.deepEqual(result.timings, [{ startMs: 0, endMs: 3000 }]);
});

test('ignores punctuation, spacing and ruby markers when matching', () => {
  const cues = [cue(0, 2, '＊　無職転生、一巻')];
  const result = alignPairsToCues([pair('無職転生、一巻')], cues);

  assert.deepEqual(result.timings, [{ startMs: 0, endMs: 2000 }]);
});

test('interpolates a short pair that no cue covers', () => {
  const cues = [
    cue(0, 10, '長い前置きの文章がここにあります。'),
    cue(20, 30, '後ろの長い文章もここにあります。'),
  ];
  const result = alignPairsToCues(
    [
      pair('長い前置きの文章がここにあります。'),
      pair('はい。'),
      pair('後ろの長い文章もここにあります。'),
    ],
    cues
  );

  assert.deepEqual(result.timings[0], { startMs: 0, endMs: 10000 });
  assert.deepEqual(result.timings[1], { startMs: 10000, endMs: 20000 });
  assert.deepEqual(result.timings[2], { startMs: 20000, endMs: 30000 });
  assert.equal(result.matched, 2);
});

test('leaves a leading passage untimed but stays aligned after it', () => {
  const cues = [cue(5, 8, '本文の最初の段落です。')];
  const result = alignPairsToCues(
    [pair('目次'), pair('本文の最初の段落です。')],
    cues
  );

  assert.equal(result.timings[0], null);
  assert.deepEqual(result.timings[1], { startMs: 5000, endMs: 8000 });
});

test('keeps alignment when the audio skips a paragraph', () => {
  const cues = [
    cue(0, 4, '最初の段落がここにあります。'),
    cue(4, 8, '最後の段落がここにあります。'),
  ];
  const result = alignPairsToCues(
    [
      pair('最初の段落がここにあります。'),
      pair('音声では読まれていない段落。'),
      pair('最後の段落がここにあります。'),
    ],
    cues
  );

  assert.deepEqual(result.timings[0], { startMs: 0, endMs: 4000 });
  assert.deepEqual(result.timings[1], { startMs: 4000, endMs: 4000 });
  assert.deepEqual(result.timings[2], { startMs: 4000, endMs: 8000 });
});

test('splits the gap between anchors by text length', () => {
  const cues = [
    cue(0, 10, '最初の長い段落です。'),
    cue(20, 30, '最後の長い段落です。'),
  ];
  const result = alignPairsToCues(
    [
      pair('最初の長い段落です。'),
      pair('みじかい。'),
      pair('もっと長い補足の文章がここにあります。'),
      pair('最後の長い段落です。'),
    ],
    cues
  );

  const [, short, long, last] = result.timings;
  assert.equal(short?.startMs, 10000);
  assert.equal(long?.endMs, 20000);
  assert.equal(short?.endMs, long?.startMs);
  assert.equal(long?.startMs && short?.endMs && long.startMs > 10000, true);
  assert.deepEqual(last, { startMs: 20000, endMs: 30000 });
});

test('returns no timings when there are no cues', () => {
  const result = alignPairsToCues([pair('本文。')], []);
  assert.deepEqual(result.timings, [null]);
  assert.equal(result.matched, 0);
});

test('never lets a timing start before the previous one ends', () => {
  const cues = [cue(10, 12, '一つ目の文章です。'), cue(11, 14, '二つ目の文章です。')];
  const result = alignPairsToCues(
    [pair('一つ目の文章です。'), pair('二つ目の文章です。')],
    cues
  );

  const [first, second] = result.timings;
  assert.ok(first && second);
  assert.ok(second.startMs >= first.endMs);
});
