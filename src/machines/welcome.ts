import { createMachine } from './core';

/**
 * First-run guide lifecycle.
 *
 * Before: `ready` + `open` booleans, with `open` flipped in an effect. That
 * produced a hydration flash and made "not loaded yet" indistinguishable from
 * "dismissed". Now the four states are explicit.
 */
export type WelcomeState =
  | { status: 'loading' }
  | { status: 'hidden' }
  | { status: 'visible' }
  | { status: 'dismissed' };

export type WelcomeEvent =
  | { type: 'HYDRATED'; seen: boolean }
  | { type: 'DISMISS' };

export const welcomeMachine = createMachine<WelcomeState, WelcomeEvent>({
  id: 'welcome',
  initial: { status: 'loading' },
  transition(state, event) {
    switch (event.type) {
      case 'HYDRATED':
        if (state.status !== 'loading') return state;
        return event.seen ? { status: 'hidden' } : { status: 'visible' };
      case 'DISMISS':
        return state.status === 'visible' ? { status: 'dismissed' } : state;
      default:
        return state;
    }
  },
});
