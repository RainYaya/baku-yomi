import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoReadMachine,
  readerSessionMachine,
  type AutoReadEvent,
  type AutoReadState,
  type ReaderSessionEvent,
  type ReaderSessionState,
} from '../src/machines/reader';
import { ttsMachine, type TtsEvent, type TtsState } from '../src/machines/tts';
import { importMachine, type ImportEvent, type ImportState } from '../src/machines/import';
import { welcomeMachine, type WelcomeEvent, type WelcomeState } from '../src/machines/welcome';
import { runKeyboardHandlers, type KeyboardEntry } from '../src/lib/keyboard';

function send<S, E>(
  machine: { transition: (state: S, event: E) => S },
  state: S,
  event: E
): S {
  return machine.transition(state, event);
}

test('reader session: select, open inline, analyze, review', () => {
  let state: ReaderSessionState = readerSessionMachine.initial;
  assert.deepEqual(state, { surface: 'reading', pairId: null, phase: 'idle' });

  state = send(readerSessionMachine, state, {
    type: 'SELECT',
    pairId: 'p1',
    hasAnalysis: false,
  } satisfies ReaderSessionEvent);
  assert.deepEqual(state, { surface: 'selected', pairId: 'p1', phase: 'idle' });

  // Opening the inline card is deliberate; selection alone never opens it.
  state = send(readerSessionMachine, state, { type: 'OPEN_INLINE' });
  assert.deepEqual(state, { surface: 'inline', pairId: 'p1', phase: 'idle' });

  state = send(readerSessionMachine, state, { type: 'SUBMIT', requestId: 1 });
  assert.deepEqual(state, {
    surface: 'inline',
    pairId: 'p1',
    phase: 'analyzing',
    requestId: 1,
    message: undefined,
  });

  // A stale response must not overwrite the current request.
  state = send(readerSessionMachine, state, {
    type: 'ANALYSIS_SUCCEEDED',
    requestId: 2,
  });
  assert.equal(state.phase, 'analyzing');

  state = send(readerSessionMachine, state, {
    type: 'ANALYSIS_SUCCEEDED',
    requestId: 1,
  });
  assert.deepEqual(state, {
    surface: 'inline',
    pairId: 'p1',
    phase: 'reviewed',
    requestId: 1,
    message: undefined,
  });

  // Escape steps back one level at a time.
  state = send(readerSessionMachine, state, { type: 'BACK' });
  assert.deepEqual(state, {
    surface: 'selected',
    pairId: 'p1',
    phase: 'reviewed',
    requestId: 1,
    message: undefined,
  });

  state = send(readerSessionMachine, state, { type: 'BACK' });
  assert.deepEqual(state, { surface: 'reading', pairId: null, phase: 'idle' });
});

test('reader session: selecting a reviewed pair opens the comparison', () => {
  const state = send(readerSessionMachine, readerSessionMachine.initial, {
    type: 'SELECT',
    pairId: 'p2',
    hasAnalysis: true,
  } satisfies ReaderSessionEvent);
  assert.deepEqual(state, { surface: 'selected', pairId: 'p2', phase: 'reviewed' });
});

test('reader session: desk steps back to the inline card', () => {
  let state: ReaderSessionState = {
    surface: 'selected',
    pairId: 'p1',
    phase: 'reviewed',
  };
  state = send(readerSessionMachine, state, { type: 'OPEN_DESK' });
  assert.equal(state.surface, 'desk');

  state = send(readerSessionMachine, state, { type: 'BACK' });
  assert.deepEqual(state, { surface: 'inline', pairId: 'p1', phase: 'reviewed' });

  state = send(readerSessionMachine, state, { type: 'CLOSE' });
  assert.deepEqual(state, { surface: 'reading', pairId: null, phase: 'idle' });
});

test('reader session: opening a surface without a sentence is ignored', () => {
  let state = readerSessionMachine.initial;
  state = send(readerSessionMachine, state, { type: 'OPEN_INLINE' });
  assert.equal(state.surface, 'reading');
  state = send(readerSessionMachine, state, { type: 'OPEN_DESK' });
  assert.equal(state.surface, 'reading');
});

test('reader session: failure carries the message and can be closed', () => {
  let state: ReaderSessionState = {
    surface: 'inline',
    pairId: 'p1',
    phase: 'analyzing',
    requestId: 3,
  };
  state = send(readerSessionMachine, state, {
    type: 'ANALYSIS_FAILED',
    requestId: 3,
    message: 'network down',
  });
  assert.deepEqual(state, {
    surface: 'inline',
    pairId: 'p1',
    phase: 'failed',
    requestId: 3,
    message: 'network down',
  });

  state = send(readerSessionMachine, state, { type: 'CLOSE' });
  assert.deepEqual(state, { surface: 'reading', pairId: null, phase: 'idle' });
});

