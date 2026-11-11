import { useCallback, useEffect, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsSlice';
import { useMachine } from '../machines/react';
import { explainMachine, type ExplainState } from '../machines/explain';
import { streamExplanation, streamFollowUp } from '../lib/ai/explainClient';
import { anchorUnits, findUnitTable, stripUnitTable } from '../lib/ai/anchor';
import type { ExplainAction, ExplainAnswer, ExplainDepth } from '../types';

interface ExplainParams {
  sentence: string;
  fragment: string;
  action: ExplainAction;
  depth?: ExplainDepth;
  targetLanguage?: string;
}

/** The free endpoint can stall; a hung stream must not look like a blank answer. */
const EXPLAIN_TIMEOUT_MS = 45_000;

/**
 * Runs one explanation at a time and keeps the anchored units in sync with
 * the prose.
 *
 * Anchoring happens once, at completion, not per delta: the table is at the
 * end of the answer, so there is nothing to anchor until the stream closes,
 * and re-parsing a partial table on every token would flicker.
 */
export function useExplain() {
  const aiProvider = useSettingsStore((s) => s.getActiveAIProvider);
  const { state, send } = useMachine(explainMachine, {
    debugId: 'reader.explain',
    debug: import.meta.env.DEV,
  });

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const lastParamsRef = useRef<ExplainParams | null>(null);

  /**
   * Deltas arrive far faster than React can paint them — a 2000-token answer
   * is ~750 separate chunks, and dispatching one state update per chunk
   * starved the main thread badly enough to freeze the tab. They are
   * coalesced here and flushed on a short timer instead, which keeps the
   * "text appears as it is written" feel without the per-token cost.
   */
  const pendingRef = useRef('');
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => void>(() => {});

  const clearFlush = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    pendingRef.current = '';
    clearFlush();
  }, [clearFlush]);

  // Abort on unmount so a closed panel does not keep the model running.
  useEffect(() => cancel, [cancel]);

  const explain = useCallback(
    async (params: ExplainParams): Promise<ExplainAnswer | null> => {
      const provider = aiProvider();
      const sentence = params.sentence.trim();
      if (!sentence) return null;

      cancel();
      const controller = new AbortController();
      abortRef.current = controller;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, EXPLAIN_TIMEOUT_MS);

      const requestId = ++requestIdRef.current;
      lastParamsRef.current = params;

      const request = {
        sentence,
        fragment: params.fragment.trim(),
        action: params.action,
        depth: params.depth ?? 'concise',
        targetLanguage: params.targetLanguage ?? 'zh-Hans',
      };

      send({ type: 'START', requestId, action: params.action });

      // Coalesce deltas: flush at most ~20x/second, and always flush what is
      // pending before the terminal event so no text is lost.
      pendingRef.current = '';
      const flush = () => {
        flushTimerRef.current = null;
        const buffered = pendingRef.current;
        if (!buffered) return;
        pendingRef.current = '';
        send({ type: 'DELTA', requestId, text: buffered });
      };
      flushRef.current = flush;

      try {
        const result = await streamExplanation(provider, request, {
          signal: controller.signal,
          onDelta: (text) => {
            pendingRef.current += text;
            if (flushTimerRef.current) return;
            flushTimerRef.current = setTimeout(flush, 50);
          },
        });

        clearFlush();
        flush();

        if (result.cancelled) return null;

        const table = findUnitTable(result.text);
        const anchored = table
          ? anchorUnits(table.rows, sentence)
          : { units: [], rejected: false };

        const answer: ExplainAnswer = {
          action: params.action,
          markdown: stripUnitTable(result.text, table),
          units: anchored.units,
          unitsRejected: anchored.rejected,
          model: provider.model,
          createdAt: Date.now(),
        };

        send({ type: 'SUCCEEDED', requestId, answer });
        return answer;
      } catch (error) {
        clearFlush();
        if (controller.signal.aborted && !timedOut) return null;
        const message = timedOut
          ? '讲解生成超时，请重试'
          : error instanceof Error
            ? error.message
            : '讲解失败';
        send({ type: 'FAILED', requestId, message });
        return null;
      } finally {
        clearTimeout(timeout);
        clearFlush();
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [aiProvider, cancel, clearFlush, send]
  );

  const retry = useCallback(async () => {
    const params = lastParamsRef.current;
    if (!params) return null;
    return explain(params);
  }, [explain]);

  const reset = useCallback(() => {
    cancel();
    requestIdRef.current += 1;
    send({ type: 'RESET' });
  }, [cancel, send]);

  return { state, explain, retry, reset, cancel };
}

export interface FollowUpState {
  status: 'idle' | 'streaming' | 'done' | 'error';
  text: string;
  error?: string;
}

/**
 * Follow-up questions on an existing answer.
 *
 * Kept out of the main machine: a follow-up does not replace the answer, it
 * appends a turn. Mixing the two would let a follow-up reset the anchored
 * units of the answer it is asking about.
 */
export function useFollowUp() {
  const aiProvider = useSettingsStore((s) => s.getActiveAIProvider);
  const abortRef = useRef<AbortController | null>(null);
  const stateRef = useRef<FollowUpState>({ status: 'idle', text: '' });

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const ask = useCallback(
    async (
      params: ExplainParams,
      question: string,
      previousAnswer: string,
      onUpdate: (state: FollowUpState) => void
    ) => {
      cancel();
      const controller = new AbortController();
      abortRef.current = controller;

      const provider = aiProvider();
      const request = {
        sentence: params.sentence.trim(),
        fragment: params.fragment.trim(),
        action: params.action,
        depth: params.depth ?? 'concise',
        targetLanguage: params.targetLanguage ?? 'zh-Hans',
      };

      let text = '';
      stateRef.current = { status: 'streaming', text: '' };
      onUpdate(stateRef.current);

      try {
        const result = await streamFollowUp(provider, request, question, previousAnswer, {
          signal: controller.signal,
          onDelta: (delta) => {
            text += delta;
            stateRef.current = { status: 'streaming', text };
            onUpdate(stateRef.current);
          },
        });

        if (result.cancelled) {
          stateRef.current = { status: 'idle', text: '' };
          onUpdate(stateRef.current);
          return;
        }

        stateRef.current = { status: 'done', text: result.text };
        onUpdate(stateRef.current);
      } catch (error) {
        if (controller.signal.aborted) {
          stateRef.current = { status: 'idle', text: '' };
          onUpdate(stateRef.current);
          return;
        }
        stateRef.current = {
          status: 'error',
          text: '',
          error: error instanceof Error ? error.message : '追问失败',
        };
        onUpdate(stateRef.current);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [aiProvider, cancel]
  );

  return { ask, cancel };
}

export type { ExplainState };
