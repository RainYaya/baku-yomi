import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorUnits, findUnitTable, stripUnitTable } from '../src/lib/ai/anchor';
import { explainMachine, type ExplainEvent, type ExplainState } from '../src/machines/explain';
import { buildExplainPrompt, buildExplainSystemPrompt } from '../src/lib/ai/explainPrompts';
import { parseBlocks } from '../src/components/explain/MarkdownBlock';
import type { ExplainAnswer } from '../src/types/explain';

const SENTENCE = '彼は本を読みながら、窓の外を眺めていた。';

const table = (rows: string[]) =>
  ['| Text | POS | Role | Meaning |', '|------|-----|------|---------|', ...rows].join('\n');

test('anchor: clean table maps every row onto the sentence', () => {
  const rows = [
    ['彼', '名词', '主语', '他'],
    ['本を', '名词+助词', '宾语', '书'],
    ['読みながら', '动词短语', '状语', '一边读'],
    ['窓の外を', '名词短语', '宾语', '窗外'],
    ['眺めていた', '动词', '谓语', '望着'],
  ].map((cells) => cells.join(' | ').replace(/^/, '| ') + ' |');

  const result = anchorUnits(
    rows.map((row) => row.split('|').slice(1, -1).map((cell) => cell.trim())),
    SENTENCE
  );

  assert.equal(result.rejected, false);
  assert.equal(result.dropped, 0);
  assert.equal(result.units.length, 5);
  assert.equal(SENTENCE.slice(result.units[0].start, result.units[0].end), '彼');
  assert.equal(result.units[2].role, '状语');
});

test('anchor: nested rows keep the outer unit instead of rejecting the table', () => {
  // The model routinely emits both 「読みながら」 and 「ながら」. They overlap by
  // construction; the outer unit must win and the table must survive.
  const result = anchorUnits(
    [
      ['読みながら', '动词短语', '方式状语', '一边读书'],
      ['ながら', '接续助词', '连接', '同时进行'],
      ['窓の外を', '名词短语', '宾语', '眺望的对象'],
    ],
    SENTENCE
  );

  assert.equal(result.rejected, false);
  assert.equal(result.units.length, 2);
  assert.equal(result.units[0].text, '読みながら');
  assert.equal(result.units[1].text, '窓の外を');
  assert.equal(result.dropped, 1);
});

test('anchor: an invented fragment is dropped, not placed', () => {
  const result = anchorUnits(
    [
      ['彼', '名词', '主语', '他'],
      ['読書する', '动词', '谓语', '读书'],
      ['眺めていた', '动词', '谓语', '望着'],
    ],
    SENTENCE
  );

  assert.equal(result.units.length, 2);
  assert.equal(result.dropped, 1);
  assert.ok(!result.units.some((unit) => unit.text === '読書する'));
});

test('anchor: Japanese characters are never treated as mid-word boundaries', () => {
  // Japanese has no spaces, so a \p{L}-based boundary check would reject every
  // single-character unit. 「彼」 followed by 「は」 is a valid boundary.
  const result = anchorUnits([['彼', '名詞', '主語', '彼']], SENTENCE);
  assert.equal(result.units.length, 1);
  assert.equal(result.units[0].start, 0);
});

test('anchor: a table where most rows fail is rejected wholesale', () => {
  const result = anchorUnits(
    [
      ['存在しない一', '名词', '主语', 'x'],
      ['存在しない二', '名词', '主语', 'y'],
      ['彼', '名词', '主语', '他'],
    ],
    SENTENCE
  );

  assert.equal(result.rejected, true);
  assert.equal(result.units.length, 0);
});

test('anchor: no table at all is not a rejection', () => {
  const result = anchorUnits([], SENTENCE);
  assert.equal(result.rejected, false);
  assert.equal(result.units.length, 0);
});

test('findUnitTable: locates the table and tolerates translated headers', () => {
  const english = findUnitTable(table(['| 彼 | 名词 | 主语 | 他 |']));
  assert.ok(english);
  assert.equal(english.rows.length, 1);

  const japanese = findUnitTable(
    ['| 原文 | 品詞 | 役割 | 意味 |', '|---|---|---|---|', '| 彼 | 名詞 | 主語 | 彼 |'].join('\n')
  );
  assert.ok(japanese);
  assert.equal(japanese.rows.length, 1);
});

