import { createMachine } from './core';

/**
 * TTS playback lifecycle.
 *
 * Before: a mutable `playbackState` object plus a pile of `isLoading` /
 * `isPlaying` booleans, with no guard against a slow synthesis finishing
 * after the user already started another sentence. Every event now carries a
 * token; events from an older token are ignored, so the last request wins.
 */
export type TtsStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export type TtsState =
  | { status: 'idle' }
  | { status: 'loading'; token: number; pairId: string | null; duration: number }
  | {
      status: 'playing';
      token: number;
      pairId: string | null;
      duration: number;
      currentTime: number;
    }
  | {
      status: 'paused';
      token: number;
      pairId: string | null;
      duration: number;
      currentTime: number;
    }
  | { status: 'error'; token: number; pairId: string | null; message: string };

export type TtsEvent =
  | { type: 'LOAD'; token: number; pairId: string | null }
  | { type: 'METADATA'; token: number; duration: number }
  | { type: 'PLAY'; token: number }
  | { type: 'TIME'; token: number; currentTime: number }
  | { type: 'PAUSE'; token: number; currentTime: number }
  | { type: 'END'; token: number }
  | { type: 'ERROR'; token: number; message: string }
  | { type: 'STOP' };

function isCurrent(
  state: TtsState,
  token: number
): state is Exclude<TtsState, { status: 'idle' }> {
  return state.status !== 'idle' && state.token === token;
}

export const ttsMachine = createMachine<TtsState, TtsEvent>({
  id: 'tts',
  initial: { status: 'idle' },
  transition(state, event) {
    if (event.type === 'STOP') {
      return { status: 'idle' };
    }

    if (event.type === 'LOAD') {
      return {
        status: 'loading',
        token: event.token,
        pairId: event.pairId,
        duration: 0,
      };
    }

    if (!isCurrent(state, event.token)) {
      return state;
    }

    switch (event.type) {
      case 'METADATA':
        if (
          state.status === 'loading' ||
          state.status === 'playing' ||
          state.status === 'paused'
        ) {
          return { ...state, duration: event.duration };
        }
        return state;
      case 'PLAY':
        if (state.status === 'loading') {
          return {
            status: 'playing',
            token: state.token,
            pairId: state.pairId,
            duration: state.duration,
            currentTime: 0,
          };
        }
        if (state.status === 'paused') {
          return { ...state, status: 'playing' };
        }
        return state;
      case 'TIME':
        if (state.status === 'playing' || state.status === 'paused') {
          const max = state.duration > 0 ? state.duration : event.currentTime;
          return {
            ...state,
            currentTime: Math.max(0, Math.min(event.currentTime, max)),
          };
        }
        return state;
      case 'PAUSE':
        if (state.status === 'playing') {
          return {
            ...state,
            status: 'paused',
            currentTime: event.currentTime,
          };
        }
        return state;
      case 'END':
        return { status: 'idle' };
      case 'ERROR':
        return {
          status: 'error',
          token: state.token,
          pairId: state.pairId,
          message: event.message,
        };
      default:
        return state;
    }
  },
});

export interface TtsPlaybackView {
  status: TtsStatus;
  pairId: string | null;
  isLoading: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

export const idlePlaybackView: TtsPlaybackView = {
  status: 'idle',
  pairId: null,
  isLoading: false,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
};

export function toPlaybackView(state: TtsState): TtsPlaybackView {
  switch (state.status) {
    case 'idle':
      return idlePlaybackView;
    case 'loading':
      return {
        status: 'loading',
        pairId: state.pairId,
        isLoading: true,
        isPlaying: false,
        currentTime: 0,
        duration: state.duration,
      };
    case 'playing':
      return {
        status: 'playing',
        pairId: state.pairId,
        isLoading: false,
        isPlaying: true,
        currentTime: state.currentTime,
        duration: state.duration,
      };
    case 'paused':
      return {
        status: 'paused',
        pairId: state.pairId,
        isLoading: false,
        isPlaying: false,
        currentTime: state.currentTime,
        duration: state.duration,
      };
    case 'error':
      return {
        status: 'error',
        pairId: state.pairId,
        isLoading: false,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
      };
  }
}
