import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeneratedBook } from '../src/lib/import/generatedMaterial';
import type { GeneratedMaterial } from '../src/lib/ai/materialJson';

const MATERIAL: GeneratedMaterial = {
  title: '試着室で',
  level: 'N3',
  format: 'dialogue',
  lines: [
    { speaker: '店員', japanese: 'いらっしゃいませ。', chinese: '欢迎光临。' },
    { japanese: '試着してもいいですか。', chinese: '可以试穿吗？' },
  ],
  notes: [{ word: '試着', reading: 'しちゃく', meaning: '试穿' }],
};

test('buildGeneratedBook makes one AI-sourced chapter with bilingual pairs', () => {
  const book = buildGeneratedBook({
    scenario: '在日本买衣服，和店员对话',
    material: MATERIAL,
  });

  assert.equal(book.title, '試着室で');
  assert.equal(book.source?.kind, 'ai');
  assert.equal(book.source?.scenario, '在日本买衣服，和店员对话');
  assert.equal(book.chapters.length, 1);

  const pairs = book.chapters[0].pairs;
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].japanese, 'いらっしゃいませ。');
  assert.equal(pairs[0].chinese, '欢迎光临。');
  assert.equal(new Set(pairs.map((pair) => pair.id)).size, 2);
  assert.ok(pairs.every((pair) => pair.id.startsWith(book.id)));
});

test('buildGeneratedBook refuses a material with no usable lines', () => {
  assert.throws(
    () =>
      buildGeneratedBook({
        scenario: '空的情景',
        material: { ...MATERIAL, lines: [] },
      }),
    /没有可用的句子/
  );
});
