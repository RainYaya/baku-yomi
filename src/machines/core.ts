/**
 * A deliberately small finite-state-machine toolkit.
 *
 * The app already has Zustand for durable domain data. This module is for
 * transient workflow state that used to be spread across booleans, refs,
 * timers and module globals. Keeping the transition function pure means the
 * same machine can be tested in Node, rendered by React, and inspected by an
 * agent without a browser.
 */

export type MachineEvent = { type: string };

export interface Machine<S, E extends MachineEvent> {
  readonly id: string;
  readonly initial: S;
  readonly transition: (state: S, event: E) => S;
}

export function createMachine<S, E extends MachineEvent>(
  config: Machine<S, E>
): Machine<S, E> {
  return config;
}

/**
 * Narrow a discriminated-union state without repeating the status check at
 * every call site. Returns a type predicate so `if (isStatus(state, 'x'))`
 * narrows `state` for the rest of the block.
 */
export function isStatus<
  S extends { status: string },
  T extends S['status'],
>(state: S, status: T): state is Extract<S, { status: T }> {
  return state.status === status;
}
