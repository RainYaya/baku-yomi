import { useMemo } from 'react';
import type { Book, Chapter } from '../../types';
import {
  useChapterTranslation,
  useResetOnChapter,
} from '../../hooks/useChapterTranslation';
import { FiX } from 'react-icons/fi';

interface Props {
  book: Book;
  chapter: Chapter;
}

/**
 * Chapter-level AI translation, shown in the chapter head.
 *
 * The job runs in batches and saves after every batch, so leaving the page or
 * pressing 取消 never loses finished sentences. Existing translations are
 * skipped: starting again after an error only retries what is still missing.
 */
export function ChapterTranslationBar({ book, chapter }: Props) {
  const {
    status,
    translated,
    total,
    error,
    translateChapter,
    cancel,
    reset,
  } = useChapterTranslation();

  useResetOnChapter(chapter.id, reset);

  const counts = useMemo(() => {
    let withChinese = 0;
    let japanese = 0;
    for (const pair of chapter.pairs) {
      if (!pair.japanese.trim()) continue;
      japanese += 1;
      if ((pair.chinese ?? '').trim()) withChinese += 1;
    }
    return { withChinese, pending: japanese - withChinese };
  }, [chapter.pairs]);

  const percent = total > 0 ? Math.round((translated / total) * 100) : 0;

  return (
    <div
      className="translate-bar"
      data-translate-state={status}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="translate-bar-copy">
        {status === 'running' ? (
          <>
            <b>正在 AI 翻译本章</b>
            <span>
              {translated} / {total} 句 · {percent}%
            </span>
            <span className="translate-bar-track" aria-hidden="true">
              <span style={{ width: `${Math.max(2, percent)}%` }} />
            </span>
          </>
        ) : status === 'error' ? (
          <>
            <b>翻译中断</b>
            <span className="translate-bar-error">{error}</span>
            <span>已保存 {translated} / {total} 句，再次开始只会翻译剩下的。</span>
          </>
        ) : status === 'done' ? (
          <>
            <b>本章 AI 翻译完成</b>
            <span>
              {translated > 0 ? `本次翻译 ${translated} 句。` : '没有需要翻译的句子。'}
              {counts.pending > 0 && ` 还有 ${counts.pending} 句待译。`}
            </span>
          </>
        ) : counts.pending === 0 ? (
          <>
            <b>本章已有完整译文</b>
            <span>{counts.withChinese} 句都可以直接阅读。选中任意一句即可练习。</span>
          </>
        ) : (
          <>
            <b>这一章还没有完整译文</b>
            <span>
              {counts.withChinese} / {counts.withChinese + counts.pending} 句已译。AI
              会按批翻译剩下的 {counts.pending} 句，并逐批保存。
            </span>
          </>
        )}
      </div>

      <div className="translate-bar-actions">
        {status === 'running' ? (
          <button className="paper-chip" onClick={cancel}>
            <FiX size={12} /> 取消
          </button>
        ) : (
          <button
            className="paper-chip translate-start"
            onClick={() => void translateChapter(book, chapter)}
            disabled={counts.pending === 0}
            title={
              counts.pending === 0
                ? '本章句子都已有译文'
                : '按批翻译本章还没有中文的句子'
            }
          >
            {status === 'error' ? '继续翻译' : status === 'done' ? '翻译剩下的' : 'AI 翻译本章'}
          </button>
        )}
      </div>
    </div>
  );
}
