import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildSubtitleBook,
  cuesToPairs,
  parseSrt,
  parseVtt,
} from '../src/lib/import/subtitle';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/subtitle/${name}`, import.meta.url), 'utf8');

test('parseSrt reads cues, strips tags and joins cue lines', () => {
  const cues = parseSrt(fixture('basic.srt'));

  assert.equal(cues.length, 2);
  assert.deepEqual(
    cues.map((cue) => [cue.start, cue.end, cue.text]),
    [
      ['00:00:01,000', '00:00:03,000', 'おはよう。'],
      ['00:00:03,500', '00:00:05,000', '今日はいい天気ですね。'],
    ]
  );
});

test('parseVtt skips WEBVTT, NOTE blocks and strips inline tags', () => {
  const cues = parseVtt(fixture('basic.vtt'));

  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, 'おはよう。');
  assert.equal(cues[1].text, '元気？');
  assert.equal(cues[0].start, '00:00:01.000');
});

test('cuesToPairs pairs Japanese and Chinese lines inside a bilingual cue', () => {
  const pairs = cuesToPairs(parseSrt(fixture('bilingual.srt')));

  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].japanese, 'こんにちは。');
  assert.equal(pairs[0].chinese, '你好。');
  assert.equal(pairs[1].japanese, '元気ですか？');
  assert.equal(pairs[1].chinese, '你好吗？');
});

test('cuesToPairs keeps monolingual Japanese with an empty Chinese', () => {
  const pairs = cuesToPairs(parseSrt(fixture('basic.srt')));

  assert.equal(pairs.length, 2);
  assert.ok(pairs.every((pair) => pair.japanese.length > 0));
  assert.ok(pairs.every((pair) => pair.chinese === ''));
});

test('cuesToPairs merges a wrapped monolingual cue into one sentence', () => {
  const pairs = cuesToPairs(parseSrt(fixture('wrapped.srt')));

  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].japanese, 'これは長い日本語の文です。');
});

test('parseSrt survives dirty input without throwing', () => {
  const cues = parseSrt(fixture('dirty.srt'));

  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, '最初の文。');
  assert.equal(cues[1].text, '二つ目の文。');
});

test('buildSubtitleBook creates a subtitle-sourced book with stable pairs', () => {
  const book = buildSubtitleBook({
    title: '第1話「試着室」',
    text: fixture('bilingual.srt'),
    format: 'srt',
  });

  assert.equal(book.title, '第1話「試着室」');
  assert.equal(book.source?.kind, 'subtitle');
  assert.equal(book.chapters.length, 1);
  assert.equal(book.chapters[0].pairs.length, 2);
  assert.equal(book.chapters[0].pairs[0].japanese, 'こんにちは。');
  assert.ok(
    book.chapters[0].pairs.every((pair) => pair.id.startsWith(book.id))
  );
});

test('buildSubtitleBook rejects an empty or cue-less file', () => {
  assert.throws(
    () => buildSubtitleBook({ title: '空', text: '', format: 'srt' }),
    /没有可用的句子/
  );
  assert.throws(
    () =>
      buildSubtitleBook({
        title: '空',
        text: 'WEBVTT\n\nNOTE only a comment\n',
        format: 'vtt',
      }),
    /没有可用的句子/
  );
});
