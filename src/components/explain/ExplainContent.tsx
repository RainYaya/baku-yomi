import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FiCornerDownRight,
  FiRefreshCw,
  FiSend,
  FiSquare,
  FiX,
} from 'react-icons/fi';
import {
  EXPLAIN_ACTIONS,
  type ExplainAction,
  type ExplainDepth,
} from '../../types';
import { useExplain, useFollowUp, type FollowUpState } from '../../hooks/useExplain';
import { usePracticeStore } from '../../stores/practiceSlice';
import { MarkdownBlock } from './MarkdownBlock';
import { SentenceUnitText } from './SentenceUnitText';

interface Props {
  /** Stable pair identity for saving explanations; optional in ad-hoc uses. */
  pairId?: string;
  /** The full sentence being explained. */
  sentence: string;
  /** The selected fragment, or '' for the whole sentence. */
  fragment: string;
  /** Optional close action, rendered in the toolbar when provided. */
  onClose?: () => void;
  /** Tighter spacing for the inline card. */
  compact?: boolean;
}

/**
 * The explanation surface, shared by the inline card and the practice desk.
 *
 * It owns the request lifecycle and the answer body, but not the outer
 * header: the parent decides whether this sits under a tab in the reading
 * column or in the middle of the desk.
 */
export function ExplainContent({ pairId, sentence, fragment, onClose, compact = false }: Props) {
  const [action, setAction] = useState<ExplainAction>('meaning');
  const [depth, setDepth] = useState<ExplainDepth>('concise');
  const [followUp, setFollowUp] = useState<FollowUpState>({ status: 'idle', text: '' });
  const [question, setQuestion] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { state, explain, retry, reset, cancel } = useExplain();
  const followUpRunner = useFollowUp();
  const setExplanation = usePracticeStore((s) => s.setExplanation);
  const saved = usePracticeStore((s) =>
    pairId ? (s.explanations ?? {})[`${pairId}:${action}`] : undefined
  );

  const busy = state.status === 'streaming';
  const streamingText = state.status === 'streaming' ? state.text : '';
  const answer = state.status === 'ready' ? state.answer : null;
  // A saved answer only stands in when it was made for the same fragment and
  // depth; narrowing the selection or asking for more detail must re-request.
  const cached =
    saved && saved.fragment === fragment && saved.depth === depth ? saved.answer : null;
  const shownAnswer = answer ?? (state.status === 'idle' ? cached : null);
  const cachedRef = useRef(cached);
  cachedRef.current = cached;

  const explainRef = useRef(explain);
  explainRef.current = explain;

  const run = useCallback(
    (nextAction: ExplainAction, nextDepth: ExplainDepth) => {
      setFollowUp({ status: 'idle', text: '' });
      setQuestion('');
      void explainRef.current({
        sentence,
        fragment,
        action: nextAction,
        depth: nextDepth,
      });
    },
    [fragment, sentence]
  );

  // Run once on open, and again whenever the user picks a different action.
  // A matching saved answer is shown instead, so reopening a sentence costs
  // nothing until the user asks to regenerate.
  useEffect(() => {
    if (cachedRef.current) return;
    run(action, depth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, depth, sentence, fragment]);

  // Persist every completed answer under its pair and action.
  useEffect(() => {
    if (!pairId || state.status !== 'ready') return;
    setExplanation(`${pairId}:${state.answer.action}`, {
      answer: state.answer,
      fragment,
      depth,
    });
  }, [pairId, state, fragment, depth, setExplanation]);

  // Abort whatever is in flight when the surface goes away.
  const resetRef = useRef(reset);
  resetRef.current = reset;
  useEffect(() => {
    return () => resetRef.current();
  }, []);

  // Keep the newest text in view while streaming.
  useEffect(() => {
    if (!busy) return;
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [streamingText, busy]);

  const handleAsk = () => {
    const trimmed = question.trim();
    if (!trimmed || !shownAnswer) return;
    void followUpRunner.ask(
      { sentence, fragment, action, depth },
      trimmed,
      shownAnswer.markdown,
      setFollowUp
    );
    setQuestion('');
  };

  return (
    <div
      className={`explain-content${compact ? ' explain-content-compact' : ''}`}
      data-explain-state={state.status}
      data-explain-action={action}
    >
      <div className="explain-content-toolbar">
        <div className="explain-actions">
          {EXPLAIN_ACTIONS.map((item) => (
            <button
              key={item.id}
              onClick={() => setAction(item.id)}
              title={item.hint}
              className={`explain-action-chip ${action === item.id ? 'active' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="explain-toolbar-right">
          <button
            onClick={() => setDepth(depth === 'concise' ? 'detailed' : 'concise')}
            className="explain-depth-toggle"
            title={depth === 'concise' ? '切换到详细讲解' : '切换到简洁讲解'}
          >
            {depth === 'concise' ? '简洁' : '详细'}
          </button>
          {busy ? (
            <button
              onClick={cancel}
              className="explain-icon-btn"
              title="停止生成"
              aria-label="停止生成讲解"
            >
              <FiSquare size={12} />
            </button>
          ) : (
            <button
              onClick={() => run(action, depth)}
              className="explain-icon-btn"
              title="重新生成"
              aria-label="重新生成讲解"
            >
              <FiRefreshCw size={13} />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="explain-icon-btn"
              title="关闭讲解"
              aria-label="关闭讲解"
            >
              <FiX size={14} />
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="explain-content-body">
        <PinnedExplainSource sentence={sentence} fragment={fragment} />

        {shownAnswer && shownAnswer.units.length > 0 && (
          <div className="explain-units">
            <span className="tag mb-2 block">成分</span>
            <SentenceUnitText sentence={sentence} units={shownAnswer.units} />
          </div>
        )}

        {shownAnswer && shownAnswer.unitsRejected && (
          <p className="explain-note">
            成分表没能和原文对上，已省略。下面的讲解仍然可用。
          </p>
        )}

        {state.status === 'failed' ? (
          <div className="explain-error">
            <p>{state.message}</p>
            <button onClick={() => void retry()} className="explain-retry-btn">
              重试
            </button>
          </div>
        ) : (
          <>
            {shownAnswer ? (
              <MarkdownBlock text={shownAnswer.markdown} className="text-reading" />
            ) : streamingText ? (
              // Render the partial answer as markdown too: the model streams
              // headings and list markers first, and showing them as literal
              // `###` / `1.` makes the panel look broken until it finishes.
              <MarkdownBlock text={streamingText} className="text-reading" />
            ) : (
              <p className="explain-waiting">
                <span className="explain-pulse" aria-hidden="true" />
                正在生成讲解…
              </p>
            )}
            {busy && <span className="explain-cursor" aria-hidden="true" />}
          </>
        )}

        {shownAnswer && (
          <p className="explain-provenance">
            {!answer && '上次的讲解，已保存。'}
            {shownAnswer.model.includes('Index-Translate')
              ? '由免费模型生成，语法细节可能有误，重要结论请自行核对。'
              : `由 ${shownAnswer.model} 生成。`}
          </p>
        )}

        {followUp.status !== 'idle' && (
          <div className="explain-followup">
            <div className="explain-followup-head">
              <FiCornerDownRight size={12} />
              <span>追问</span>
            </div>
            {followUp.status === 'error' ? (
              <p className="explain-error-text">{followUp.error}</p>
            ) : (
              <MarkdownBlock text={followUp.text} className="text-reading" />
            )}
          </div>
        )}
      </div>

      <div className="explain-content-composer">
        <div className="explain-composer-row">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleAsk();
              }
            }}
            placeholder={shownAnswer ? '追问…（Ctrl + Enter 发送）' : '等待讲解完成…'}
            disabled={!shownAnswer}
            rows={1}
            className="explain-question"
          />
          <button
            onClick={handleAsk}
            disabled={!shownAnswer || !question.trim() || followUp.status === 'streaming'}
            className="explain-send"
            title="发送追问"
            aria-label="发送追问"
          >
            <FiSend size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function PinnedExplainSource({
  sentence,
  fragment,
}: {
  sentence: string;
  fragment: string;
}) {
  const index = fragment ? sentence.indexOf(fragment) : -1;
  return (
    <div className="explain-pinned">
      <div className="explain-pinned-meta">
        <span>正在讲解</span>
        <span>{fragment ? '选中片段' : '整句'}</span>
      </div>
      <p className="explain-pinned-sentence">
        {index >= 0 ? (
          <>
            {sentence.slice(0, index)}
            <mark>{fragment}</mark>
            {sentence.slice(index + fragment.length)}
          </>
        ) : (
          sentence
        )}
      </p>
    </div>
  );
}
