import { useState, useRef, useEffect } from 'react';
import type { SentencePair as SentencePairType } from '../../types';
import { usePracticeStore } from '../../stores/practiceSlice';
import { useSettingsStore } from '../../stores/settingsSlice';
import { useBookStore } from '../../stores/bookSlice';
import { useAnalysis } from '../../hooks/useAnalysis';
import { generateBacktranslateHints } from '../../lib/ai/client';
import { AnalysisPanel } from '../analysis/AnalysisPanel';
import { FiX, FiSend, FiMessageSquare, FiZap } from 'react-icons/fi';

interface Props {
  pair: SentencePairType | null;
  onClose: () => void;
}

export function PracticePanel({ pair, onClose }: Props) {
  const translation = usePracticeStore((s) => pair ? s.translations[pair.id] ?? '' : '');
  const analysis = usePracticeStore((s) => pair ? s.analyses[pair.id] : null);
  const note = usePracticeStore((s) => pair ? s.notes[pair.id] ?? '' : '');
  const hint = usePracticeStore((s) => pair ? s.hints[pair.id] : '');
  const setTranslation = usePracticeStore((s) => s.setTranslation);
  const setNote = usePracticeStore((s) => s.setNote);
  const setHint = usePracticeStore((s) => s.setHint);
  const updatePairChinese = useBookStore((s) => s.updatePairChinese);
  const { analyze, analyzingPairId } = useAnalysis();
  const aiProvider = useSettingsStore((s) => s.aiProvider);

  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [loadingHint, setLoadingHint] = useState(false);
  const [hintError, setHintError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isAnalyzing = analyzingPairId === pair?.id;
  const hasOptimizedTranslation = hint && hint !== pair?.chinese;

  useEffect(() => {
    if (pair) {
      setEditing(false);
      setShowNote(false);
      setError(null);
      setHintError(null);
    }
  }, [pair?.id]);

  useEffect(() => {
    if (pair && inputRef.current) {
      inputRef.current.focus();
    }
  }, [pair?.id]);

  const handleSubmit = async () => {
    if (!pair || !translation.trim()) return;
    setError(null);
    try {
      await analyze(pair.id, pair.japanese, pair.chinese, translation);
    } catch (e) {
      setError(e instanceof Error ? e.message : '分析失败');
    }
  };

  const handleOptimizeTranslation = async () => {
    if (!pair || !aiProvider.apiKey) {
      setHintError('请先在设置中配置 AI API Key');
      return;
    }
    setLoadingHint(true);
    setHintError(null);
    try {
      const optimized = await generateBacktranslateHints(aiProvider, pair.japanese, pair.chinese);
      // Save optimized translation as the new Chinese translation
      updatePairChinese(pair.id, optimized);
      setHint(pair.id, optimized);
    } catch (e) {
      setHintError(e instanceof Error ? e.message : '优化译文失败');
    } finally {
      setLoadingHint(false);
    }
  };

  if (!pair) {
    return null;
  }

  return (
    <aside
      className="h-full flex flex-col animate-fade-in"
      style={{
        width: '24rem',
        borderLeft: '1px solid var(--border-light)',
        backgroundColor: 'var(--bg-paper)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid var(--border-light)' }}
      >
        <span
          className="text-xs font-medium"
          style={{
            fontFamily: 'var(--font-ui)',
            color: 'var(--ink-muted)',
            letterSpacing: '0.08em',
          }}
        >
          练习
        </span>
        <button
          onClick={onClose}
          className="p-1 opacity-40 hover:opacity-100 transition-opacity"
        >
          <FiX size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Japanese original */}
        <div>
          <span className="tag mb-2 block">原文</span>
          <p className="text-reading" style={{ lineHeight: '1.9' }}>
            {pair.japanese}
          </p>
        </div>

        {/* Chinese translation */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="tag">译文</span>
            <button
              onClick={handleOptimizeTranslation}
              disabled={loadingHint}
              className="flex items-center gap-1.5 text-xs px-3 py-1 rounded transition-all"
              style={{
                fontFamily: 'var(--font-ui)',
                backgroundColor: 'rgba(124, 106, 173, 0.1)',
                color: 'var(--accent-secondary)',
                opacity: loadingHint ? 0.5 : 1,
              }}
            >
              {loadingHint ? (
                <>
                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  优化中
                </>
              ) : (
                <>
                  <FiZap size={12} />
                  优化译文
                </>
              )}
            </button>
          </div>

          {hintError && (
            <p className="text-xs mb-2" style={{ color: 'var(--error-color)' }}>
              {hintError}
            </p>
          )}

          {editing ? (
            <div className="space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm resize-none"
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--bg-secondary)',
                  fontFamily: 'var(--font-body)',
                }}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    updatePairChinese(pair.id, editText);
                    setEditing(false);
                  }}
                  className="text-xs px-3 py-1 rounded"
                  style={{
                    backgroundColor: 'var(--accent-primary)',
                    color: 'var(--bg-paper)',
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  保存
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="text-xs px-3 py-1 rounded opacity-50"
                  style={{ fontFamily: 'var(--font-ui)' }}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-reading opacity-70" style={{ fontSize: '0.9em' }}>
                {pair.chinese}
              </p>
              {hasOptimizedTranslation && (
                <p className="text-xs mt-2 opacity-50" style={{ fontFamily: 'var(--font-ui)' }}>
                  已优化为适合回译的版本
                </p>
              )}
              <button
                onClick={() => {
                  setEditText(pair.chinese);
                  setEditing(true);
                }}
                className="text-xs mt-2 opacity-40 hover:opacity-80 transition-opacity"
                style={{ fontFamily: 'var(--font-ui)', color: 'var(--ink-muted)' }}
              >
                编辑
              </button>
            </div>
          )}
        </div>

        {/* Note */}
        {(note.trim() || showNote) && (
          <div>
            <button
              onClick={() => setShowNote(!showNote)}
              className="flex items-center gap-1.5 text-xs mb-2"
              style={{
                fontFamily: 'var(--font-ui)',
                color: 'var(--accent-secondary)',
              }}
            >
              <FiMessageSquare size={13} />
              笔记
            </button>
            {showNote && (
              <textarea
                ref={noteRef}
                value={note}
                onChange={(e) => setNote(pair.id, e.target.value)}
                placeholder="添加笔记..."
                rows={2}
                className="w-full px-3 py-2 text-sm resize-none"
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--bg-secondary)',
                  fontFamily: 'var(--font-body)',
                }}
              />
            )}
          </div>
        )}

        {/* Add note button */}
        {!note.trim() && !showNote && (
          <button
            onClick={() => setShowNote(true)}
            className="flex items-center gap-1.5 text-xs opacity-40 hover:opacity-80 transition-opacity"
            style={{ fontFamily: 'var(--font-ui)', color: 'var(--ink-muted)' }}
          >
            <FiMessageSquare size={13} />
            添加笔记
          </button>
        )}

        {/* Divider */}
        <div style={{ height: '1px', backgroundColor: 'var(--border-light)' }} />

        {/* Translation input */}
        <div>
          <span className="tag mb-2 block">你的回译</span>
          <textarea
            ref={inputRef}
            value={translation}
            onChange={(e) => setTranslation(pair.id, e.target.value)}
            placeholder="输入日语回译..."
            rows={3}
            className="w-full px-4 py-3 text-reading resize-none"
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              backgroundColor: 'var(--bg-secondary)',
            }}
          />
        </div>

        {/* Submit */}
        <div className="flex justify-between items-center">
          <span className="text-xs" style={{ color: 'var(--error-color)' }}>
            {error}
          </span>
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

        {/* Analysis result */}
        {analysis && <AnalysisPanel result={analysis} />}
      </div>
    </aside>
  );
}
