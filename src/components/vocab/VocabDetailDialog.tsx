import { useCallback, useEffect, useState } from 'react';
import { FiRefreshCw, FiX } from 'react-icons/fi';
import { useUIStore, type VocabDialogRequest } from '../../stores/uiSlice';
import { useVocabStore } from '../../stores/vocabSlice';
import { useBookStore } from '../../stores/bookSlice';
import { useVocabFill } from '../../hooks/useVocabFill';
import { buildVocabEntry } from '../../lib/vocab/entry';
import {
  createVocabDraftFromEntry,
  findDuplicateVocabEntry,
} from '../../lib/vocab/draft';
import {
  formatSynonymsInput,
  parseSynonymsInput,
  splitVocabSentence,
} from '../../lib/vocab/display';
import type {
  VocabExampleSource,
  VocabFillFields,
  VocabStatus,
} from '../../types';

export function VocabDetailDialog() {
  const request = useUIStore((s) => s.vocabDialog);
  if (!request) return null;
  return <VocabDetailForm key={request.key} request={request} />;
}

interface FormState {
  word: string;
  reading: string;
  meaning: string;
  synonyms: string;
  core: string;
  example: string;
  exampleTranslation: string;
}

function initialForm(request: VocabDialogRequest): FormState {
  const source = request.entry ?? request.draft;
  return {
    word: source.word ?? '',
    reading: source.reading ?? '',
    meaning: source.meaning ?? '',
    synonyms: formatSynonymsInput(source.synonyms ?? []),
    core: source.core ?? '',
    example: source.example ?? '',
    exampleTranslation: source.exampleTranslation ?? '',
  };
}

const SOURCE_LABEL: Record<VocabExampleSource, string> = {
  article: '原文',
  ai: 'AI 例句',
  user: '手动',
};

