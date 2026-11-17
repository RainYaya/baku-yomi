import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../stores/settingsSlice';
import { generateVocabFields } from '../lib/ai/vocabClient';
import type { VocabPromptInput } from '../lib/vocab/prompt';
import type { VocabFillFields } from '../types';

export interface VocabFillState {
  status: 'idle' | 'loading' | 'done' | 'error';
  fields: VocabFillFields | null;
  error?: string;
}

const IDLE: VocabFillState = { status: 'idle', fields: null };

/** Fill reading / meaning / synonyms / CORE for one word. */
export function useVocabFill() {
  const aiProvider = useSettingsStore((s) => s.getActiveAIProvider);
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<VocabFillState>(IDLE);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const fill = useCallback(
    async (input: VocabPromptInput): Promise<VocabFillFields | null> => {
      const word = input.word.trim();
      if (!word) return null;

      cancel();
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ status: 'loading', fields: null });

      try {
        const fields = await generateVocabFields(
          aiProvider(),
          { ...input, word },
          controller.signal
        );
        if (controller.signal.aborted) return null;
        setState({ status: 'done', fields });
        return fields;
      } catch (error) {
        if (controller.signal.aborted) return null;
        setState({
          status: 'error',
          fields: null,
          error: error instanceof Error ? error.message : 'AI 补充失败',
        });
        return null;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [aiProvider, cancel]
  );

  const reset = useCallback(() => {
    cancel();
    setState(IDLE);
  }, [cancel]);

  return { state, fill, reset, cancel };
}
