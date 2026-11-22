import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMaterialPrompt } from '../src/lib/ai/materialPrompts';
import { parseMaterialJson, validateMaterial } from '../src/lib/ai/materialJson';

const GOOD = {
  title: '試着室で',
  level: 'N3',
  format: 'dialogue',
  lines: [
    { speaker: '店員', japanese: 'いらっしゃいませ。', chinese: '欢迎光临。' },
    { japanese: '試着してもいいですか。', chinese: '可以试穿吗？' },
  ],
  notes: [{ word: '試着', reading: 'しちゃく', meaning: '试穿' }],
};

test('parseMaterialJson reads fenced JSON with surrounding prose', () => {
  const raw = `好的，材料如下：\n\`\`\`json\n${JSON.stringify(GOOD)}\n\`\`\`\n希望有帮助。`;
  const result = parseMaterialJson(raw);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.material.title, '試着室で');
  assert.equal(result.material.lines.length, 2);
  assert.equal(result.material.lines[0].speaker, '店員');
  assert.equal(result.material.lines[1].speaker, undefined);
  assert.deepEqual(result.material.notes, GOOD.notes);
});

test('parseMaterialJson reports a visible error for empty or broken output', () => {
  for (const raw of ['', '   ', 'not json at all', '{"title": "x"']) {
    const result = parseMaterialJson(raw);
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.match(result.error, /\S/);
  }
});

test('validateMaterial rejects a missing title or missing lines', () => {
  assert.equal(validateMaterial({ ...GOOD, title: '  ' }).ok, false);
  assert.equal(validateMaterial({ ...GOOD, lines: [] }).ok, false);
  assert.equal(validateMaterial({ ...GOOD, lines: undefined }).ok, false);
});

test('validateMaterial accepts optional speakers and defaults notes', () => {
  const result = validateMaterial({
    title: '朝の会話',
    lines: [{ japanese: 'おはよう。', chinese: '早上好。' }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.material.lines[0].speaker, undefined);
  assert.deepEqual(result.material.notes, []);
  assert.equal(result.material.level, 'N3');
  assert.equal(result.material.format, 'dialogue');
});

test('validateMaterial drops lines without both languages and clamps to twenty', () => {
  const lines = Array.from({ length: 24 }, (_, index) => ({
    japanese: `文${index}。`,
    chinese: `句子${index}。`,
  }));
  lines.splice(3, 0, { japanese: '日本語だけ。', chinese: '' } as never);

  const result = validateMaterial({ ...GOOD, lines });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.material.lines.length, 20);
  assert.equal(result.material.lines[3].japanese, '文3。');
});

test('buildMaterialPrompt carries the scenario, level, format and line range', () => {
  const prompt = buildMaterialPrompt({
    scenario: '在日本买衣服，和店员对话',
    level: 'N4',
    format: 'dialogue',
    length: 'medium',
  });

  assert.match(prompt, /在日本买衣服/);
  assert.match(prompt, /N4/);
  assert.match(prompt, /对话/);
  assert.match(prompt, /10\s*[–-]\s*14/);
  assert.match(prompt, /"lines"/);
  assert.match(prompt, /JSON/);
});
