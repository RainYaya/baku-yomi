import { useRef, useState } from 'react';
import type { SentencePair as SentencePairType } from '../../types';
import { usePracticeStore } from '../../stores/practiceSlice';
import { useSettingsStore } from '../../stores/settingsSlice';
import { useBookStore } from '../../stores/bookSlice';
import { useAnalysis } from '../../hooks/useAnalysis';
import { isKeylessProvider } from '../../types';
import { generateBacktranslateHints } from '../../lib/ai/client';
import { FeedbackNotes, scoreOf } from '../analysis/FeedbackNotes';
import { ExplainContent } from '../explain/ExplainContent';
import type {
  ReaderSessionEvent,
  ReaderSessionState,
} from '../../machines/reader';

export type InlineTab = 'practice' | 'explain';

interface Props {
  pair: SentencePairType;
  session: ReaderSessionState;
  tab: InlineTab;
  fragment: string;
  onTabChange: (tab: InlineTab) => void;
  onClose: () => void;
  onOpenDesk: () => void;
  onSessionEvent: (event: ReaderSessionEvent) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * S1 — the practice card that expands under the selected sentence.
 *
 * It sits in the reading flow, directly under the sentence it belongs to, and
 * keeps the artboard's two-column sheet: write on the left, the marked-up
 * feedback sheet on the right.
 */
export function InlinePracticeCard({
  pair,
  session,
  tab,
  fragment,
  onTabChange,
  onClose,
  onOpenDesk,
  onSessionEvent,
  inputRef,
}: Props) {
  const translation = usePracticeStore((s) => s.translations[pair.id] ?? '');
  const analysis = usePracticeStore((s) => s.analyses[pair.id]);
  const note = usePracticeStore((s) => s.notes[pair.id] ?? '');
  const hint = usePracticeStore((s) => s.hints[pair.id + '_hint'] ?? '');
  const setTranslation = usePracticeStore((s) => s.setTranslation);
  const setNote = usePracticeStore((s) => s.setNote);
  const setHint = usePracticeStore((s) => s.setHint);
  const updatePairChinese = useBookStore((s) => s.updatePairChinese);
  const aiProvider = useSettingsStore((s) => s.getActiveAIProvider());
  const { analyze } = useAnalysis();

  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintError, setHintError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const isAnalyzing = session.phase === 'analyzing';
  const errorText = session.phase === 'failed' ? session.message : error;

  const handleSubmit = async () => {
    if (!translation.trim()) return;
    if (!aiProvider.apiKey && !isKeylessProvider(aiProvider.type)) {
      setError('请先在设置中配置 AI API Key');
      return;
    }

    const requestId = ++requestIdRef.current;
    setError(null);
    onSessionEvent({ type: 'SUBMIT', requestId });

    try {
      await analyze(pair.id, pair.japanese, pair.chinese, translation);
      onSessionEvent({ type: 'ANALYSIS_SUCCEEDED', requestId });
    } catch (e) {
      const message = e instanceof Error ? e.message : '分析失败';
      onSessionEvent({ type: 'ANALYSIS_FAILED', requestId, message });
    }
  };

  const handleGetHint = async () => {
    if (!aiProvider.apiKey && !isKeylessProvider(aiProvider.type)) {
      setHintError('请先在设置中配置 AI API Key');
      return;
    }
    setHintLoading(true);
    setHintError(null);
    try {
      const text = await generateBacktranslateHints(
        aiProvider,
        pair.japanese,
        pair.chinese
      );
      setHint(pair.id + '_hint', text);
    } catch (e) {
      setHintError(e instanceof Error ? e.message : '获取提示失败');
    } finally {
      setHintLoading(false);
    }
  };

  return (
    <section
      className="inline-card"
      data-inline-tab={tab}
      data-practice-state={session.phase}
      onClick={(e) => e.stopPropagation()}
    >
      <header className="expand-head">
        <div className="expand-tabs" role="tablist" aria-label="句内练习">
          <button
            role="tab"
            aria-selected={tab === 'practice'}
            className={`expand-tab${tab === 'practice' ? ' active' : ''}`}
            onClick={() => onTabChange('practice')}
          >
            練習
          </button>
          <button
            role="tab"
            aria-selected={tab === 'explain'}
            className={`expand-tab${tab === 'explain' ? ' active' : ''}`}
            onClick={() => onTabChange('explain')}
          >
            講解
          </button>
        </div>
        <span className="expand-meta">
          第 {pair.pairIndex + 1} 句 · 就在这一句下面写，不离开阅读
        </span>
        <div className="expand-actions">
          <button className="desk-link" onClick={onOpenDesk}>
            练习桌 ↗
          </button>
          <button className="inline-collapse" onClick={onClose}>
            收起 <kbd>Esc</kbd>
          </button>
        </div>
      </header>

      {tab === 'explain' ? (
        <div className="expand-body expand-body-explain">
          <ExplainContent
            sentence={pair.japanese}
            fragment={fragment}
            onClose={onClose}
            compact
          />
        </div>
      ) : (
        <div className="expand-body">
          <div className="write-col">
            <label className="field-label" htmlFor={`inline-write-${pair.id}`}>
              你的回译
            </label>
            <textarea
              id={`inline-write-${pair.id}`}
              ref={inputRef}
              value={translation}
              onChange={(e) => setTranslation(pair.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="把这一句写回日语…"
              rows={3}
              className="write-area"
            />
            <div className="write-meta">
              <span>Ctrl + Enter 提交</span>
              <span>{translation.length} 字</span>
            </div>

            {errorText && <p className="feedback-error">{errorText}</p>}
            {hintError && <p className="feedback-error">{hintError}</p>}

            <div className="practice-actions">
              <button
                className="stamp"
                onClick={() => void handleSubmit()}
                disabled={isAnalyzing || !translation.trim()}
              >
                {isAnalyzing ? '批改中…' : '批改'}
              </button>
              <button
                className="quiet-link"
                onClick={() => void handleGetHint()}
                disabled={hintLoading}
              >
                {hintLoading ? '获取中…' : '获取提示'}
              </button>
              <button
                className="quiet-link"
                onClick={() => {
                  setEditText(pair.chinese);
                  setEditing(true);
                }}
              >
                编辑译文
              </button>
              <button className="quiet-link" onClick={() => setShowNote(true)}>
                笔记
              </button>
            </div>

            {editing && (
              <div className="inline-edit">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={2}
                  aria-label="编辑中文译文"
                />
                <div className="inline-edit-actions">
                  <button
                    className="stamp"
                    onClick={() => {
                      updatePairChinese(pair.id, editText);
                      setEditing(false);
                    }}
                  >
                    保存译文
                  </button>
                  <button className="quiet-link" onClick={() => setEditing(false)}>
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="feedback-col">
            <div className="note-head">
              <b>AI 批注</b>
              {analysis && (
                <span className="score">
                  {scoreOf(analysis)}
                  <span>/100</span>
                </span>
              )}
            </div>

            {analysis ? (
              <FeedbackNotes result={analysis} />
            ) : (
              <p className="feedback-empty">
                提交后，这里会出现逐条批注。也可以先切到「講解」看语法和语感。
              </p>
            )}

            {hint && (
              <div className="feedback-hint">
                <span className="mini-label">回译提示</span>
                {hint.split('\n').filter(Boolean).map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            )}

            {(note.trim() || showNote) && (
              <div className="inline-note">
                <span className="mini-label">笔记</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(pair.id, e.target.value)}
                  placeholder="记下这一句的语感、搭配或疑问…"
                  rows={2}
                  aria-label="这一句的笔记"
                />
              </div>
            )}

            {analysis && (
              <p className="note-foot">
                AI 批改 ·{' '}
                {new Date(analysis.analyzedAt).toLocaleString('zh-CN', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
