import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVocabPrompt } from '../src/lib/vocab/prompt';
import { parseVocabResponse } from '../src/lib/vocab/parse';
import { formatVocabExport } from '../src/lib/vocab/export';
import { filterVocabEntries } from '../src/lib/vocab/filter';
import type { VocabEntry } from '../src/types';

test('parses a JSON object with structured synonyms', () => {
  const result = parseVocabResponse(
    '```json\n{"reading":"わりきる","meaning":"想开","synonyms":[{"word":"受け入れる","nuance":"纳得"}],"core":"感情に区切りをつける","example":"仕事だと割り切る。"}\n```'
  );

  assert.equal(result?.reading, 'わりきる');
  assert.equal(result?.meaning, '想开');
  assert.deepEqual(result?.synonyms, [{ word: '受け入れる', nuance: '纳得' }]);
  assert.equal(result?.core, '感情に区切りをつける');
  assert.equal(result?.example, '仕事だと割り切る。');
});

test('parses synonyms written as bracketed strings', () => {
  const result = parseVocabResponse(
    '{"synonyms":["受け入れる（纳得）","諦める（断念）","切り替える"]}'
  );

  assert.deepEqual(result?.synonyms, [
    { word: '受け入れる', nuance: '纳得' },
    { word: '諦める', nuance: '断念' },
    { word: '切り替える' },
  ]);
});

test('returns null when the response has no usable fields', () => {
  assert.equal(parseVocabResponse('抱歉，我不能帮忙。'), null);
  assert.equal(parseVocabResponse('{"unknown":"value"}'), null);
});

test('prompt keeps the article sentence and asks for JSON', () => {
  const prompt = buildVocabPrompt({
    word: '割り切る',
    example: '仕事だと割り切ることにした。',
    exampleTranslation: '我决定把工作上的事想开。',
  });

  assert.match(prompt, /割り切る/);
  assert.match(prompt, /仕事だと割り切ることにした。/);
  assert.match(prompt, /只输出一个 JSON/);
  assert.match(prompt, /example/);
  assert.match(prompt, /原样返回/);
});

test('prompt asks for an example when none is supplied', () => {
  const prompt = buildVocabPrompt({ word: '割り切る' });
  assert.match(prompt, /没有例句/);
  assert.match(prompt, /造一句/);
});

test('prompt keeps CORE distinct from the example sentence', () => {
  const prompt = buildVocabPrompt({ word: '手触り' });
  assert.match(prompt, /core 不要与 example 相同/);
});

test('export wraps the target and keeps the ref separators', () => {
  const entry: VocabEntry = {
    id: 'v1',
    word: '割り切る',
    reading: 'わりきる',
    meaning: '想开',
    synonyms: [{ word: '受け入れる', nuance: '纳得' }],
    core: '感情に区切りをつける',
    example: '仕事だと割り切ることにした。',
    exampleSource: 'article',
    status: 'new',
    createdAt: 1,
    updatedAt: 1,
  };

  assert.equal(
    formatVocabExport([entry]),
    '仕事だと[[割り切る]]ことにした。 :: 割り切る【わりきる】 :: 類：受け入れる（纳得） :: CORE：感情に区切りをつける'
  );
});

test('export still produces a usable line when there is no example', () => {
  const entry: VocabEntry = {
    id: 'v1',
    word: '割り切る',
    synonyms: [],
    example: '',
    exampleSource: 'ai',
    status: 'new',
    createdAt: 1,
    updatedAt: 1,
  };

  assert.equal(formatVocabExport([entry]), '[[割り切る]] :: 割り切る');
});

const entries: VocabEntry[] = [
  {
    id: 'v1',
    word: '割り切る',
    reading: 'わりきる',
    meaning: '想开',
    synonyms: [{ word: '受け入れる' }],
    core: '感情に区切りをつける',
    example: '仕事だと割り切ることにした。',
    exampleSource: 'article',
    source: { bookId: 'book-1', chapterId: 'chapter-1', chapterIndex: 0, pairId: 'p1' },
    status: 'new',
    createdAt: 2,
    updatedAt: 2,
  },
  {
    id: 'v2',
    word: '在り方',
    reading: 'ありかた',
    meaning: '应有的状态',
    synonyms: [],
    core: '物事がどう存在するか',
    example: '組織の在り方を考え直す。',
    exampleSource: 'article',
    source: { bookId: 'book-2', chapterId: 'chapter-2', chapterIndex: 0, pairId: 'p2' },
    status: 'known',
    createdAt: 1,
    updatedAt: 1,
  },
];

test('filter searches word, reading, meaning, core, and example', () => {
  assert.deepEqual(filterVocabEntries(entries, { query: 'わりきる' }).map((e) => e.id), ['v1']);
  assert.deepEqual(filterVocabEntries(entries, { query: '存在' }).map((e) => e.id), ['v2']);
  assert.deepEqual(filterVocabEntries(entries, { query: '組織' }).map((e) => e.id), ['v2']);
});

test('filter applies a chapter', () => {
  assert.deepEqual(
    filterVocabEntries(entries, { chapterId: 'chapter-2' }).map((e) => e.id),
    ['v2']
  );
});

test('filter applies book and status, and sorts newest first', () => {
  assert.deepEqual(
    filterVocabEntries(entries, { bookId: 'book-1' }).map((e) => e.id),
    ['v1']
  );
  assert.deepEqual(
    filterVocabEntries(entries, { status: 'known' }).map((e) => e.id),
    ['v2']
  );
  assert.deepEqual(
    filterVocabEntries(entries).map((e) => e.id),
    ['v1', 'v2']
  );
});

test('filter does not mutate the input order', () => {
  const input = [...entries];
  filterVocabEntries(input);
  assert.deepEqual(input.map((e) => e.id), ['v1', 'v2']);
});
