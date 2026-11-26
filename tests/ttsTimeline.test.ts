import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkText, layoutTimeline, pauseAfter } from '../worker/timeline';

test('a sentence ending gets a longer pause than a comma', () => {
  assert.equal(pauseAfter('こんにちは。'), 350);
  assert.equal(pauseAfter('元気ですか？'), 350);
  assert.equal(pauseAfter('本当に！'), 350);
  assert.equal(pauseAfter('そう…'), 450);
  assert.equal(pauseAfter('これは、'), 250);
  assert.equal(pauseAfter('headline'), 250);
  assert.equal(pauseAfter('  もう終わり。  '), 350);
  assert.equal(pauseAfter(''), 250);
});


test('a short paragraph stays one chunk', () => {
  assert.deepEqual(chunkText('吾輩は猫である。', 280), ['吾輩は猫である。']);
});

test('blank text produces no chunk', () => {
  assert.deepEqual(chunkText('   \n  '), []);
});

test('long text splits at Japanese punctuation and keeps it', () => {
  const text =
    'あ'.repeat(80) +
    '。' +
    'い'.repeat(80) +
    '！' +
    'う'.repeat(80) +
    '？';

  const chunks = chunkText(text, 120);

  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((chunk) => chunk.length <= 120));
  assert.equal(chunks.join(''), text);
  assert.ok(chunks[0].endsWith('。'));
  assert.ok(chunks[1].endsWith('！'));
  assert.ok(chunks[2].endsWith('？'));
});

test('an unbroken sentence is cut at the limit', () => {
  const text = 'あ'.repeat(25);
  const chunks = chunkText(text, 10);

  assert.deepEqual(
    chunks.map((chunk) => chunk.length),
    [10, 10, 5]
  );
  assert.equal(chunks.join(''), text);
});

test('timeline uses absolute times across chapters and gaps only between pairs', () => {
  const timeline = layoutTimeline(
    [
      [1000, 2000],
      [500],
    ],
    [
      [250, 0],
      [0],
    ]
  );

  assert.deepEqual(timeline.chapters[0], {
    index: 0,
    startMs: 0,
    endMs: 3250,
    durationMs: 3250,
    pairs: [
      { startMs: 0, endMs: 1000 },
      { startMs: 1250, endMs: 3250 },
    ],
  });

  assert.deepEqual(timeline.chapters[1], {
    index: 1,
    startMs: 3250,
    endMs: 3750,
    durationMs: 500,
    pairs: [{ startMs: 3250, endMs: 3750 }],
  });

  const lastPair = timeline.chapters[1].pairs.at(-1);
  assert.equal(lastPair?.endMs, timeline.chapters[1].endMs);
});

test('a longer pause after a sentence pushes the next pair later', () => {
  const timeline = layoutTimeline([[1000, 1000]], [[350, 0]]);

  assert.deepEqual(timeline.chapters[0].pairs, [
    { startMs: 0, endMs: 1000 },
    { startMs: 1350, endMs: 2350 },
  ]);
  assert.equal(timeline.chapters[0].durationMs, 2350);
});

test('an empty chapter has zero duration and does not move the cursor', () => {
  const timeline = layoutTimeline([[], [400]], [[], [0]]);

  assert.deepEqual(timeline.chapters[0], {
    index: 0,
    startMs: 0,
    endMs: 0,
    durationMs: 0,
    pairs: [],
  });
  assert.equal(timeline.chapters[1].startMs, 0);
  assert.equal(timeline.chapters[1].pairs[0].endMs, 400);
});