test('reader session: submit from reading is ignored', () => {
  const state = send(readerSessionMachine, readerSessionMachine.initial, {
    type: 'SUBMIT',
    requestId: 1,
  });
  assert.deepEqual(state, { surface: 'reading', pairId: null, phase: 'idle' });
});

test('auto read: start, play, advance, stop', () => {
  let state: AutoReadState = autoReadMachine.initial;
  state = send(autoReadMachine, state, {
    type: 'START',
    pairId: 'p1',
  } satisfies AutoReadEvent);
  assert.deepEqual(state, { status: 'starting', pairId: 'p1' });

  state = send(autoReadMachine, state, { type: 'STARTED', pairId: 'p1' });
  assert.deepEqual(state, { status: 'playing', pairId: 'p1' });

  state = send(autoReadMachine, state, { type: 'ADVANCE', pairId: 'p2' });
  assert.deepEqual(state, { status: 'starting', pairId: 'p2' });

  state = send(autoReadMachine, state, { type: 'STOP' });
  assert.deepEqual(state, { status: 'stopping', pairId: 'p2' });

  state = send(autoReadMachine, state, { type: 'STOPPED' });
  assert.deepEqual(state, { status: 'off' });
});

test('auto read: stale started event and double start are ignored', () => {
  let state: AutoReadState = { status: 'starting', pairId: 'p1' };
  state = send(autoReadMachine, state, { type: 'STARTED', pairId: 'p2' });
  assert.deepEqual(state, { status: 'starting', pairId: 'p1' });

  state = { status: 'playing', pairId: 'p1' };
  state = send(autoReadMachine, state, { type: 'START', pairId: 'p2' });
  assert.deepEqual(state, { status: 'playing', pairId: 'p1' });

  state = send(autoReadMachine, state, { type: 'ERROR' });
  assert.deepEqual(state, { status: 'off' });
});

test('auto read: finishing the chapter returns to off', () => {
  const state = send(
    autoReadMachine,
    { status: 'playing', pairId: 'p1' } satisfies AutoReadState,
    { type: 'FINISH' }
  );
  assert.deepEqual(state, { status: 'off' });
});

test('tts: metadata, play, time, pause, resume', () => {
  let state: TtsState = ttsMachine.initial;
  state = send(ttsMachine, state, {
    type: 'LOAD',
    token: 1,
    pairId: 'p1',
  } satisfies TtsEvent);
  assert.deepEqual(state, {
    status: 'loading',
    token: 1,
    pairId: 'p1',
    duration: 0,
  });

  state = send(ttsMachine, state, {
    type: 'METADATA',
    token: 1,
    duration: 10,
  });
  assert.deepEqual(state, {
    status: 'loading',
    token: 1,
    pairId: 'p1',
    duration: 10,
  });

  state = send(ttsMachine, state, { type: 'PLAY', token: 1 });
  assert.deepEqual(state, {
    status: 'playing',
    token: 1,
    pairId: 'p1',
    duration: 10,
    currentTime: 0,
  });

  state = send(ttsMachine, state, { type: 'TIME', token: 1, currentTime: 4 });
  assert.equal(state.status, 'playing');
  assert.equal('currentTime' in state ? state.currentTime : -1, 4);

  state = send(ttsMachine, state, { type: 'PAUSE', token: 1, currentTime: 4 });
  assert.equal(state.status, 'paused');

  state = send(ttsMachine, state, { type: 'PLAY', token: 1 });
  assert.equal(state.status, 'playing');
});

test('tts: a newer token invalidates older events', () => {
  let state: TtsState = {
    status: 'playing',
    token: 1,
    pairId: 'p1',
    duration: 10,
    currentTime: 3,
  };

  state = send(ttsMachine, state, {
    type: 'LOAD',
    token: 2,
    pairId: 'p2',
  });
  assert.deepEqual(state, {
    status: 'loading',
    token: 2,
    pairId: 'p2',
    duration: 0,
  });

  state = send(ttsMachine, state, {
    type: 'METADATA',
    token: 1,
    duration: 99,
  });
  assert.deepEqual(state, {
    status: 'loading',
    token: 2,
    pairId: 'p2',
    duration: 0,
  });

  state = send(ttsMachine, state, { type: 'PLAY', token: 2 });
  assert.equal(state.status, 'playing');
  assert.equal('pairId' in state ? state.pairId : null, 'p2');
});

test('tts: end, error, stop', () => {
  let state: TtsState = {
    status: 'playing',
    token: 1,
    pairId: 'p1',
    duration: 10,
    currentTime: 3,
  };
  state = send(ttsMachine, state, { type: 'END', token: 1 });
  assert.deepEqual(state, { status: 'idle' });

  state = send(ttsMachine, state, {
    type: 'LOAD',
    token: 2,
    pairId: 'p2',
  });
  state = send(ttsMachine, state, {
    type: 'ERROR',
    token: 2,
    message: 'tts failed',
  });
  assert.deepEqual(state, {
    status: 'error',
    token: 2,
    pairId: 'p2',
    message: 'tts failed',
  });

  state = send(ttsMachine, state, { type: 'STOP' });
  assert.deepEqual(state, { status: 'idle' });
});

