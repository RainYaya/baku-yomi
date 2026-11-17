import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useSettingsStore } from '../src/stores/settingsSlice';

test('vocab list opens compact and remembers a switch to cards', () => {
  assert.equal(useSettingsStore.getState().vocabDensity, 'compact');

  useSettingsStore.getState().setVocabDensity('card');
  assert.equal(useSettingsStore.getState().vocabDensity, 'card');

  useSettingsStore.getState().setVocabDensity('compact');
  assert.equal(useSettingsStore.getState().vocabDensity, 'compact');
});
