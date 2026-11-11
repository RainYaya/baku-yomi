import { createMachine } from './core';

/**
 * EPUB import lifecycle.
 *
 * Before: `parsing` + `error` booleans in a hook, with no way to tell "never
 * imported" from "imported successfully". The machine also makes duplicate
 * drops explicit: a PARSE while parsing is ignored.
 */
export type ImportState =
  | { status: 'idle' }
  | { status: 'parsing'; fileName: string }
  | { status: 'success'; fileName: string; bookId: string }
  | { status: 'error'; fileName: string; message: string };

export type ImportEvent =
  | { type: 'PARSE'; fileName: string }
  | { type: 'SUCCESS'; bookId: string }
  | { type: 'FAIL'; message: string }
  | { type: 'RESET' };

export const importMachine = createMachine<ImportState, ImportEvent>({
  id: 'import',
  initial: { status: 'idle' },
  transition(state, event) {
    switch (event.type) {
      case 'PARSE':
        if (state.status === 'parsing') return state;
        return { status: 'parsing', fileName: event.fileName };
      case 'SUCCESS':
        if (state.status !== 'parsing') return state;
        return {
          status: 'success',
          fileName: state.fileName,
          bookId: event.bookId,
        };
      case 'FAIL':
        if (state.status !== 'parsing') return state;
        return {
          status: 'error',
          fileName: state.fileName,
          message: event.message,
        };
      case 'RESET':
        return { status: 'idle' };
      default:
        return state;
    }
  },
});