test('import: parse, success, reset, failure', () => {
  let state: ImportState = importMachine.initial;
  state = send(importMachine, state, {
    type: 'PARSE',
    fileName: 'book.epub',
  } satisfies ImportEvent);
  assert.deepEqual(state, { status: 'parsing', fileName: 'book.epub' });

  // A second drop while parsing is ignored.
  state = send(importMachine, state, {
    type: 'PARSE',
    fileName: 'other.epub',
  });
  assert.deepEqual(state, { status: 'parsing', fileName: 'book.epub' });

  state = send(importMachine, state, { type: 'SUCCESS', bookId: 'b1' });
  assert.deepEqual(state, {
    status: 'success',
    fileName: 'book.epub',
    bookId: 'b1',
  });

  state = send(importMachine, state, { type: 'RESET' });
  assert.deepEqual(state, { status: 'idle' });

  state = send(importMachine, state, {
    type: 'PARSE',
    fileName: 'bad.epub',
  });
  state = send(importMachine, state, {
    type: 'FAIL',
    message: 'bad epub',
  });
  assert.deepEqual(state, {
    status: 'error',
    fileName: 'bad.epub',
    message: 'bad epub',
  });
});

test('welcome: hydration is explicit and dismiss is one-way', () => {
  let state: WelcomeState = welcomeMachine.initial;
  assert.deepEqual(state, { status: 'loading' });

  state = send(welcomeMachine, state, {
    type: 'HYDRATED',
    seen: false,
  } satisfies WelcomeEvent);
  assert.deepEqual(state, { status: 'visible' });

  state = send(welcomeMachine, state, {
    type: 'HYDRATED',
    seen: true,
  });
  assert.deepEqual(state, { status: 'visible' });

  state = send(welcomeMachine, state, { type: 'DISMISS' });
  assert.deepEqual(state, { status: 'dismissed' });

  state = send(welcomeMachine, state, { type: 'DISMISS' });
  assert.deepEqual(state, { status: 'dismissed' });
});

test('welcome: a seen guide goes straight to hidden', () => {
  const state = send(welcomeMachine, welcomeMachine.initial, {
    type: 'HYDRATED',
    seen: true,
  });
  assert.deepEqual(state, { status: 'hidden' });
});

function keyEvent(key: string): KeyboardEvent {
  const event = {
    key,
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
  };
  return event as unknown as KeyboardEvent;
}

test('keyboard: higher priority claims the key', () => {
  const calls: string[] = [];
  const handlers: KeyboardEntry[] = [
    {
      id: 'theme',
      priority: 0,
      handler: () => {
        calls.push('theme');
        return true;
      },
    },
    {
      id: 'reader',
      priority: 10,
      handler: () => {
        calls.push('reader');
        return true;
      },
    },
  ];

  const event = keyEvent('r');
  const handled = runKeyboardHandlers(event, handlers);
  assert.equal(handled, true);
  assert.deepEqual(calls, ['reader']);
  assert.equal(event.defaultPrevented, true);
});

test('keyboard: a lower priority handler runs when the higher one declines', () => {
  const calls: string[] = [];
  const handlers: KeyboardEntry[] = [
    { id: 'theme', priority: 0, handler: () => { calls.push('theme'); return true; } },
    { id: 'reader', priority: 10, handler: () => { calls.push('reader'); return false; } },
  ];

  const event = keyEvent('r');
  const handled = runKeyboardHandlers(event, handlers);
  assert.equal(handled, true);
  assert.deepEqual(calls, ['reader', 'theme']);
});

test('keyboard: preventDefault also claims the key', () => {
  const calls: string[] = [];
  const handlers: KeyboardEntry[] = [
    { id: 'theme', priority: 0, handler: () => { calls.push('theme'); return true; } },
    {
      id: 'reader',
      priority: 10,
      handler: (event) => {
        calls.push('reader');
        event.preventDefault();
      },
    },
  ];

  const event = keyEvent('r');
  const handled = runKeyboardHandlers(event, handlers);
  assert.equal(handled, true);
  assert.deepEqual(calls, ['reader']);
});

test('keyboard: an already-prevented event is not dispatched', () => {
  const calls: string[] = [];
  const handlers: KeyboardEntry[] = [
    { id: 'theme', priority: 0, handler: () => { calls.push('theme'); return true; } },
  ];

  const event = keyEvent('r');
  event.preventDefault();
  const handled = runKeyboardHandlers(event, handlers);
  assert.equal(handled, true);
  assert.deepEqual(calls, []);
});
