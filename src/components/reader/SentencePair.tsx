import { useState, useCallback, useEffect, useRef } from 'react';
import type { SentencePair as SentencePairType } from '../../types';
import { usePracticeStore } from '../../stores/practiceSlice';
import { useSettingsStore } from '../../stores/settingsSlice';
import { useBookStore } from '../../stores/bookSlice';
import { useAnalysis } from '../../hooks/useAnalysis';
import { AnalysisPanel } from '../analysis/AnalysisPanel';
import { HintPanel } from './HintPanel';
import { FiEye, FiSend, FiEdit2, FiCheck, FiX, FiMessageSquare } from 'react-icons/fi';

interface Props {
  pair: SentencePairType;
  active: boolean;
  onActivate: () => void;
  noteOpen: boolean;
  onToggleNote: () => void;
}

/** Render Japanese text, with or without furigana (ruby) */
function JapaneseText({
  pair,
  className,
  style,
}: {
  pair: SentencePairType;
  className?: string;
  style?: React.CSSProperties;
}) {
  const showFurigana = useSettingsStore((s) => s.showFurigana);

  if (showFurigana && pair.japaneseHtml) {
    return (
      <p
        className={className}
        style={style}
        dangerouslySetInnerHTML={{ __html: pair.japaneseHtml }}
      />
    );
  }
  return <p className={className} style={style}>{pair.japanese}</p>;
}

