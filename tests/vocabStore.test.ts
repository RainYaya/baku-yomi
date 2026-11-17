import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useVocabStore } from '../src/stores/vocabSlice';
import type { VocabEntry } from '../src/types';

const entry: VocabEntry = {
  id: 'vocab-1',
  word: '割り切る',
  reading: 'わりきる',
  meaning: '想开',
  synonyms: [],
  core: '感情に区切りをつける',
  example: '仕事だと割り切ることにした。',
  exampleSource: 'article',
  status: 'new',
  createdAt: 1,
  updatedAt: 1,
};

test('vocab store adds newest first and updates an entry', () => {
  useVocabStore.setState({ entries: [] });
  useVocabStore.getState().addEntry(entry);
  useVocabStore.getState().addEntry({ ...entry, id: 'vocab-2', word: '在り方' });

  assert.deepEqual(
    useVocabStore.getState().entries.map((item) => item.id),
    ['vocab-2', 'vocab-1']
  );

  useVocabStore.getState().updateEntry('vocab-1', { meaning: '接受现实' });
  const updated = useVocabStore.getState().entries.find((item) => item.id === 'vocab-1');
  assert.equal(updated?.meaning, '接受现实');
  assert.ok((updated?.updatedAt ?? 0) >= 1);
});

test('vocab store marks an entry known and removes it', () => {
  useVocabStore.setState({ entries: [entry] });
  useVocabStore.getState().setStatus('vocab-1', 'known');
  assert.equal(useVocabStore.getState().entries[0].status, 'known');

  useVocabStore.getState().removeEntry('vocab-1');
  assert.deepEqual(useVocabStore.getState().entries, []);
});
