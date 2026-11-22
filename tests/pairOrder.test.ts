import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PAIR_ORDER_LABELS,
  pairOrderLines,
} from '../src/lib/pairOrder';
import { useSettingsStore } from '../src/stores/settingsSlice';

test('pairOrderLines puts Japanese first for ja-zh', () => {
  assert.deepEqual(pairOrderLines('ja-zh'), ['ja', 'zh']);
});

test('pairOrderLines puts Chinese first for zh-ja', () => {
  assert.deepEqual(pairOrderLines('zh-ja'), ['zh', 'ja']);
});

test('pair order labels read as the visible order', () => {
  assert.equal(PAIR_ORDER_LABELS['ja-zh'], '日中');
  assert.equal(PAIR_ORDER_LABELS['zh-ja'], '中日');
});

test('settings default to Japanese-first and switch to Chinese-first', () => {
  assert.equal(useSettingsStore.getState().pairOrder, 'ja-zh');

  useSettingsStore.getState().setPairOrder('zh-ja');
  assert.equal(useSettingsStore.getState().pairOrder, 'zh-ja');

  useSettingsStore.getState().setPairOrder('ja-zh');
  assert.equal(useSettingsStore.getState().pairOrder, 'ja-zh');
});
