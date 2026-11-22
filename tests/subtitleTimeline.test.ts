import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cuesToTimedPairs,
  mergeTranslatedCues,
  parseSrt,
  parseTimestamp,
} from '../src/lib/import/subtitle';
import { buildVideoBook, MAX_VIDEO_CUES } from '../src/lib/import/videoBook';
import {
  sourceGroup,
  sourceGroupLabel,
  sourceLabel,
} from '../src/lib/library/sources';
import type { Book } from '../src/types';

const srt = (blocks: Array<[string, string, string]>) =>
  blocks
    .map(
      ([time, ja, zh], index) =>
        `${index + 1}\n${time.replace(' --> ', ' --> ')}\n${ja}${zh ? `\n${zh}` : ''}\n`
    )
    .join('\n');

test('parseTimestamp reads srt and vtt timecodes as milliseconds', () => {
  assert.equal(parseTimestamp('00:01:02,500'), 62_500);
  assert.equal(parseTimestamp('01:02.500'), 62_500);
  assert.equal(parseTimestamp('1:02:03.250'), 3_723_250);
});

test('parseSrt accepts timecodes with unpadded hours', () => {
  const cues = parseSrt(
    srt([
      ['0:00:01,000 --> 0:00:03,000', 'こんにちは。', ''],
      ['1:02:03,250 --> 1:02:04,000', 'さようなら。', ''],
    ])
  );

  assert.equal(cues.length, 2);
  assert.equal(cues[0].startMs, 1000);
  assert.equal(cues[1].startMs, 3_723_250);
});

test('parseSrt orders out-of-order cues by start time', () => {
  const cues = parseSrt(
    srt([
      ['00:00:05,000 --> 00:00:06,000', '三番目', ''],
      ['00:00:01,000 --> 00:00:02,000', '一番目', ''],
      ['00:00:03,000 --> 00:00:04,000', '二番目', ''],
    ])
  );

  assert.deepEqual(
    cues.map((cue) => cue.text),
    ['一番目', '二番目', '三番目']
  );
  assert.deepEqual(
    cues.map((cue) => cue.index),
    [0, 1, 2]
  );
});

test('a bilingual cue becomes one pair with the cue span', () => {
  const cues = parseSrt(
    srt([['00:00:01,000 --> 00:00:03,000', 'こんにちは。', '你好。']])
  );
  const pairs = cuesToTimedPairs(cues);

  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].japanese, 'こんにちは。');
  assert.equal(pairs[0].chinese, '你好。');
  assert.equal(pairs[0].startMs, 1000);
  assert.equal(pairs[0].endMs, 3000);
});

test('a Japanese cue followed by a Chinese cue within 500ms merges', () => {
  const cues = parseSrt(
    srt([
      ['00:00:00,000 --> 00:00:01,500', '今日は晴れです', ''],
      ['00:00:01,400 --> 00:00:02,500', '今天晴天', ''],
    ])
  );
  const pairs = cuesToTimedPairs(cues);

  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].japanese, '今日は晴れです');
  assert.equal(pairs[0].chinese, '今天晴天');
  assert.equal(pairs[0].startMs, 0);
  assert.equal(pairs[0].endMs, 2500);
});

test('a Chinese cue more than 500ms after the Japanese cue is dropped', () => {
  const cues = parseSrt(
    srt([
      ['00:00:00,000 --> 00:00:01,000', '今日は晴れです', ''],
      ['00:00:01,600 --> 00:00:02,500', '今天晴天', ''],
    ])
  );
  const pairs = cuesToTimedPairs(cues);

  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].japanese, '今日は晴れです');
  assert.equal(pairs[0].chinese, '');
  assert.equal(pairs[0].endMs, 1000);
});

test('consecutive identical auto-caption lines keep one pair and the span', () => {
  const cues = parseSrt(
    srt([
      ['00:00:00,000 --> 00:00:01,000', 'そうですね', ''],
      ['00:00:01,000 --> 00:00:02,000', 'そうですね', ''],
    ])
  );
  const pairs = cuesToTimedPairs(cues);

  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].japanese, 'そうですね');
  assert.equal(pairs[0].startMs, 0);
  assert.equal(pairs[0].endMs, 2000);
});

test('two subtitle files pair each Japanese cue with overlapping Chinese cues', () => {
  const japanese = parseSrt(
    srt([
      ['00:00:00,000 --> 00:00:02,000', 'おはよう', ''],
      ['00:00:02,500 --> 00:00:04,000', '元気？', ''],
    ])
  );
  const chinese = parseSrt(
    srt([
      ['00:00:00,500 --> 00:00:01,500', '早上好', ''],
      ['00:00:02,600 --> 00:00:03,000', '你好吗', ''],
      ['00:00:03,000 --> 00:00:03,500', '？', ''],
    ])
  );

  const pairs = cuesToTimedPairs(mergeTranslatedCues(japanese, chinese));

  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].chinese, '早上好');
  assert.equal(pairs[0].startMs, 0);
  assert.equal(pairs[0].endMs, 2000);
  assert.equal(pairs[1].chinese, '你好吗？');
});

test('buildVideoBook records the video source and timed pairs', () => {
  const cues = parseSrt(
    srt([
      ['00:00:01,000 --> 00:00:03,000', 'こんにちは。', '你好。'],
      ['00:00:03,500 --> 00:00:05,000', '元気ですか？', '你好吗？'],
    ])
  );

  const book = buildVideoBook({
    title: '散歩VLOG',
    author: 'あかね',
    video: {
      provider: 'youtube',
      videoId: 'abcdefghijk',
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
      durationSec: 642,
    },
    cues,
  });

  assert.equal(book.source?.kind, 'video');
  assert.equal(book.source?.video?.videoId, 'abcdefghijk');
  assert.equal(book.author, 'あかね');
  assert.equal(book.chapters.length, 1);
  assert.equal(book.chapters[0].pairs.length, 2);
  assert.equal(book.chapters[0].pairs[0].startMs, 1000);
  assert.equal(book.chapters[0].pairs[1].endMs, 5000);
  assert.ok(book.chapters[0].pairs[0].id.startsWith(book.id));
});

test('buildVideoBook rejects a subtitle longer than the storage guard', () => {
  const cues = Array.from({ length: MAX_VIDEO_CUES + 1 }, (_, index) => ({
    index,
    start: '00:00:00,000',
    end: '00:00:01,000',
    startMs: 0,
    endMs: 1000,
    text: `第${index}句`,
  }));

  assert.throws(
    () =>
      buildVideoBook({
        title: '太长',
        video: { provider: 'local', fileName: 'long.mp4' },
        cues,
      }),
    /字幕太长/
  );
});

test('video books belong to their own source group and label', () => {
  const book: Book = {
    id: 'video-1',
    title: '视频',
    author: '视频',
    importedAt: 1,
    source: { kind: 'video', video: { provider: 'youtube', videoId: 'x' } },
    chapters: [],
  };

  assert.equal(sourceGroup(book), 'video');
  assert.equal(sourceLabel(book), '视频');
  assert.equal(sourceGroupLabel('video'), '视频');
});
