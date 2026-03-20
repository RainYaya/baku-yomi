import { useState, useCallback } from 'react';
import { usePracticeStore } from '../../stores/practiceSlice';
import { useSettingsStore } from '../../stores/settingsSlice';
import { generateHints } from '../../lib/ai/client';
import { FiZap, FiEye } from 'react-icons/fi';

interface Props {
  pairId: string;
  japanese: string;
  chinese: string;
  showReveal?: boolean;
  onReveal?: () => void;
}

export function HintPanel({ pairId, japanese, chinese, showReveal, onReveal }: Props) {
  const hint = usePracticeStore((s) => s.hints[pairId]);
  const setHint = usePracticeStore((s) => s.setHint);
  const hintLoadingId = usePracticeStore((s) => s.hintLoadingId);
  const setHintLoading = usePracticeStore((s) => s.setHintLoading);
  const aiProvider = useSettingsStore((s) => s.aiProvider);

  const [error, setError] = useState<string | null>(null);
  const isLoading = hintLoadingId === pairId;

  const handleGenerate = useCallback(async () => {
    if (!aiProvider.apiKey) {
      setError('请先在设置中配置 AI API Key');
      return;
    }

    setError(null);
    setHintLoading(pairId);
    try {
      const text = await generateHints(aiProvider, japanese, chinese);
      setHint(pairId, text);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成提示失败');
      setHintLoading(null);
    }
  }, [pairId, japanese, chinese, aiProvider, setHint, setHintLoading]);

  const revealBtn = showReveal && onReveal && (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onReveal();
      }}
      className="text-xs opacity-40 hover:opacity-80 transition-opacity flex items-center gap-1"
      style={{ fontFamily: 'var(--font-ui)' }}
    >
      <FiEye size={12} />
      查看译文
    </button>
  );

  // Already have cached hints
  if (hint) {
    return (
      <div className="space-y-2">
        <div className="space-y-1.5">
          {hint.split('\n').filter(Boolean).map((line, i) => (
            <div
              key={i}
              className="flex items-start gap-2"
              style={{
                fontFamily: 'var(--font-body)',
                color: 'var(--ink-secondary)',
                fontSize: '0.9em',
              }}
            >
              <FiZap
                className="flex-shrink-0 mt-0.5"
                size={13}
                style={{ color: 'var(--accent-secondary)' }}
              />
              <span>{line}</span>
            </div>
          ))}
        </div>
        {revealBtn}
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div
        className="flex items-center gap-2 text-sm"
        style={{ opacity: 0.6, color: 'var(--ink-muted)' }}
      >
        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        <span style={{ fontFamily: 'var(--font-ui)' }}>正在生成提示...</span>
      </div>
    );
  }

  // Not yet generated
  return (
    <div className="space-y-2">
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleGenerate();
        }}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded transition-all"
        style={{
          fontFamily: 'var(--font-ui)',
          color: 'var(--accent-secondary)',
          backgroundColor: 'rgba(124, 106, 173, 0.08)',
          border: '1px solid rgba(124, 106, 173, 0.15)',
          opacity: 0.8,
        }}
      >
        <FiZap size={14} />
        获取 AI 提示
      </button>
      {error && (
        <p
          className="text-xs"
          style={{ color: 'var(--error-color)' }}
        >
          {error}
        </p>
      )}
      {revealBtn}
    </div>
  );
}
