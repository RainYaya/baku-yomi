import { useEffect, useReducer, useRef } from 'react';
import type { Machine, MachineEvent } from './core';
import { registerMachineSnapshot } from './registry';

export interface UseMachineOptions {
  /** Register the live state under this id in `window.__BAKU_MACHINES__`. */
  debugId?: string;
  /** Log every transition in development. */
  debug?: boolean;
}

export function useMachine<S, E extends MachineEvent>(
  machine: Machine<S, E>,
  options: UseMachineOptions = {}
) {
  const [state, send] = useReducer(machine.transition, machine.initial);
  const previous = useRef(state);

  useEffect(() => {
    if (!options.debug) return;
    if (previous.current !== state) {
      console.debug(`[machine:${machine.id}]`, state);
    }
    previous.current = state;
  }, [machine.id, options.debug, state]);

  useEffect(() => {
    if (!options.debugId) return;
    return registerMachineSnapshot(options.debugId, () => state);
  }, [options.debugId, state]);

  return { state, send } as const;
}
