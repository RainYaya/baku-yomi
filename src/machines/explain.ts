import { createMachine } from './core';
import type { ExplainAction, ExplainAnswer } from '../types';

/**
 * The explanation panel's lifecycle.
 *
 * Before this existed the shape would have been `isLoading` + `error` +
 * `answer` + `streamingText`, which can disagree in the ways that matter:
 * a stale stream finishing after the user switched actions, an error landing
 * while text is still arriving, an abort that leaves `isLoading` stuck.
 *
 * `requestId` gates every terminal transition, so only the newest request can
 * move the machine forward.
 */
export type ExplainState =
  | { status: 'idle' }
  | { status: 'streaming'; requestId: number; action: ExplainAction; text: string }
  | { status: 'ready'; requestId: number; answer: ExplainAnswer }
  | { status: 'failed'; requestId: number; message: string };

export type ExplainEvent =
  | { type: 'START'; requestId: number; action: ExplainAction }
  | { type: 'DELTA'; requestId: number; text: string }
  | { type: 'SUCCEEDED'; requestId: number; answer: ExplainAnswer }
  | { type: 'FAILED'; requestId: number; message: string }
  | { type: 'RESET' };

export const explainMachine = createMachine<ExplainState, ExplainEvent>({
  id: 'reader.explain',
  initial: { status: 'idle' },
  transition(state, event) {
    switch (event.type) {
      case 'START':
        return {
          status: 'streaming',
          requestId: event.requestId,
          action: event.action,
          text: '',
        };
      case 'DELTA':
        if (state.status === 'streaming' && state.requestId === event.requestId) {
          return { ...state, text: state.text + event.text };
        }
        return state;
      case 'SUCCEEDED':
        if (state.status === 'streaming' && state.requestId === event.requestId) {
          return { status: 'ready', requestId: event.requestId, answer: event.answer };
        }
        return state;
      case 'FAILED':
        if (state.status === 'streaming' && state.requestId === event.requestId) {
          return { status: 'failed', requestId: event.requestId, message: event.message };
        }
        return state;
      case 'RESET':
        return { status: 'idle' };
      default:
        return state;
    }
  },
});

export function explainText(state: ExplainState): string {
  if (state.status === 'streaming') return state.text;
  if (state.status === 'ready') return state.answer.markdown;
  return '';
}

export function isExplainBusy(state: ExplainState): boolean {
  return state.status === 'streaming';
}
