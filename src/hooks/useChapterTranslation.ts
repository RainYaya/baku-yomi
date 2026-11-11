import { useCallback, useEffect, useRef, useState } from 'react';
import type { Book, Chapter, SentencePair } from '../types';
import type { AIProviderConfig } from '../types';
import { isKeylessProvider } from '../types';
import { useBookStore } from '../stores/bookSlice';
import { useSettingsStore } from '../stores/settingsSlice';
import { translateBatch } from '../lib/ai/translateClient';
import type { TranslationSentence } from '../lib/ai/translatePrompts';

const BATCH_SIZE = 20;
const CONTEXT_BEFORE = 3;
const CONTEXT_AFTER = 2;
const MAX_SPLIT_DEPTH = 2;

export type ChapterTranslationStatus = 'idle' | 'running' | 'done' | 'error';

export interface ChapterTranslationState {
  status: ChapterTranslationStatus;
  translated: number;
  total: number;
  error: string | null;
}

const IDLE: ChapterTranslationState = {
  status: 'idle',
  translated: 0,
  total: 0,
  error: null,
};

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function japaneseOf(pair: SentencePair): string {
  return pair.japanese?.trim() ?? '';
}

function needsTranslation(pair: SentencePair): boolean {
  return Boolean(japaneseOf(pair)) && !(pair.chinese ?? '').trim();
}

async function translateWithSplit(
  config: AIProviderConfig,
  sentences: TranslationSentence[],
  contextBefore: string[],
  contextAfter: string[],
  signal: AbortSignal,
  depth = 0
): Promise<Array<{ id: string; chinese: string }>> {
  try {
    const response = await translateBatch(config, sentences, {
      contextBefore,
      contextAfter,
      signal,
    });

    if (response.missing.length === 0) return response.translations;

    // Some ids came back empty. Re-request only those, in halves, so a model
    // that dropped items still gets a chance to align without re-translating
    // the good ones.
    if (depth >= MAX_SPLIT_DEPTH || sentences.length === 1) {
      return response.translations;
    }

    const missing = new Set(response.missing);
    const pending = sentences.filter((sentence) => missing.has(sentence.id));
    if (pending.length === 0) return response.translations;

    const half = Math.ceil(pending.length / 2);
    const results = [...response.translations];

    for (const part of [pending.slice(0, half), pending.slice(half)]) {
      if (part.length === 0) continue;
      const retried = await translateWithSplit(
        config,
        part,
        contextBefore,
        contextAfter,
        signal,
        depth + 1
      );
      results.push(...retried);
    }

    return results;
  } catch (error) {
    if (isAbortError(error) || signal.aborted) throw error;

    const message = error instanceof Error ? error.message : '';
    // A configuration problem will fail the same way at every size; only
    // split requests that the model itself failed to answer.
    const retryable = !/API Key|缺少翻译参数|最多 50|请填写/.test(message);
    if (!retryable || depth >= MAX_SPLIT_DEPTH || sentences.length === 1) {
      throw error;
    }

    const half = Math.ceil(sentences.length / 2);
    const results: Array<{ id: string; chinese: string }> = [];
    let firstError: unknown = null;

    for (const part of [sentences.slice(0, half), sentences.slice(half)]) {
      if (part.length === 0) continue;
      try {
        results.push(
          ...(await translateWithSplit(
            config,
            part,
            contextBefore,
            contextAfter,
            signal,
            depth + 1
          ))
        );
      } catch (nested) {
        if (isAbortError(nested)) throw nested;
        firstError ??= nested;
      }
    }

    if (results.length === 0 && firstError) throw firstError;
    return results;
  }
}

