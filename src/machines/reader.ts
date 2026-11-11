import { createMachine } from './core';

/**
 * The reader's surface + practice flow.
 *
 * v2 separates *where* practice is shown from *what phase* it is in:
 *
 * - `reading`  — no selection; the reading column is the only surface.
 * - `selected` — a sentence is highlighted; no card is open.
 * - `inline`   — the practice card is expanded under the sentence (S1).
 * - `desk`     — the full-page practice desk is open (S2).
 *
 * `j/k` only ever produces `selected`. Opening a surface is deliberate
 * (`P`, `E`, `Shift+P`, or a card action), so navigation can never interrupt
 * reading with a panel.
 */
export type ReaderSurface = 'reading' | 'selected' | 'inline' | 'desk';
export type ReaderPhase = 'idle' | 'analyzing' | 'reviewed' | 'failed';

export interface ReaderSessionState {
  surface: ReaderSurface;
  pairId: string | null;
  phase: ReaderPhase;
  requestId?: number;
  message?: string;
}

export type ReaderSessionEvent =
  | { type: 'SELECT'; pairId: string; hasAnalysis: boolean }
  | { type: 'DESELECT' }
  | { type: 'OPEN_INLINE' }
  | { type: 'OPEN_DESK' }
  | { type: 'BACK' }
  | { type: 'CLOSE' }
  | { type: 'SUBMIT'; requestId: number }
  | { type: 'ANALYSIS_SUCCEEDED'; requestId: number }
  | { type: 'ANALYSIS_FAILED'; requestId: number; message: string };

const READING: ReaderSessionState = {
  surface: 'reading',
  pairId: null,
  phase: 'idle',
};

function withSurface(
  state: ReaderSessionState,
  surface: ReaderSurface
): ReaderSessionState {
  return { ...state, surface };
}

export const readerSessionMachine = createMachine<
  ReaderSessionState,
  ReaderSessionEvent
>({
  id: 'reader.session',
  initial: READING,
  transition(state, event) {
    switch (event.type) {
      case 'SELECT':
        // Clicking the already-selected sentence closes it again. This keeps
        // the card's own sentence as a natural "close" target.
        if (state.pairId === event.pairId && state.surface !== 'reading') {
          return READING;
        }
        return {
          surface: 'selected',
          pairId: event.pairId,
          phase: event.hasAnalysis ? 'reviewed' : 'idle',
        };

      case 'DESELECT':
      case 'CLOSE':
        return READING;

      case 'OPEN_INLINE':
        if (!state.pairId) return state;
        return withSurface(state, 'inline');

      case 'OPEN_DESK':
        if (!state.pairId) return state;
        return withSurface(state, 'desk');

      case 'BACK':
        switch (state.surface) {
          case 'desk':
            return withSurface(state, 'inline');
          case 'inline':
            return withSurface(state, 'selected');
          case 'selected':
            return READING;
          default:
            return state;
        }

      case 'SUBMIT':
        if (!state.pairId) return state;
        if (state.surface !== 'inline' && state.surface !== 'desk') return state;
        return {
          ...state,
          phase: 'analyzing',
          requestId: event.requestId,
          message: undefined,
        };

      case 'ANALYSIS_SUCCEEDED':
        if (
          state.phase === 'analyzing' &&
          state.requestId === event.requestId
        ) {
          return { ...state, phase: 'reviewed', message: undefined };
        }
        return state;

      case 'ANALYSIS_FAILED':
        if (
          state.phase === 'analyzing' &&
          state.requestId === event.requestId
        ) {
          return {
            ...state,
            phase: 'failed',
            message: event.message,
          };
        }
        return state;

      default:
        return state;
    }
  },
});

export function sessionPairId(state: ReaderSessionState): string | null {
  return state.pairId;
}

export function isPanelOpen(state: ReaderSessionState): boolean {
  return state.surface === 'inline' || state.surface === 'desk';
}

export function isInline(state: ReaderSessionState): boolean {
  return state.surface === 'inline';
}

export function isDesk(state: ReaderSessionState): boolean {
  return state.surface === 'desk';
}

export function isAnalyzing(state: ReaderSessionState): boolean {
  return state.phase === 'analyzing';
}

export function isReviewed(state: ReaderSessionState): boolean {
  return state.phase === 'reviewed';
}

export function isFailed(state: ReaderSessionState): boolean {
  return state.phase === 'failed';
}

/**
 * Continuous read-aloud chain.
 *
 * Before: `isAutoReadOn` + `isAutoReadBusy` + `autoReadRequestedRef`. The
 * ref and the booleans could disagree when a stop landed while synthesis was
 * still loading. The explicit `starting → playing → stopping` path makes the
 * in-between states visible and stoppable.
 */
export type AutoReadState =
  | { status: 'off' }
  | { status: 'starting'; pairId: string }
  | { status: 'playing'; pairId: string }
  | { status: 'stopping'; pairId: string | null };

export type AutoReadEvent =
  | { type: 'START'; pairId: string }
  | { type: 'STARTED'; pairId: string }
  | { type: 'ADVANCE'; pairId: string }
  | { type: 'STOP' }
  | { type: 'STOPPED' }
  | { type: 'FINISH' }
  | { type: 'ERROR' };

export const autoReadMachine = createMachine<AutoReadState, AutoReadEvent>({
  id: 'reader.autoRead',
  initial: { status: 'off' },
  transition(state, event) {
    switch (event.type) {
      case 'START':
        return state.status === 'off'
          ? { status: 'starting', pairId: event.pairId }
          : state;
      case 'STARTED':
        if (state.status === 'starting' && state.pairId === event.pairId) {
          return { status: 'playing', pairId: event.pairId };
        }
        return state;
      case 'ADVANCE':
        if (state.status === 'starting' || state.status === 'playing') {
          return { status: 'starting', pairId: event.pairId };
        }
        return state;
      case 'STOP':
        if (state.status === 'starting' || state.status === 'playing') {
          return { status: 'stopping', pairId: state.pairId };
        }
        return state;
      case 'STOPPED':
        return state.status === 'stopping' ? { status: 'off' } : state;
      case 'FINISH':
        return state.status === 'off' ? state : { status: 'off' };
      case 'ERROR':
        return state.status === 'off' ? state : { status: 'off' };
      default:
        return state;
    }
  },
});

export function isAutoReadOn(state: AutoReadState): boolean {
  return state.status !== 'off';
}

export function isAutoReadBusy(state: AutoReadState): boolean {
  return state.status === 'starting' || state.status === 'stopping';
}
