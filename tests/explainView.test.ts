import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainMachine, type ExplainState } from '../src/machines/explain';
import { selectExplainView } from '../src/lib/explain/view';
import type { ExplainAction, ExplainAnswer } from '../src/types';

const answer = (action: ExplainAction, markdown: string): ExplainAnswer => ({
  action,
  markdown,
  units: [],
  unitsRejected: false,
  model: 'test',
  createdAt: 0,
});

const READY_MEANING = answer('meaning', 'saved meaning');
const READY_GRAMMAR = answer('grammar', 'saved grammar');
const CACHED_MEANING = answer('meaning', 'cached meaning');

const ready = (value: ExplainAnswer): ExplainState => ({
  status: 'ready',
  requestId: 1,
  answer: value,
});

const streaming = (action: ExplainAction, text: string): ExplainState => ({
  status: 'streaming',
  requestId: 2,
  action,
  text,
});

const failed = (action: ExplainAction, message: string): ExplainState => ({
  status: 'failed',
  requestId: 3,
  action,
  message,
});

test('explain view: a live answer only shows under the action that produced it', () => {
  const view = selectExplainView(ready(READY_GRAMMAR), 'meaning', CACHED_MEANING);
  assert.equal(view.shownAnswer, CACHED_MEANING);
  assert.equal(view.busy, false);
  assert.equal(view.failure, null);
});

test('explain view: a live answer wins over a cached one for the same action', () => {
  const view = selectExplainView(ready(READY_MEANING), 'meaning', CACHED_MEANING);
  assert.equal(view.shownAnswer, READY_MEANING);
});

test('explain view: streaming text from another action does not leak into the tab', () => {
  const view = selectExplainView(streaming('grammar', 'half a sentence'), 'meaning', CACHED_MEANING);
  assert.equal(view.busy, false);
  assert.equal(view.streamingText, '');
  assert.equal(view.shownAnswer, CACHED_MEANING);
});

test('explain view: streaming text for the current action replaces the cached answer', () => {
  const view = selectExplainView(streaming('meaning', '### 大意'), 'meaning', CACHED_MEANING);
  assert.equal(view.busy, true);
  assert.equal(view.streamingText, '### 大意');
  assert.equal(view.shownAnswer, null);
});

test('explain view: a failure is scoped to its action', () => {
  const other = selectExplainView(failed('grammar', 'grammar failed'), 'meaning', CACHED_MEANING);
  assert.equal(other.failure, null);
  assert.equal(other.shownAnswer, CACHED_MEANING);

  const same = selectExplainView(failed('meaning', 'meaning failed'), 'meaning', null);
  assert.equal(same.failure, 'meaning failed');
  assert.equal(same.shownAnswer, null);
});

test('explain view: a failed regenerate still offers the cached answer', () => {
  const view = selectExplainView(failed('meaning', 'timeout'), 'meaning', CACHED_MEANING);
  assert.equal(view.failure, 'timeout');
  assert.equal(view.shownAnswer, CACHED_MEANING);
});

test('explain machine: a failure records the action it belongs to', () => {
  let state: ExplainState = explainMachine.initial;
  state = explainMachine.transition(state, { type: 'START', requestId: 7, action: 'usage' });
  state = explainMachine.transition(state, { type: 'FAILED', requestId: 7, message: 'nope' });
  assert.equal(state.status, 'failed');
  if (state.status === 'failed') assert.equal(state.action, 'usage');
});
