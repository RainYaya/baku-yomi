import { useState, useCallback, useEffect, useRef } from 'react';
import type { SentencePair as SentencePairType } from '../../types';
import { usePracticeStore } from '../../stores/practiceSlice';
import { useSettingsStore } from '../../stores/settingsSlice';
import { useAnalysis } from '../../hooks/useAnalysis';
import { AnalysisPanel } from '../analysis/AnalysisPanel';
import { HiOutlineEye, HiOutlinePaperAirplane } from 'react-icons/hi2';

interface Props {
  pair: SentencePairType;
}

export function SentencePair({ pair }: Props) {
  const blindMode = useSettingsStore((s) => s.blindMode);
  const translation = usePracticeStore((s) => s.translations[pair.id] ?? '');
  const analysis = usePracticeStore((s) => s.analyses[pair.id]);
  const setTranslation = usePracticeStore((s) => s.setTranslation);
  const { analyze, analyzingPairId } = useAnalysis();
  const [error, setError] = useState<string | null>(null);
  const [peeking, setPeeking] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout>>();
  const isAnalyzing = analyzingPairId === pair.id;

  useEffect(() => {
    return () => {
      if (peekTimer.current) clearTimeout(peekTimer.current);
    };
  }, []);

  const handlePeek = useCallback(() => {
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

  return (
    <div className="border border-gray-200 rounded-xl p-5 space-y-3 bg-white shadow-sm">
      {/* Japanese original */}
      <div className="flex items-start gap-2">
        <span className="text-xs font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0">
          日
        </span>
        {showJapanese ? (
          <p className="text-gray-800 leading-relaxed">{pair.japanese}</p>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm italic">盲模式已隐藏</span>
            <button
              onClick={handlePeek}
              className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1"
            >
              <HiOutlineEye size={14} />
              偷看3秒
            </button>
          </div>
        )}
      </div>

      {/* Chinese translation */}
      <div className="flex items-start gap-2">
        <span className="text-xs font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0">
          中
        </span>
        <p className="text-gray-800 leading-relaxed">{pair.chinese}</p>
      </div>

      {/* User translation input */}
      <div className="pt-2">
        <textarea
          value={translation}
          onChange={(e) => setTranslation(pair.id, e.target.value)}
          placeholder="在此输入你的日语回译..."
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 resize-none"
        />
        <div className="flex justify-between items-center mt-2">
          <div>
            {error && (
              <span className="text-xs text-red-500">{error}</span>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={isAnalyzing || !translation.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isAnalyzing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
    </div>
  );
}
