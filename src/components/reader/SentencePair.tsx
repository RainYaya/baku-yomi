import { useState, useCallback, useRef, useEffect } from 'react';
import type { SentencePair as SentencePairType } from '../../types';
import { usePracticeStore } from '../../stores/practiceSlice';
import { useSettingsStore } from '../../stores/settingsSlice';
import { useBookStore } from '../../stores/bookSlice';
import { useAnalysis } from '../../hooks/useAnalysis';
import { AnalysisPanel } from '../analysis/AnalysisPanel';
import { FiSend, FiEdit2, FiCheck, FiX, FiMessageSquare } from 'react-icons/fi';

interface Props {
  pair: SentencePairType;
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

export function SentencePair({ pair }: Props) {
  const translation = usePracticeStore((s) => s.translations[pair.id] ?? '');
  const analysis = usePracticeStore((s) => s.analyses[pair.id]);
  const note = usePracticeStore((s) => s.notes[pair.id] ?? '');
  const setTranslation = usePracticeStore((s) => s.setTranslation);
  const setNote = usePracticeStore((s) => s.setNote);
  const updatePairChinese = useBookStore((s) => s.updatePairChinese);
  const { analyze, analyzingPairId } = useAnalysis();

  const [isHovered, setIsHovered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const isAnalyzing = analyzingPairId === pair.id;
  const hasWork = translation.trim() || analysis || note.trim();

  const handleSubmit = useCallback(async () => {
    if (!translation.trim()) return;
    setError(null);
    try {
      await analyze(pair.id, pair.japanese, pair.chinese, translation);
    } catch (e) {
      setError(e instanceof Error ? e.message : '分析失败');
    }
  }, [analyze, pair.id, pair.japanese, pair.chinese, translation]);

  const handleSaveNote = useCallback(() => {
    setShowNoteInput(false);
  }, []);

  // Focus note input when shown
  useEffect(() => {
    if (showNoteInput && noteInputRef.current) {
      noteInputRef.current.focus();
    }
  }, [showNoteInput]);

  return (
    <article
      className="group relative transition-all duration-200"
      style={{
        borderBottom: '1px solid var(--border-light)',
        padding: '1.25rem 2rem',
        backgroundColor: isHovered ? 'var(--bg-paper)' : hasWork ? 'var(--bg-secondary)' : 'transparent',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowNoteInput(false);
      }}
    >
      {/* Left indicator for worked items */}
      {hasWork && (
        <div
          className="absolute left-0 top-0 bottom-0 w-0.5 transition-opacity"
          style={{
            backgroundColor: 'var(--accent-primary)',
            opacity: isHovered ? 0.6 : 0.3,
          }}
        />
      )}

      <div className="max-w-2xl">
        {/* Japanese */}
        <JapaneseText
          pair={pair}
          className="text-reading mb-3"
          style={{ lineHeight: '2' }}
        />

        {/* Chinese with edit */}
        <div className="flex items-start gap-2 group/chinese">
          <div
            style={{
              paddingLeft: '1.5rem',
              borderLeft: '2px solid var(--accent-subtle)',
            }}
          >
            <p
              className="text-reading opacity-70"
              style={{ fontSize: '0.9em' }}
            >
              {pair.chinese}
            </p>
          </div>

          {/* Edit button - always visible for worked items, hover for others */}
          {(hasWork || isHovered) && !editing && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditText(pair.chinese);
                setEditing(true);
              }}
              className="opacity-0 group-hover/chinese:opacity-50 hover:!opacity-100 p-1 transition-all flex-shrink-0"
              style={{ color: 'var(--ink-muted)' }}
              title="编辑译文"
            >
              <FiEdit2 size={13} />
            </button>
          )}

          {/* Editing state */}
          {editing && (
            <div className="flex gap-1.5 ml-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updatePairChinese(pair.id, editText);
                  setEditing(false);
                }}
                className="p-1 opacity-60 hover:opacity-100 transition-opacity"
                style={{ color: 'var(--accent-primary)' }}
              >
                <FiCheck size={14} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(false);
                }}
                className="p-1 opacity-40 hover:opacity-70 transition-opacity"
              >
                <FiX size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Hover: Translation input area */}
        {isHovered && (
          <div className="mt-4 pt-4 animate-fade-in" style={{ borderTop: '1px dashed var(--border-light)' }}>
            {/* Note indicator */}
            {note.trim() && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNoteInput(!showNoteInput);
                }}
                className="flex items-center gap-1.5 text-xs mb-3 transition-opacity"
                style={{
                  fontFamily: 'var(--font-ui)',
                  color: 'var(--accent-secondary)',
                  opacity: 0.7,
                }}
              >
                <FiMessageSquare size={13} />
                {note.slice(0, 30)}{note.length > 30 ? '...' : ''}
              </button>
            )}

            {/* Note input */}
            {showNoteInput && (
              <div className="mb-3">
                <textarea
                  ref={noteInputRef}
                  value={note}
                  onChange={(e) => setNote(pair.id, e.target.value)}
                  onBlur={handleSaveNote}
                  placeholder="添加笔记..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm resize-none"
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '3px',
                    backgroundColor: 'var(--bg-secondary)',
                    fontFamily: 'var(--font-body)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}

            {/* Translation input */}
            <textarea
              value={translation}
              onChange={(e) => setTranslation(pair.id, e.target.value)}
              placeholder="在此输入日语回译..."
              rows={2}
              className="w-full px-4 py-3 text-reading"
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: '3px',
                backgroundColor: 'var(--bg-secondary)',
              }}
              onClick={(e) => e.stopPropagation()}
            />

            {/* Submit row */}
            <div className="flex justify-between items-center mt-2">
              <div>
                {error && (
                  <span className="text-xs" style={{ color: 'var(--error-color)' }}>
                    {error}
                  </span>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSubmit();
                }}
                disabled={isAnalyzing || !translation.trim()}
                className="btn btn-primary flex items-center gap-2"
                style={{
                  opacity: isAnalyzing || !translation.trim() ? 0.4 : 1,
                }}
              >
                {isAnalyzing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    分析中
                  </>
                ) : (
                  <>
                    <FiSend size={14} />
                    提交
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Analysis result - always visible */}
        {analysis && <AnalysisPanel result={analysis} />}
      </div>
    </article>
  );
}
