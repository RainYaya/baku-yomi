import { useState, useCallback, useEffect, useRef } from 'react';
import type { SentencePair as SentencePairType } from '../../types';
import { usePracticeStore } from '../../stores/practiceSlice';
import { useSettingsStore } from '../../stores/settingsSlice';
import { useBookStore } from '../../stores/bookSlice';
import { useAnalysis } from '../../hooks/useAnalysis';
import { AnalysisPanel } from '../analysis/AnalysisPanel';
import { HintPanel } from './HintPanel';
import { HiOutlineEye, HiOutlinePaperAirplane, HiOutlinePencilSquare, HiOutlineCheck, HiOutlineXMark, HiOutlineChatBubbleBottomCenterText } from 'react-icons/hi2';

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
}: {
  pair: SentencePairType;
  className?: string;
}) {
  const showFurigana = useSettingsStore((s) => s.showFurigana);

  if (showFurigana && pair.japaneseHtml) {
    return (
      <p
        className={className}
        dangerouslySetInnerHTML={{ __html: pair.japaneseHtml }}
      />
    );
  }
  return <p className={className}>{pair.japanese}</p>;
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
      className="absolute right-0 top-0 translate-x-[calc(100%+8px)] z-20 w-72 shadow-lg p-3 space-y-2 rounded-sm"
      style={{ backgroundColor: 'var(--bg-color)', border: 'var(--border-style)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide">笔记</span>
        <button onClick={onClose} className="p-0.5 opacity-50 hover:opacity-100">
          <HiOutlineXMark size={14} />
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={note}
        onChange={(e) => {
          setNote(pairId, e.target.value);
          autoResize();
        }}
        placeholder="在此记录学习笔记..."
        rows={3}
        className="w-full px-3 py-2 text-sm focus:outline-none resize-none overflow-hidden rounded-sm"
        style={{ border: 'var(--border-style)', backgroundColor: 'rgba(26, 81, 46, 0.03)' }}
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
  const peekTimer = useRef<ReturnType<typeof setTimeout>>();
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

  // --- Chinese content rendering ---
  const renderChinese = () => {
    if (keywordMode && !active) {
      return <p className="text-sm italic opacity-50">💡 提示模式 — 点击展开获取 AI 提示</p>;
    }
    return <p className="leading-relaxed" style={{ fontSize: '0.9em' }}>{pair.chinese}</p>;
  };

  // Compact reading mode (not active)
  if (!active) {
    return (
      <article
        className={`group cursor-pointer relative transition-colors`}
        style={{
          borderBottom: 'var(--border-style)',
          padding: isParallel ? '1rem' : '1.5rem 1rem',
          ...(isParallel ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' } : {}),
        }}
        onClick={onActivate}
      >
        {/* Left indicator for worked items */}
        {hasWork && !isParallel && (
          <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: 'var(--brand-green)', opacity: 0.4 }} />
        )}

        {/* Japanese */}
        <div>
          {showJapanese && (
            <JapaneseText
              pair={pair}
              className={`leading-relaxed ${isParallel ? '' : 'mb-3'}`}

            />
          )}
          {blindMode && !peeking && (
            <span
              onClick={handlePeek}
              className="text-xs opacity-50 hover:opacity-100 inline-flex items-center gap-1"
            >
              <HiOutlineEye size={12} />
              偷看
            </span>
          )}
          {/* In alternating mode, Chinese goes below Japanese */}
          {!isParallel && (
            <div style={{ paddingLeft: '1.5rem', borderLeft: '2px solid var(--brand-green-light)' }}>
              {renderChinese()}
            </div>
          )}
        </div>

        {/* In parallel mode, Chinese goes in the right column */}
        {isParallel && (
          <div>
            {renderChinese()}
          </div>
        )}

        {/* Note indicator */}
        {note.trim() && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleNote();
            }}
            className="absolute top-3 right-3 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
            title="查看笔记"
          >
            <HiOutlineChatBubbleBottomCenterText size={14} />
          </button>
        )}
        {noteOpen && <NotePopup note={note} pairId={pair.id} setNote={setNote} onClose={onToggleNote} />}
      </article>
    );
  }

  // Expanded practice mode (active)
  return (
    <article
      className="relative space-y-4"
      style={{
        borderBottom: 'var(--border-style)',
        padding: '1.5rem 1rem',
        backgroundColor: 'rgba(26, 81, 46, 0.04)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div
          onClick={onActivate}
          className="cursor-pointer text-xs uppercase tracking-wide opacity-50 hover:opacity-100 select-none"
        >
          点击收起
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleNote();
          }}
          className={`flex items-center gap-1 text-xs uppercase tracking-wide transition-opacity ${
            note.trim() ? 'opacity-80' : 'opacity-40 hover:opacity-80'
          }`}
        >
          <HiOutlineChatBubbleBottomCenterText size={14} />
          {note.trim() ? '笔记' : '添加笔记'}
        </button>
      </div>

      {noteOpen && <NotePopup note={note} pairId={pair.id} setNote={setNote} onClose={onToggleNote} />}

      {/* Japanese original */}
      <div className="flex items-start gap-3">
        <span className="text-xs font-bold uppercase tracking-wide opacity-50 mt-1 flex-shrink-0">日</span>
        {showJapanese ? (
          <JapaneseText pair={pair} className="leading-relaxed flex-1" />
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm italic opacity-40">盲模式已隐藏</span>
            <button
              onClick={handlePeek}
              className="text-xs opacity-60 hover:opacity-100 flex items-center gap-1"
            >
              <HiOutlineEye size={14} />
              偷看3秒
            </button>
          </div>
        )}
      </div>

      {/* Chinese translation */}
      <div className="flex items-start gap-3">
        <span className="text-xs font-bold uppercase tracking-wide opacity-50 mt-1 flex-shrink-0">中</span>
        {editing ? (
          <div className="flex-1 flex gap-2">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={2}
              className="flex-1 px-3 py-1.5 text-sm focus:outline-none resize-none rounded-sm"
              style={{ border: 'var(--border-style)', backgroundColor: 'rgba(26, 81, 46, 0.03)' }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
            <div className="flex flex-col gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updatePairChinese(pair.id, editText);
                  setEditing(false);
                }}
                className="p-1 opacity-60 hover:opacity-100 transition-opacity"
                title="保存"
              >
                <HiOutlineCheck size={16} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(false);
                }}
                className="p-1 opacity-40 hover:opacity-100 transition-opacity"
                title="取消"
              >
                <HiOutlineXMark size={16} />
              </button>
            </div>
          </div>
        ) : keywordMode ? (
          <div className="flex-1 space-y-1.5">
            <HintPanel
              pairId={pair.id}
              japanese={pair.japanese}
              chinese={pair.chinese}
              showReveal
              onReveal={() => setChineseRevealed(!chineseRevealed)}
            />
            {chineseRevealed && (
              <div className="flex items-start gap-1 group/edit">
                <p className="opacity-60 text-sm leading-relaxed flex-1">{pair.chinese}</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditText(pair.chinese);
                    setEditing(true);
                  }}
                  className="opacity-0 group-hover/edit:opacity-60 hover:!opacity-100 p-1 transition-all flex-shrink-0"
                  title="编辑中文翻译"
                >
                  <HiOutlinePencilSquare size={14} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-start gap-1 group/edit">
            <p className="leading-relaxed flex-1" style={{ fontSize: '0.9em' }}>{pair.chinese}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditText(pair.chinese);
                setEditing(true);
              }}
              className="opacity-0 group-hover/edit:opacity-60 hover:!opacity-100 p-1 transition-all flex-shrink-0"
              title="编辑中文翻译"
            >
              <HiOutlinePencilSquare size={14} />
            </button>
          </div>
        )}
      </div>

      {/* User translation input */}
      <div className="pt-2">
        <textarea
          value={translation}
          onChange={(e) => setTranslation(pair.id, e.target.value)}
          placeholder="在此输入你的日语回译..."
          rows={2}
          className="w-full px-3 py-2 text-sm focus:outline-none resize-none rounded-sm"
          style={{ border: 'var(--border-style)', backgroundColor: 'rgba(26, 81, 46, 0.03)' }}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex justify-between items-center mt-2">
          <div>
            {error && (
              <span className="text-xs" style={{ color: '#b91c1c' }}>{error}</span>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={isAnalyzing || !translation.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-sm transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--brand-green)', color: 'var(--bg-color)' }}
          >
            {isAnalyzing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                分析中...
              </>
            ) : (
              <>
                <HiOutlinePaperAirplane size={14} />
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