/** Floating note popup anchored to the right side */
function NotePopup({
  note,
  pairId,
  setNote,
  onClose,
}: {
  note: string;
  pairId: string;
  setNote: (id: string, text: string) => void;
  onClose: () => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }, []);

  useEffect(() => {
    autoResize();
  }, [note, autoResize]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={popupRef}
      className="absolute right-0 top-0 translate-x-full z-20 w-64 animate-slide-up"
      style={{
        backgroundColor: 'var(--bg-paper)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-soft)',
        padding: '1rem',
        marginLeft: '12px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="tag">笔记</span>
        <button
          onClick={onClose}
          className="p-1 opacity-40 hover:opacity-100 transition-opacity"
        >
          <FiX size={14} />
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={note}
        onChange={(e) => {
          setNote(pairId, e.target.value);
          autoResize();
        }}
        placeholder="在此记录..."
        rows={3}
        className="w-full px-3 py-2 text-sm resize-none overflow-hidden"
        style={{
          border: '1px solid var(--border-light)',
          borderRadius: '3px',
          backgroundColor: 'var(--bg-secondary)',
        }}
        autoFocus
      />
    </div>
  );
}

export function SentencePair({ pair, active, onActivate, noteOpen, onToggleNote }: Props) {
  const blindMode = useSettingsStore((s) => s.blindMode);
  const keywordMode = useSettingsStore((s) => s.keywordMode);
  const layoutMode = useSettingsStore((s) => s.layoutMode);
  const translation = usePracticeStore((s) => s.translations[pair.id] ?? '');
  const analysis = usePracticeStore((s) => s.analyses[pair.id]);
  const note = usePracticeStore((s) => s.notes[pair.id] ?? '');
  const setTranslation = usePracticeStore((s) => s.setTranslation);
  const setNote = usePracticeStore((s) => s.setNote);
  const updatePairChinese = useBookStore((s) => s.updatePairChinese);
  const { analyze, analyzingPairId } = useAnalysis();
  const [error, setError] = useState<string | null>(null);
  const [peeking, setPeeking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [chineseRevealed, setChineseRevealed] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isAnalyzing = analyzingPairId === pair.id;

  useEffect(() => {
    setChineseRevealed(false);
  }, [pair.id]);

  useEffect(() => {
    return () => {
      if (peekTimer.current) clearTimeout(peekTimer.current);
    };
  }, []);

  const handlePeek = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPeeking(true);
    if (peekTimer.current) clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeeking(false), 3000);
  }, []);

  const handleSubmit = useCallback(async () => {
    setError(null);
    try {
      await analyze(pair.id, pair.japanese, pair.chinese, translation);
    } catch (e) {
      setError(e instanceof Error ? e.message : '分析失败');
    }
  }, [analyze, pair, translation]);

  const showJapanese = !blindMode || peeking;
  const hasWork = translation.trim() || analysis || note.trim();
  const isParallel = layoutMode === 'parallel';

  // Compact reading mode (not active)
  if (!active) {
    return (
      <article
        className="group cursor-pointer relative transition-all duration-200 hover:bg-opacity-50"
        style={{
          borderBottom: '1px solid var(--border-light)',
          padding: isParallel ? '1.25rem 2rem' : '1.5rem 2rem',
          backgroundColor: hasWork ? 'var(--bg-secondary)' : 'transparent',
        }}
        onClick={onActivate}
      >
        {/* Left indicator for worked items */}
        {hasWork && !isParallel && (
          <div
            className="absolute left-0 top-0 bottom-0 w-0.5"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          />
        )}

        <div className="max-w-2xl">
          {/* Japanese */}
          <div>
            {showJapanese && (
              <JapaneseText
                pair={pair}
                className="text-reading mb-4"
                style={{ lineHeight: '2' }}
              />
            )}
            {blindMode && !peeking && (
              <button
                onClick={handlePeek}
                className="text-xs opacity-40 hover:opacity-70 inline-flex items-center gap-1 transition-opacity"
                style={{ color: 'var(--ink-muted)' }}
              >
                <FiEye size={12} />
                原文
              </button>
            )}
            {/* Chinese below in alternating mode */}
            {!isParallel && (
              <div
                className="text-reading opacity-70"
                style={{
                  paddingLeft: '1.5rem',
                  borderLeft: '2px solid var(--accent-subtle)',
                  fontSize: '0.9em',
                }}
              >
                <p>{pair.chinese}</p>
              </div>
            )}
          </div>

          {/* Chinese in parallel mode */}
          {isParallel && (
            <div style={{ fontSize: '0.9em', opacity: 0.7 }}>
              <p>{pair.chinese}</p>
            </div>
          )}
        </div>

        {/* Note indicator */}
        {note.trim() && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleNote();
            }}
            className="absolute top-4 right-4 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity"
            title="查看笔记"
          >
            <FiMessageSquare size={14} />
          </button>
        )}
        {noteOpen && <NotePopup note={note} pairId={pair.id} setNote={setNote} onClose={onToggleNote} />}
      </article>
    );
  }

  // Expanded practice mode (active)
  return (
    <article
      className="relative space-y-5 animate-slide-up"
      style={{
        borderBottom: '1px solid var(--border-color)',
        padding: '2rem',
        backgroundColor: 'var(--bg-paper)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onActivate}
          className="text-xs opacity-40 hover:opacity-70 transition-opacity cursor-pointer"
          style={{ fontFamily: 'var(--font-ui)', letterSpacing: '0.05em' }}
        >
          收起
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleNote();
          }}
          className={`flex items-center gap-1.5 text-xs transition-opacity ${
            note.trim() ? 'opacity-60' : 'opacity-30 hover:opacity-60'
          }`}
          style={{ fontFamily: 'var(--font-ui)' }}
        >
          <FiMessageSquare size={14} />
          {note.trim() ? '笔记' : '笔记'}
        </button>
      </div>

      {noteOpen && <NotePopup note={note} pairId={pair.id} setNote={setNote} onClose={onToggleNote} />}

      {/* Japanese original */}
      <div className="flex items-start gap-4">
        <span className="tag mt-1">原文</span>
        <div className="flex-1">
          {showJapanese ? (
            <JapaneseText pair={pair} className="text-reading" />
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm opacity-40 italic" style={{ fontFamily: 'var(--font-ui)' }}>
                盲模式已隐藏
              </span>
              <button
                onClick={handlePeek}
                className="text-xs opacity-50 hover:opacity-80 flex items-center gap-1"
                style={{ fontFamily: 'var(--font-ui)' }}
              >
                <FiEye size={14} />
                显示原文
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chinese translation */}
      <div className="flex items-start gap-4">
        <span className="tag mt-1">译文</span>
        <div className="flex-1">
          {editing ? (
            <div className="flex gap-3">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={2}
                className="flex-1 px-3 py-2 text-sm resize-none"
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: '3px',
                  backgroundColor: 'var(--bg-secondary)',
                  fontFamily: 'var(--font-body)',
                }}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updatePairChinese(pair.id, editText);
                    setEditing(false);
                  }}
                  className="p-1.5 opacity-50 hover:opacity-100 transition-opacity"
                  title="保存"
                >
                  <FiCheck size={16} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(false);
                  }}
                  className="p-1.5 opacity-30 hover:opacity-70 transition-opacity"
                  title="取消"
                >
                  <FiX size={16} />
                </button>
              </div>
            </div>
          ) : keywordMode ? (
            <div className="space-y-3">
              <HintPanel
                pairId={pair.id}
                japanese={pair.japanese}
                chinese={pair.chinese}
                showReveal
                onReveal={() => setChineseRevealed(!chineseRevealed)}
              />
              {chineseRevealed && (
                <div className="flex items-start gap-2 group/edit">
                  <p className="opacity-70 text-reading flex-1" style={{ fontSize: '0.95em' }}>
                    {pair.chinese}
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditText(pair.chinese);
                      setEditing(true);
                    }}
                    className="opacity-0 group-hover/edit:opacity-50 hover:!opacity-100 p-1 transition-all flex-shrink-0"
                    title="编辑译文"
                  >
                    <FiEdit2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-2 group/edit">
              <p className="text-reading flex-1" style={{ fontSize: '0.95em' }}>
                {pair.chinese}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditText(pair.chinese);
                  setEditing(true);
                }}
                className="opacity-0 group-hover/edit:opacity-50 hover:!opacity-100 p-1 transition-all flex-shrink-0"
                title="编辑译文"
              >
                <FiEdit2 size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* User translation input */}
      <div className="pt-3">
        <textarea
          value={translation}
          onChange={(e) => setTranslation(pair.id, e.target.value)}
          placeholder="在此输入你的日语回译..."
          rows={2}
          className="w-full px-4 py-3 text-reading"
          style={{
            border: '1px solid var(--border-color)',
            borderRadius: '3px',
            backgroundColor: 'var(--bg-secondary)',
          }}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex justify-between items-center mt-3">
          <div>
            {error && (
              <span className="text-xs" style={{ color: 'var(--error-color)' }}>
                {error}
              </span>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={isAnalyzing || !translation.trim()}
            className="btn btn-primary flex items-center gap-2"
            style={{ opacity: isAnalyzing || !translation.trim() ? 0.4 : 1 }}
          >
            {isAnalyzing ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                分析中
              </>
            ) : (
              <>
                <FiSend size={14} />
                提交分析
              </>
            )}
          </button>
        </div>
      </div>

      {/* Analysis result */}
      {analysis && <AnalysisPanel result={analysis} />}
    </article>
  );
}
