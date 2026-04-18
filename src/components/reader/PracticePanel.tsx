import { useState, useRef, useEffect } from 'react';
import type { SentencePair as SentencePairType } from '../../types';
import { usePracticeStore } from '../../stores/practiceSlice';
import { useSettingsStore } from '../../stores/settingsSlice';
import { useBookStore } from '../../stores/bookSlice';
import { useAnalysis } from '../../hooks/useAnalysis';
import { generateBacktranslateHints, optimizeTranslationForBacktranslation } from '../../lib/ai/client';
import { AnalysisPanel } from '../analysis/AnalysisPanel';
import { FiX, FiSend, FiMessageSquare, FiZap, FiHelpCircle } from 'react-icons/fi';

interface Props {
  pair: SentencePairType | null;
  onClose: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  inputMode: boolean;
}

export function PracticePanel({ pair, onClose, inputRef, inputMode }: Props) {
  const hasChinese = pair ? pair.chinese.trim().length > 0 : false;
  const translation = usePracticeStore((s) => pair ? s.translations[pair.id] ?? '' : '');
  const analysis = usePracticeStore((s) => pair ? s.analyses[pair.id] : null);
  const note = usePracticeStore((s) => pair ? s.notes[pair.id] ?? '' : '');
  const hint = usePracticeStore((s) => pair ? s.hints[pair.id + '_hint'] : '');
  const setTranslation = usePracticeStore((s) => s.setTranslation);
  const setNote = usePracticeStore((s) => s.setNote);
  const setHint = usePracticeStore((s) => s.setHint);
  const updatePairChinese = useBookStore((s) => s.updatePairChinese);
  const { analyze, analyzingPairId } = useAnalysis();
  const aiProvider = useSettingsStore((s) => s.getActiveAIProvider());

  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [loadingOptimize, setLoadingOptimize] = useState(false);
  const [loadingHint, setLoadingHint] = useState(false);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  const [hintError, setHintError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const isAnalyzing = analyzingPairId === pair?.id;

  useEffect(() => {
    if (pair?.id) {
      setEditing(false);
      setShowNote(false);
      setError(null);
      setOptimizeError(null);
      setHintError(null);
    }
  }, [pair?.id]);

  // inputMode 变化时控制 focus
  useEffect(() => {
    if (inputMode && pair?.id && inputRef.current) {
      inputRef.current.focus();
    }
  }, [inputMode, inputRef, pair?.id]);

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
      setOptimizeError('请先在设置中配置 AI API Key');
      return;
    }
    setLoadingOptimize(true);
    setOptimizeError(null);
    try {
      const optimized = await optimizeTranslationForBacktranslation(aiProvider, pair.japanese, pair.chinese);
      updatePairChinese(pair.id, optimized);
    } catch (e) {
      setOptimizeError(e instanceof Error ? e.message : '优化译文失败');
    } finally {
      setLoadingOptimize(false);
    }
  };

  const handleGetHint = async () => {
    if (!pair || !aiProvider.apiKey) {
      setHintError('请先在设置中配置 AI API Key');
      return;
    }
    setLoadingHint(true);
    setHintError(null);
    try {
      const text = await generateBacktranslateHints(aiProvider, pair.japanese, pair.chinese);
      setHint(pair.id + '_hint', text);
    } catch (e) {
      setHintError(e instanceof Error ? e.message : '获取提示失败');
    } finally {
      setLoadingHint(false);
    }
  };

  if (!pair) {
    return null;
  }

  return (
    <aside
      className="reader-practice-panel animate-fade-in"
      style={{
        width: '24rem',
        borderLeft: '1px solid var(--border-light)',
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
      <div className="reader-practice-panel-content p-5 space-y-5">
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
              onClick={() => {
                setEditText(pair.chinese);
                setEditing(true);
              }}
              className="text-xs opacity-40 hover:opacity-80 transition-opacity"
              style={{ fontFamily: 'var(--font-ui)', color: 'var(--ink-muted)' }}
            >
              编辑
            </button>
          </div>

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
            <p
              className="text-reading"
              style={{
                fontSize: '0.9em',
                opacity: hasChinese ? 0.7 : 0.48,
                fontStyle: hasChinese ? 'normal' : 'italic',
              }}
            >
              {hasChinese ? pair.chinese : '暂无译文'}
            </p>
          )}
        </div>

        {/* 回译辅助 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="tag">回译辅助</span>
            <div className="flex gap-2">
              <button
                onClick={handleOptimizeTranslation}
                disabled={loadingOptimize}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-all"
                style={{
                  fontFamily: 'var(--font-ui)',
                  backgroundColor: 'var(--accent-subtle)',
                  color: 'var(--accent-secondary)',
                  opacity: loadingOptimize ? 0.5 : 1,
                  border: '1px solid var(--border-light)',
                }}
              >
                {loadingOptimize ? (
                  <>
                    <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  </>
                ) : (
                  <FiZap size={11} />
                )}
                优化译文
              </button>
              <button
                onClick={handleGetHint}
                disabled={loadingHint}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-all"
                style={{
                  fontFamily: 'var(--font-ui)',
                  backgroundColor: 'var(--accent-subtle)',
                  color: 'var(--accent-primary)',
                  opacity: loadingHint ? 0.5 : 1,
                  border: '1px solid var(--border-light)',
                }}
              >
                {loadingHint ? (
                  <>
                    <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  </>
                ) : (
                  <FiHelpCircle size={11} />
                )}
                获取提示
              </button>
            </div>
          </div>

          {optimizeError && (
            <p className="text-xs mb-2" style={{ color: 'var(--error-color)' }}>
              {optimizeError}
            </p>
          )}

          {hintError && (
            <p className="text-xs mb-2" style={{ color: 'var(--error-color)' }}>
              {hintError}
            </p>
          )}

          {hint && (
            <div
              className="p-3 rounded text-sm space-y-2"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                fontFamily: 'var(--font-body)',
                color: 'var(--ink-secondary)',
                lineHeight: '1.6',
              }}
            >
              <p className="text-xs opacity-50" style={{ fontFamily: 'var(--font-ui)' }}>
                回译提示
              </p>
              {hint.split('\n').filter(Boolean).map((line, i) => {
                if (line.startsWith('【') && line.includes('】')) {
                  const match = line.match(/^(【[^】]+】)(.*)$/);
                  if (match) {
                    return (
                      <p key={i}>
                        <strong style={{ color: 'var(--accent-primary)' }}>{match[1]}</strong>
                        {match[2]}
                      </p>
                    );
                  }
                }
                return <p key={i}>{line}</p>;
              })}
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

        {/* Analysis result */}
        {analysis && <AnalysisPanel result={analysis} />}
      </div>

      <div
        className="reader-practice-panel-composer px-5 py-4 space-y-3"
        style={{
          borderTop: '1px solid var(--border-light)',
        }}
      >
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

        <div className="flex justify-between items-center gap-3">
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
      </div>
    </aside>
  );
}
