import type { ExplainAction, ExplainAnswer } from '../../types';
import type { ExplainState } from '../../machines/explain';

export interface ExplainView {
  /** A request for the visible action is streaming. */
  busy: boolean;
  /** Partial text for the visible action only. */
  streamingText: string;
  /** The answer the panel should render, if any. */
  shownAnswer: ExplainAnswer | null;
  /** The live answer, when it belongs to the visible action. */
  liveAnswer: ExplainAnswer | null;
  /** An error raised by the visible action, if any. */
  failure: string | null;
}

/**
 * Decide what the explanation panel shows for one action.
 *
 * The machine tracks a single request at a time, so its `ready` and `failed`
 * states can belong to the tab the user just left. Everything here is scoped
 * to `action`, and a saved answer is a first-class fallback rather than
 * something shown only while the machine sits idle.
 */
export function selectExplainView(
  state: ExplainState,
  action: ExplainAction,
  cached: ExplainAnswer | null
): ExplainView {
  const live =
    state.status === 'ready' && state.answer.action === action ? state.answer : null;
  const streaming = state.status === 'streaming' && state.action === action;

  return {
    busy: streaming,
    streamingText: streaming ? state.text : '',
    // A regenerate replaces the saved copy on screen while it streams; if it
    // fails, the cached answer comes back with the error above it.
    shownAnswer: live ?? (streaming ? null : cached),
    liveAnswer: live,
    failure: state.status === 'failed' && state.action === action ? state.message : null,
  };
}
