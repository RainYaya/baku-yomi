import type { AnalysisResult } from '../../types';

interface Props {
  result: AnalysisResult;
}

function ScoreBadge({ score }: { score: number }) {
  let color = 'bg-red-100 text-red-700';
  if (score >= 80) color = 'bg-green-100 text-green-700';
  else if (score >= 60) color = 'bg-yellow-100 text-yellow-700';

  return (
    <span className={`text-lg font-bold px-3 py-1 rounded-lg ${color}`}>
      {score}/100
    </span>
  );
}

export function AnalysisPanel({ result }: Props) {
  return (
    <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-600">AI 分析结果</h4>
        <ScoreBadge score={result.score} />
      </div>

      <div className="prose prose-sm max-w-none text-gray-700">
        <MarkdownContent text={result.rawMarkdown} />
      </div>
    </div>
  );
}

function MarkdownContent({ text }: { text: string }) {
  // Simple markdown rendering - split by headers and format
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('【') && line.includes('】')) {
      elements.push(
        <h3 key={i} className="text-base font-bold text-indigo-700 mt-4 mb-2">
          {line}
        </h3>
      );
    } else if (line.startsWith('####')) {
      elements.push(
        <h4 key={i} className="text-sm font-semibold text-gray-700 mt-3 mb-1">
          {line.replace(/^####\s*/, '')}
        </h4>
      );
    } else if (line.startsWith('- **')) {
      const formatted = line.replace(
        /\*\*(.*?)\*\*/g,
        '<strong>$1</strong>'
      );
      elements.push(
        <p
          key={i}
          className="text-sm ml-4 my-0.5"
          dangerouslySetInnerHTML={{ __html: formatted }}
        />
      );
    } else if (line.startsWith('- ')) {
      elements.push(
        <p key={i} className="text-sm ml-4 my-0.5">
          {line}
        </p>
      );
    } else if (line.trim()) {
      elements.push(
        <p key={i} className="text-sm my-1">
          {line}
        </p>
      );
    }
  }

  return <div>{elements}</div>;
}