export function useChapterTranslation() {
  const [state, setState] = useState<ChapterTranslationState>(IDLE);
  const abortRef = useRef<AbortController | null>(null);
  const chapterKeyRef = useRef<string | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((prev) =>
      prev.status === 'running' ? { ...prev, status: 'idle' } : prev
    );
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(IDLE);
  }, []);

  const translateChapter = useCallback(async (book: Book, chapter: Chapter) => {
    const config = useSettingsStore.getState().getActiveAIProvider();
    if (!config.apiKey && !isKeylessProvider(config.type)) {
      setState({ status: 'error', translated: 0, total: 0, error: '请先在设置中配置 AI API Key' });
      return;
    }

    const pending = chapter.pairs.filter(needsTranslation);
    const total = pending.length;
    if (total === 0) {
      setState({ status: 'done', translated: 0, total: 0, error: null });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    chapterKeyRef.current = chapter.id;

    setState({ status: 'running', translated: 0, total, error: null });

    const updateTranslations = useBookStore.getState().updatePairTranslations;
    let translated = 0;

    try {
      for (let start = 0; start < pending.length; start += BATCH_SIZE) {
        if (controller.signal.aborted) break;

        const batch = pending.slice(start, start + BATCH_SIZE);
        const firstIndex = chapter.pairs.indexOf(batch[0]);
        const lastIndex = chapter.pairs.indexOf(batch[batch.length - 1]);
        const contextBefore = chapter.pairs
          .slice(Math.max(0, firstIndex - CONTEXT_BEFORE), firstIndex)
          .map(japaneseOf)
          .filter(Boolean);
        const contextAfter = chapter.pairs
          .slice(lastIndex + 1, lastIndex + 1 + CONTEXT_AFTER)
          .map(japaneseOf)
          .filter(Boolean);

        const sentences = batch
          .filter((pair) => japaneseOf(pair))
          .map((pair) => ({ id: pair.id, text: japaneseOf(pair) }));

        if (sentences.length === 0) continue;

        const results = await translateWithSplit(
          config,
          sentences,
          contextBefore,
          contextAfter,
          controller.signal
        );

        if (controller.signal.aborted) break;

        if (results.length > 0) {
          updateTranslations(
            book.id,
            results.map((item) => ({ pairId: item.id, chinese: item.chinese }))
          );
          translated += results.length;
          setState({ status: 'running', translated, total, error: null });
        }
      }

      if (controller.signal.aborted) {
        setState((prev) => ({ ...prev, status: 'idle' }));
      } else if (translated === 0) {
        setState({
          status: 'error',
          translated: 0,
          total,
          error: '模型没有返回可对齐的译文，请重试或换一个模型。',
        });
      } else {
        setState({ status: 'done', translated, total, error: null });
      }
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) {
        setState((prev) => ({ ...prev, status: 'idle' }));
      } else {
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: error instanceof Error ? error.message : '翻译失败，请重试。',
        }));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  /**
   * Translate one sentence again, even when it already has a translation.
   * Used by the per-sentence "重译" action.
   */
  const retranslatePair = useCallback(async (book: Book, pair: SentencePair) => {
    const config = useSettingsStore.getState().getActiveAIProvider();
    if (!config.apiKey && !isKeylessProvider(config.type)) {
      throw new Error('请先在设置中配置 AI API Key');
    }
    const text = japaneseOf(pair);
    if (!text) throw new Error('这一句没有日文原文。');

    const controller = new AbortController();
    const results = await translateWithSplit(
      config,
      [{ id: pair.id, text }],
      [],
      [],
      controller.signal
    );
    if (results.length === 0) throw new Error('模型没有返回译文，请重试。');
    useBookStore
      .getState()
      .updatePairTranslations(
        book.id,
        results.map((item) => ({ pairId: item.id, chinese: item.chinese }))
      );
    return results[0].chinese;
  }, []);

  // A different chapter means a different job; drop the previous progress.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  return {
    ...state,
    translateChapter,
    retranslatePair,
    cancel,
    reset,
  };
}

/**
 * Reset translation UI state when the reader moves to another chapter.
 * Kept separate so the chapter bar can own the lifecycle without the hook
 * needing to know how the reader stores its selection.
 */
export function useResetOnChapter(activeChapterId: string | null, reset: () => void) {
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (previous.current !== null && previous.current !== activeChapterId) {
      reset();
    }
    previous.current = activeChapterId;
  }, [activeChapterId, reset]);
}
