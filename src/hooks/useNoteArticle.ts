import { useCallback, useState } from 'react';
import { useBookStore } from '../stores/bookSlice';
import { useNoteStore } from '../stores/noteSlice';
import { useUIStore } from '../stores/uiSlice';
import type { NoteChapterMeta, NoteSourceKind } from '../types';

export interface FetchedNoteArticle {
  url: string;
  title: string;
  author: string;
  publishedAt: number;
  tags: string[];
  paragraphs: string[];
  text: string;
  status: 'ok' | 'partial' | 'empty';
}

interface PartialArticle {
  article: FetchedNoteArticle;
  note: NoteChapterMeta;
}

function noteMetaFrom(
  article: FetchedNoteArticle,
  requestedUrl: string,
  sourceId: string
): NoteChapterMeta {
  const separator = sourceId.indexOf(':');
  const kind: NoteSourceKind =
    separator >= 0 && sourceId.slice(0, separator) === 'author'
      ? 'author'
      : 'hashtag';
  const key = separator >= 0 ? sourceId.slice(separator + 1) : '';

  return {
    url: article.url || requestedUrl,
    author: article.author || '',
    publishedAt: article.publishedAt || 0,
    sourceKind: kind,
    sourceKey: key,
    tags: article.tags,
  };
}

/**
 * Opens a note article on demand. A paywalled / follower-only page returns
 * `partial`; nothing is written until the reader confirms, so half an article
 * never quietly becomes the saved material.
 */
export function useNoteArticle() {
  const ensureNoteBook = useBookStore((s) => s.ensureNoteBook);
  const appendNoteChapter = useBookStore((s) => s.appendNoteChapter);
  const setCurrentBook = useBookStore((s) => s.setCurrentBook);
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const markRead = useNoteStore((s) => s.markRead);
  const setCurrentView = useUIStore((s) => s.setCurrentView);

  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState<PartialArticle | null>(null);

  const saveArticle = useCallback(
    (article: FetchedNoteArticle, note: NoteChapterMeta) => {
      const bookId = ensureNoteBook();
      const appended = appendNoteChapter({
        bookId,
        title: article.title || 'note',
        text: article.text || article.paragraphs.join('\n'),
        note,
      });
      if (!appended) throw new Error('这篇文章没有可导入的正文。');

      markRead(note.url);
      setCurrentBook(bookId);
      setCurrentChapter(appended.chapterIndex);
      setCurrentView('reader');
    },
    [
      appendNoteChapter,
      ensureNoteBook,
      markRead,
      setCurrentBook,
      setCurrentChapter,
      setCurrentView,
    ]
  );

  const openNoteArticle = useCallback(
    async (url: string, sourceId = '') => {
      setBusyUrl(url);
      setError(null);
      try {
        const response = await fetch('/api/note/article', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const data = (await response.json().catch(() => null)) as
          | (FetchedNoteArticle & { error?: string })
          | { error?: string; status?: string }
          | null;

        if (!response.ok) {
          throw new Error((data as { error?: string } | null)?.error ?? '读取 note 文章失败。');
        }
        if (!data || !('paragraphs' in data)) {
          throw new Error('note 返回了无法识别的文章内容。');
        }

        const article = data as FetchedNoteArticle;
        const note = noteMetaFrom(article, url, sourceId);

        if (article.status === 'partial') {
          setPartial({ article, note });
          return;
        }

        saveArticle(article, note);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : '读取 note 文章失败。'
        );
      } finally {
        setBusyUrl(null);
      }
    },
    [saveArticle]
  );

  const confirmPartial = useCallback(() => {
    if (!partial) return;
    try {
      saveArticle(partial.article, partial.note);
      setPartial(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '导入失败。');
    }
  }, [partial, saveArticle]);

  return {
    openNoteArticle,
    busyUrl,
    error,
    dismissError: () => setError(null),
    partial,
    confirmPartial,
    cancelPartial: () => setPartial(null),
  };
}