test('findUnitTable: ignores prose tables that are not the unit table', () => {
  const prose = ['| 项目 | 说明 |', '|---|---|', '| a | b |'].join('\n');
  assert.equal(findUnitTable(prose), null);
});

test('stripUnitTable: removes the table and keeps the prose around it', () => {
  const markdown = [
    '### 主干',
    '主干是彼は眺めていた。',
    '',
    table(['| 彼 | 名词 | 主语 | 他 |']),
    '',
    '### 关键点',
    '1. ながら 表示同时。',
  ].join('\n');

  const parsed = findUnitTable(markdown);
  assert.ok(parsed);
  const prose = stripUnitTable(markdown, parsed);

  assert.ok(!prose.includes('| Text |'));
  assert.ok(prose.includes('### 主干'));
  assert.ok(prose.includes('### 关键点'));
});

test('markdown: a half-streamed marker still terminates', { timeout: 1000 }, () => {
  // The model streams "###", "-" and "1." before their text arrives. Those
  // look like block starts but are not; the parser must consume them instead
  // of breaking out of its paragraph loop without advancing.
  for (const input of ['###', '-', '1.', '#### ', '### 大意\n-', '1.']) {
    const blocks = parseBlocks(input);
    assert.ok(blocks.length >= 1, `no block for ${JSON.stringify(input)}`);
  }

  const mixed = parseBlocks('### 大意\n这是解释。\n\n- 第一点');
  assert.equal(mixed.length, 3);
  assert.equal(mixed[0].kind, 'heading');
  assert.equal(mixed[2].kind, 'list');
});

test('explain machine: only the newest request can complete', () => {
  let state: ExplainState = explainMachine.initial;
  const send = (event: ExplainEvent) => {
    state = explainMachine.transition(state, event);
  };

  send({ type: 'START', requestId: 1, action: 'meaning' });
  send({ type: 'DELTA', requestId: 1, text: 'a' });
  assert.equal(state.status, 'streaming');

  // A second request supersedes the first.
  send({ type: 'START', requestId: 2, action: 'grammar' });
  send({ type: 'DELTA', requestId: 1, text: 'stale' });
  assert.equal(state.status, 'streaming');
  if (state.status === 'streaming') assert.equal(state.text, '');

  const answer: ExplainAnswer = {
    action: 'grammar',
    markdown: 'ok',
    units: [],
    unitsRejected: false,
    model: 'test',
    createdAt: 0,
  };
  send({ type: 'SUCCEEDED', requestId: 1, answer });
  assert.equal(state.status, 'streaming', 'stale success must be ignored');

  send({ type: 'SUCCEEDED', requestId: 2, answer });
  assert.equal(state.status, 'ready');
});

test('explain machine: a failure from a superseded request is ignored', () => {
  let state: ExplainState = explainMachine.initial;
  const send = (event: ExplainEvent) => {
    state = explainMachine.transition(state, event);
  };

  send({ type: 'START', requestId: 1, action: 'meaning' });
  send({ type: 'START', requestId: 2, action: 'usage' });
  send({ type: 'FAILED', requestId: 1, message: 'old' });
  assert.equal(state.status, 'streaming');
});

test('prompts: the grammar action demands the table explicitly', () => {
  const prompt = buildExplainPrompt({
    sentence: SENTENCE,
    fragment: '読みながら',
    action: 'grammar',
    depth: 'concise',
    targetLanguage: 'zh-Hans',
  });

  assert.ok(prompt.includes('| Text | POS | Role | Meaning |'));
  assert.ok(prompt.includes('必须'));
  assert.ok(prompt.includes('逐字'));
  // The fragment must be framed as the focus, with the sentence as context.
  assert.ok(prompt.includes('选中片段'));
});

test('prompts: system prompt names the target language and forbids preamble', () => {
  const system = buildExplainSystemPrompt({
    sentence: SENTENCE,
    fragment: '',
    action: 'meaning',
    depth: 'concise',
    targetLanguage: 'ja',
  });

  assert.ok(system.includes('日本語'));
  assert.ok(system.includes('不要寒暄'));
});