function VocabDetailForm({ request }: { request: VocabDialogRequest }) {
  const entries = useVocabStore((s) => s.entries);
  const addEntry = useVocabStore((s) => s.addEntry);
  const updateEntry = useVocabStore((s) => s.updateEntry);
  const removeEntry = useVocabStore((s) => s.removeEntry);
  const books = useBookStore((s) => s.books);
  const setCurrentBook = useBookStore((s) => s.setCurrentBook);
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const setScrollToPairId = useBookStore((s) => s.setScrollToPairId);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const close = useUIStore((s) => s.closeVocabDialog);
  const openVocabDialog = useUIStore((s) => s.openVocabDialog);

  const [form, setForm] = useState<FormState>(() => initialForm(request));
  const [exampleSource, setExampleSource] = useState<VocabExampleSource>(
    request.entry?.exampleSource ?? request.draft.exampleSource
  );
  const [status, setStatus] = useState<VocabStatus>(
    request.entry?.status ?? 'new'
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { state: fillState, fill } = useVocabFill();

  const applyFields = useCallback(
    (fields: VocabFillFields) => {
      setForm((prev) => ({
        ...prev,
        reading: prev.reading.trim() ? prev.reading : (fields.reading ?? prev.reading),
        meaning: prev.meaning.trim() ? prev.meaning : (fields.meaning ?? prev.meaning),
        synonyms: prev.synonyms.trim()
          ? prev.synonyms
          : fields.synonyms
            ? formatSynonymsInput(fields.synonyms)
            : prev.synonyms,
        core: prev.core.trim() ? prev.core : (fields.core ?? prev.core),
        example: prev.example.trim() ? prev.example : (fields.example ?? prev.example),
      }));

      if (!request.draft.example.trim() && fields.example) {
        setExampleSource((prev) => (prev === 'article' ? prev : 'ai'));
      }
    },
    [request.draft.example]
  );

  // New words ask the model to fill the card once. Existing entries are left
  // exactly as the user saved them. StrictMode runs this effect twice and
  // aborts the first request, so the second run must be allowed to re-ask.
  useEffect(() => {
    if (request.entry) return;
    const word = request.draft.word.trim();
    if (!word) return;
    void fill({
      word,
      example: request.draft.example,
      exampleTranslation: request.draft.exampleTranslation,
    }).then((fields) => {
      if (fields) applyFields(fields);
    });
  }, [applyFields, fill, request]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const retryFill = () => {
    if (fillState.status === 'loading') return;
    const word = form.word.trim();
    if (!word) return;
    void fill({
      word,
      example: form.example,
      exampleTranslation: form.exampleTranslation,
    }).then((fields) => {
      if (fields) applyFields(fields);
    });
  };

  const handleSave = () => {
    const word = form.word.trim();
    if (!word) return;

    if (!request.entry) {
      const duplicate = findDuplicateVocabEntry(entries, word, form.example);
      if (duplicate) {
        openVocabDialog({
          draft: createVocabDraftFromEntry(duplicate),
          entry: duplicate,
          notice: '这个词已经在本句存过了，已打开那条记录。',
        });
        return;
      }
    }

    const entry = buildVocabEntry({
      draft: request.draft,
      id: request.entry?.id,
      createdAt: request.entry?.createdAt,
      fields: {
        word,
        reading: form.reading,
        meaning: form.meaning,
        synonyms: parseSynonymsInput(form.synonyms),
        core: form.core,
        example: form.example,
        exampleTranslation: form.exampleTranslation,
        exampleSource,
        status,
      },
    });

    if (request.entry) updateEntry(entry.id, entry);
    else addEntry(entry);
    close();
  };

  const handleDelete = () => {
    if (!request.entry) {
      close();
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    removeEntry(request.entry.id);
    close();
  };

  const handleToggleKnown = () => {
    const next: VocabStatus = status === 'known' ? 'new' : 'known';
    setStatus(next);
    if (request.entry) updateEntry(request.entry.id, { status: next });
  };

  const source = request.entry?.source;
  const sourceBook = source
    ? books.find((book) => book.id === source.bookId)
    : undefined;
  const sourceChapter = sourceBook?.chapters.find(
    (chapter) => chapter.id === source?.chapterId
  );
  const canReturnToSource = Boolean(sourceBook && sourceChapter);

  const handleBackToSource = () => {
    if (!source) return;
    setCurrentBook(source.bookId);
    setCurrentChapter(source.chapterIndex);
    setScrollToPairId(source.pairId);
    setCurrentView('reader');
    close();
  };

  const parts = splitVocabSentence(form.example || form.word, form.word);

  return (
    <div
      className="paste-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="paste-dialog vocab-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={request.entry ? '生词详情' : '添加生词'}
      >
        <header className="paste-head">
          <div>
            <span className="paste-kicker">Vocabulary</span>
            <h2>{request.entry ? '生词' : '添加生词'}</h2>
          </div>
          <div className="vocab-head-actions">
            <button
              className="shelf-btn"
              onClick={retryFill}
              disabled={fillState.status === 'loading' || !form.word.trim()}
              title="让 AI 补充读音、释义、類和 CORE"
            >
              <FiRefreshCw size={12} aria-hidden="true" />
              {fillState.status === 'loading' ? '补充中…' : 'AI 补充'}
            </button>
            <button
              className="shelf-icon-btn"
              onClick={close}
              aria-label="关闭"
            >
              <FiX size={15} />
            </button>
          </div>
        </header>

        <div className="paste-body vocab-body">
          {request.notice && <p className="vocab-notice">{request.notice}</p>}

          <div className="vocab-sentence">
            <p className="vocab-sentence-text">
              {parts.map((part, index) =>
                part.target ? (
                  <span key={index} className="vocab-target">
                    {part.text}
                  </span>
                ) : (
                  <span key={index}>{part.text}</span>
                )
              )}
            </p>
            <div className="vocab-sentence-meta">
              <span className="vocab-chip">{SOURCE_LABEL[exampleSource]}</span>
              {form.exampleTranslation.trim() && (
                <details className="vocab-translation">
                  <summary>中文</summary>
                  <p>{form.exampleTranslation}</p>
                </details>
              )}
            </div>
          </div>

          <div className="vocab-fields">
            <label className="vocab-field vocab-field-word">
              <span>词</span>
              <input
                value={form.word}
                onChange={(event) =>
                  setForm({ ...form, word: event.target.value })
                }
                onBlur={() => {
                  // A hand-added word has no sentence yet, so the first fill
                  // starts once the word is actually typed.
                  if (!request.entry) retryFill();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    retryFill();
                  }
                }}
                placeholder="割り切る"
                autoFocus
              />
            </label>

            <label className="vocab-field">
              <span>读音</span>
              <input
                value={form.reading}
                onChange={(event) =>
                  setForm({ ...form, reading: event.target.value })
                }
                placeholder="わりきる"
              />
            </label>

            <label className="vocab-field">
              <span>释义</span>
              <input
                value={form.meaning}
                onChange={(event) =>
                  setForm({ ...form, meaning: event.target.value })
                }
                placeholder="想开；不再纠结"
              />
            </label>

            <label className="vocab-field vocab-field-wide">
              <span>
                類 <small>近义词（语感）</small>
              </span>
              <input
                value={form.synonyms}
                onChange={(event) =>
                  setForm({ ...form, synonyms: event.target.value })
                }
                placeholder="受け入れる（纳得）・諦める（断念）"
              />
            </label>

            <label className="vocab-field vocab-field-wide">
              <span>
                CORE <small>一句日语，写核心感觉</small>
              </span>
              <input
                value={form.core}
                onChange={(event) =>
                  setForm({ ...form, core: event.target.value })
                }
                placeholder="感情に区切りをつけ、現実的に前へ進む"
              />
            </label>

            <label className="vocab-field vocab-field-wide">
              <span>例句</span>
              <textarea
                rows={2}
                value={form.example}
                onChange={(event) => {
                  setForm({ ...form, example: event.target.value });
                  setExampleSource('user');
                }}
                placeholder="留空时由 AI 造一句"
              />
            </label>

            <label className="vocab-field vocab-field-wide">
              <span>例句中文</span>
              <input
                value={form.exampleTranslation}
                onChange={(event) =>
                  setForm({ ...form, exampleTranslation: event.target.value })
                }
                placeholder="可选"
              />
            </label>
          </div>

          {fillState.status === 'loading' && (
            <p className="vocab-fill-state">AI 正在补充读音、類和 CORE…</p>
          )}
          {fillState.status === 'error' && (
            <p className="paste-error">
              {fillState.error}
              <button className="quiet-link" onClick={retryFill}>
                重试
              </button>
            </p>
          )}
        </div>

        <footer className="paste-foot vocab-foot">
          <div className="vocab-foot-left">
            {request.entry && (
              <button className="quiet-link" onClick={handleDelete}>
                {confirmDelete ? '确认删除' : '删除'}
              </button>
            )}
            {canReturnToSource && (
              <button className="quiet-link" onClick={handleBackToSource}>
                回到原文
              </button>
            )}
          </div>
          <div className="vocab-foot-right">
            <button className="quiet-link" onClick={handleToggleKnown}>
              {status === 'known' ? '已掌握' : '标记已掌握'}
            </button>
            <button
              className="stamp"
              onClick={handleSave}
              disabled={!form.word.trim()}
            >
              保存
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
