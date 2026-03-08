import { useState } from 'react';
import { useBookStore } from '../../stores/bookSlice';
import { SentencePair } from './SentencePair';
import { EpubUploader } from '../import/EpubUploader';

export function ReadingView() {
  const currentBook = useBookStore((s) => s.getCurrentBook());
  const currentChapter = useBookStore((s) => s.getCurrentChapter());
  const [activePairId, setActivePairId] = useState<string | null>(null);

  if (!currentBook) {
    return <EpubUploader />;
  }

  if (!currentChapter) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        请在左侧选择章节
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800">
          {currentChapter.title}
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          {currentChapter.pairs.length} 个句对 · 点击句子展开回译练习
        </p>
      </div>

      <div className="space-y-1">
        {currentChapter.pairs.map((pair) => (
          <SentencePair
            key={pair.id}
            pair={pair}
            active={activePairId === pair.id}
            onActivate={() =>
              setActivePairId(activePairId === pair.id ? null : pair.id)
            }
          />
        ))}
      </div>
    </div>
  );
}
