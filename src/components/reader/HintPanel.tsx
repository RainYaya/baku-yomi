import { useCallback, useState } from 'react';
import { usePracticeStore } from '../../stores/practiceSlice';
import { useSettingsStore } from '../../stores/settingsSlice';
import { generateHints } from '../../lib/ai/client';
import { HiOutlineLightBulb } from 'react-icons/hi2';

interface Props {
  pairId: string;
  japanese: string;
  chinese: string;
  onReveal?: () => void;
  showReveal?: boolean;
}

export function HintPanel({ pairId, japanese, chinese, onReveal, showReveal }: Props) {
  const hint = usePracticeStore((s) => s.hints[pairId]);
  const hintLoadingId = usePracticeStore((s) => s.hintLoadingId);
  const setHint = usePracticeStore((s) => s.setHint);
  const setHintLoading = usePracticeStore((s) => s.setHintLoading);
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const [error, setError] = useState<string | null>(null);

  const isLoading = hintLoadingId === pairId;

  const handleGenerate = useCallback(async () => {
    if (!aiProvider.apiKey) {
      setError('请先在设置中配置AI API Key');
      return;
    }
    setError(null);
    setHintLoading(pairId);
    try {
      const result = await generateHints(aiProvider, japanese, chinese);
      setHint(pairId, result);
    } catch (e) {
      setHintLoading(null);
      setError(e instanceof Error ? e.message : '提示生成失败');
    }
  }, [aiProvider, japanese, chinese, pairId, setHint, setHintLoading]);

  const revealBtn = showReveal && onReveal && (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onReveal();
      }}
      className="text-xs opacity-50 hover:opacity-100 transition-opacity"
    >
      查看原文
    </button>
  );

  // Already have cached hints
  if (hint) {
    return (
      <div className="space-y-1.5">
        <div className="space-y-1">
          {hint.split('\n').filter(Boolean).map((line, i) => (
            <div key={i} className="flex items-start gap-1.5 text-sm">
              <HiOutlineLightBulb className="mt-0.5 flex-shrink-0 opacity-60" size={14} />
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
      <div className="flex items-center gap-2 text-sm opacity-60">
        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        正在生成提示...
      </div>
    );
  }

  // Not yet generated
  return (
    <div className="space-y-1.5">
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleGenerate();
        }}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-sm transition-opacity opacity-70 hover:opacity-100"
        style={{ border: 'var(--border-style)' }}
      >
        <HiOutlineLightBulb size={14} />
        获取 AI 提示
      </button>
      {error && <p className="text-xs" style={{ color: '#b91c1c' }}>{error}</p>}
      {revealBtn}
    </div>
  );
}
