import { useEffect, useRef, useState } from 'react';
import type { Chapter, SentencePair as SentencePairType } from '../../types';
import { usePracticeStore } from '../../stores/practiceSlice';
import { useSettingsStore } from '../../stores/settingsSlice';
import { useBookStore } from '../../stores/bookSlice';
import { useUIStore } from '../../stores/uiSlice';
import { useAnalysis } from '../../hooks/useAnalysis';
import { isKeylessProvider } from '../../types';
import { generateBacktranslateHints } from '../../lib/ai/client';
import { FeedbackNotes, scoreOf } from '../analysis/FeedbackNotes';
import { ExplainContent } from '../explain/ExplainContent';
import { ThemeToggle } from '../../theme/ThemeToggle';
import type {
  ReaderSessionEvent,
  ReaderSessionState,
} from '../../machines/reader';
import { FiSettings } from 'react-icons/fi';
import type { InlineTab } from './InlinePracticeCard';

interface Props {
  pair: SentencePairType;
  chapter: Chapter;
  session: ReaderSessionState;
  tab: InlineTab;
  fragment: string;
  onTabChange: (tab: InlineTab) => void;
  onBack: () => void;
  onClose: () => void;
  onSessionEvent: (event: ReaderSessionEvent) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * S2 — the full-page practice desk.
 *
 * Three sheets on a desk: the source, the writing sheet, and the feedback
 * sheet taped beside it. It is a deliberate mode, not a rail: the reading
 * column is not squeezed, and Escape steps back to the inline card with the
 * draft and analysis intact.
 */
export function PracticeDesk({
  pair,
  chapter,
  session,
  tab,
  fragment,
  onTabChange,
  onBack,
  onClose,
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
  const openSettings = useUIStore((s) => s.openSettings);
  const { analyze } = useAnalysis();

  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintError, setHintError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const deskRef = useRef<HTMLDivElement>(null);

  // The desk is a full-page mode: the cursor lands where the writing happens,
  // and focus returns to whatever opened it when it closes.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (inputRef.current ?? deskRef.current)?.focus();
    return () => previous?.focus?.();
  }, [inputRef]);

  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const node = deskRef.current;
    if (!node) return;
    const focusable = [
      ...node.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ),
    ].filter((el) => el.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const isAnalyzing = session.phase === 'analyzing';
  const errorText = session.phase === 'failed' ? session.message : error;

  const prevPair = chapter.pairs[pair.pairIndex - 1] ?? null;
  const nextPair = chapter.pairs[pair.pairIndex + 1] ?? null;

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
    <div
      ref={deskRef}
      className="d2-app"
      data-practice-state={session.phase}
      role="dialog"
      aria-modal="true"
      aria-label="练习桌"
      tabIndex={-1}
      onKeyDown={trapFocus}
    >
      <header className="d2-topbar">
        <div className="d2-top-left">
          <button className="d2-brand" onClick={onClose} title="返回阅读">
            <b>baku-yomi</b>
            <span>読書 / 回訳</span>
          </button>
          <div className="d2-mode-switch" role="tablist" aria-label="练习桌内容">
            <button
              role="tab"
              aria-selected={tab === 'practice'}
              className={tab === 'practice' ? 'active' : ''}
              onClick={() => onTabChange('practice')}
            >
              練習
            </button>
            <button
              role="tab"
              aria-selected={tab === 'explain'}
              className={tab === 'explain' ? 'active' : ''}
              onClick={() => onTabChange('explain')}
            >
              講解
            </button>
          </div>
        </div>

        <div className="d2-book-meta">
          <b>{chapter.title}</b>
          <span>第 {pair.pairIndex + 1} 句</span>
        </div>

        <div className="d2-top-right">
          <span className="d2-progress">
            <b>{pair.pairIndex + 1}</b> / {chapter.pairs.length}
          </span>
          <ThemeToggle className="d2-icon-btn" />
          <button
            className="d2-icon-btn"
            onClick={openSettings}
            title="打开设置"
            aria-label="打开设置"
          >
            <FiSettings size={15} />
          </button>
        </div>
      </header>

      {tab === 'explain' ? (
        <main className="d2-body d2-body-explain">
          <section className="d2-sheet d2-explain">
            <ExplainContent
              sentence={pair.japanese}
              fragment={fragment}
              onClose={() => onTabChange('practice')}
            />
          </section>
        </main>
      ) : (
        <main className="d2-body">
          <aside className="d2-sheet d2-source">
            <div className="d2-sheet-head">
              <span className="d2-kicker">原文</span>
              <span className="d2-count">第 {pair.pairIndex + 1} 句</span>
            </div>
            <div className="d2-source-strip">
              <p className="d2-source-ja">{pair.japanese}</p>
              <p className="d2-source-zh">{pair.chinese || '暂无译文'}</p>
            </div>
            <div className="d2-context">
              <div className="d2-context-row">
                <span className="d2-context-label">上一句</span>
                <p>{prevPair?.japanese ?? '已经是第一句'}</p>
              </div>
              <div className="d2-context-row">
                <span className="d2-context-label">下一句</span>
                <p>{nextPair?.japanese ?? '已经是最后一句'}</p>
              </div>
            </div>
            <button className="d2-locate" onClick={onClose}>
              在原文中定位 ↗
            </button>
          </aside>

          <section className="d2-sheet d2-write">
            <span className="d2-tape" aria-hidden="true" />
            <div className="d2-write-head">
              <div>
                <span className="d2-kicker">練習 · 第 {pair.pairIndex + 1} 句</span>
                <h2>你的回译</h2>
              </div>
              <span className="d2-write-count">{translation.length} 字</span>
            </div>
            <p className="d2-write-prompt">
              看着左边的中文，把这一句写回日语。不必和原文一字不差，先写出你的版本。
            </p>

            <textarea
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
              className="d2-write-area"
              aria-label="你的回译"
            />

            <div className="d2-write-meta">
              <span>Ctrl + Enter 提交</span>
              <span>
                第 {pair.pairIndex + 1} 句 / {chapter.pairs.length}
              </span>
            </div>

            <div className="d2-write-actions">
              <button
                className="d2-stamp"
                onClick={() => void handleSubmit()}
                disabled={isAnalyzing || !translation.trim()}
              >
                {isAnalyzing ? '批改中…' : '提交批改'}
              </button>
              <button
                className="d2-quiet"
                onClick={() => void handleGetHint()}
                disabled={hintLoading}
              >
                {hintLoading ? '获取中…' : '获取提示'}
              </button>
              <span className="d2-write-hint">Esc 回到句内卡片</span>
            </div>
            {errorText && <p className="d2-error">{errorText}</p>}
            {hintError && <p className="d2-error">{hintError}</p>}

            {hint && (
              <div className="d2-hint-block">
                <span className="d2-kicker">回译提示</span>
                {hint.split('\n').filter(Boolean).map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            )}

            <div className="d2-note-row">
              <button
                className="d2-quiet"
                onClick={() => {
                  setEditText(pair.chinese);
                  setEditing(true);
                }}
              >
                编辑译文
              </button>
              <button className="d2-quiet" onClick={() => setShowNote(true)}>
                添加笔记
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
                    className="d2-stamp"
                    onClick={() => {
                      updatePairChinese(pair.id, editText);
                      setEditing(false);
                    }}
                  >
                    保存译文
                  </button>
                  <button className="d2-quiet" onClick={() => setEditing(false)}>
                    取消
                  </button>
                </div>
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
          </section>

          <aside className="d2-sheet d2-feedback">
            <span className="d2-tape d2-tape-right" aria-hidden="true" />
            <div className="d2-feedback-head">
              <div>
                <span className="d2-kicker">AI 批注</span>
                <h2>这一句的批改</h2>
              </div>
              {analysis && (
                <span className="d2-score">
                  {scoreOf(analysis)}
                  <span>/100</span>
                </span>
              )}
            </div>
            {analysis ? (
              <FeedbackNotes result={analysis} variant="desk" />
            ) : (
              <p className="d2-empty">
                提交后，这里会出现逐条批注。也可以切到「講解」看这一句的语法和语感。
              </p>
            )}
            {analysis && (
              <div className="d2-feedback-foot">
                <p className="d2-provenance">
                  AI 批改 · 依据回译与原文 ·{' '}
                  {new Date(analysis.analyzedAt).toLocaleString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <button className="d2-quiet" onClick={onBack}>
                  句内练习 ↗
                </button>
              </div>
            )}
          </aside>
        </main>
      )}
    </div>
  );
}
