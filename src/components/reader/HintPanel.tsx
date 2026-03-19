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

  // Already have cached hints
  if (hint) {
    return (
      <div className="space-y-1.5">
        <div className="space-y-1">
          {hint.split('\n').filter(Boolean).map((line, i) => (
            <div key={i} className="flex items-start gap-1.5 text-sm">
              <HiOutlineLightBulb className="text-violet-500 mt-0.5 flex-shrink-0" size={14} />
              <span className="text-gray-700">{line}</span>
            </div>
          ))}
        </div>
        {showReveal && onReveal && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReveal();
            }}
            className="text-xs text-violet-500 hover:text-violet-700"
          >
            查看原文
          </button>
        )}
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-violet-500">
        <div className="w-3.5 h-3.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
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
        className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors"
      >
        <HiOutlineLightBulb size={14} />
        获取 AI 提示
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {showReveal && onReveal && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReveal();
          }}
          className="text-xs text-violet-500 hover:text-violet-700"
        >
          查看原文
        </button>
      )}
    </div>
  );
}
