import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTranslationResponse } from '../src/lib/ai/translateJson';

test('parses a plain JSON array', () => {
  const result = parseTranslationResponse(
    '[{"id":"a","chinese":"甲"},{"id":"b","chinese":"乙"}]'
  );
  assert.deepEqual(result, [
    { id: 'a', chinese: '甲' },
    { id: 'b', chinese: '乙' },
  ]);
});

test('ignores markdown fences and surrounding prose', () => {
  const result = parseTranslationResponse(
    '好的，这是译文：\n```json\n[{"id":"a","chinese":"甲"}]\n```\n希望有帮助。'
  );
  assert.deepEqual(result, [{ id: 'a', chinese: '甲' }]);
});

test('accepts the common wrapper objects', () => {
  assert.deepEqual(
    parseTranslationResponse('{"translations":[{"id":"a","chinese":"甲"}]}'),
    [{ id: 'a', chinese: '甲' }]
  );
  assert.deepEqual(
    parseTranslationResponse('{"items":[{"id":"a","translation":"甲"}]}'),
    [{ id: 'a', chinese: '甲' }]
  );
  assert.deepEqual(
    parseTranslationResponse('{"results":[{"pairId":"a","text":"甲"}]}'),
    [{ id: 'a', chinese: '甲' }]
  );
});

test('accepts an id-to-string map', () => {
  const result = parseTranslationResponse('{"a":"甲","b":"乙"}');
  assert.deepEqual(result, [
    { id: 'a', chinese: '甲' },
    { id: 'b', chinese: '乙' },
  ]);
});

test('repairs trailing commas', () => {
  const result = parseTranslationResponse('[{"id":"a","chinese":"甲"},]');
  assert.deepEqual(result, [{ id: 'a', chinese: '甲' }]);
});

test('keeps the first value for a duplicate id and drops empty text', () => {
  const result = parseTranslationResponse(
    '[{"id":"a","chinese":"甲"},{"id":"a","chinese":"重复"},{"id":"b","chinese":"  "}]'
  );
  assert.deepEqual(result, [{ id: 'a', chinese: '甲' }]);
});

test('finds an array nested under an unknown wrapper key', () => {
  const result = parseTranslationResponse(
    '{"note":"x","data":[{"id":"a","chinese":"甲"}]}'
  );
  assert.deepEqual(result, [{ id: 'a', chinese: '甲' }]);
});

test('does not mistake a mixed wrapper object for an id map', () => {
  assert.deepEqual(parseTranslationResponse('{"note":"x","count":2}'), []);
});

test('returns an empty list when there is no JSON', () => {
  assert.deepEqual(parseTranslationResponse('抱歉，我无法翻译。'), []);
});
