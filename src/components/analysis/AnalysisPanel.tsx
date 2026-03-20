import type { AnalysisResult } from '../../types';

interface Props {
  result: AnalysisResult;
}

export function AnalysisPanel({ result }: Props) {
  return (
    <div
      className="mt-5 pt-5 animate-fade-in"
      style={{ borderTop: '1px dashed var(--border-color)' }}
    >
      {/* Score indicator */}
      {result.score > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <span
            className="text-xs"
            style={{
              fontFamily: 'var(--font-ui)',
              color: 'var(--ink-muted)',
              letterSpacing: '0.05em',
            }}
          >
            评分
          </span>
          <div className="flex items-center gap-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full transition-colors"
                style={{
                  backgroundColor:
                    i < Math.round(result.score / 20)
                      ? 'var(--accent-primary)'
                      : 'var(--border-color)',
                }}
              />
            ))}
            <span
              className="text-sm ml-1"
              style={{
                fontFamily: 'var(--font-ui)',
                color: 'var(--ink-secondary)',
                fontWeight: 500,
              }}
            >
              {result.score}/100
            </span>
          </div>
        </div>
      )}

      {/* Raw markdown content */}
      <div
        className="text-reading"
        style={{ color: 'var(--ink-secondary)', fontSize: '0.9em' }}
      >
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
        <h3
          key={i}
          className="text-sm font-medium mt-5 mb-2"
          style={{
            fontFamily: 'var(--font-ui)',
            color: 'var(--accent-primary)',
            letterSpacing: '0.02em',
          }}
        >
          {line}
        </h3>
      );
    } else if (line.startsWith('####')) {
      elements.push(
        <h4
          key={i}
          className="text-sm font-medium mt-4 mb-1.5"
          style={{
            fontFamily: 'var(--font-ui)',
            color: 'var(--ink-secondary)',
          }}
        >
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
          className="text-sm ml-4 my-1"
          dangerouslySetInnerHTML={{ __html: formatted }}
          style={{ fontFamily: 'var(--font-body)' }}
        />
      );
    } else if (line.startsWith('- ')) {
      elements.push(
        <p
          key={i}
          className="text-sm ml-4 my-1"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {line}
        </p>
      );
    } else if (line.trim()) {
      elements.push(
        <p
          key={i}
          className="text-sm my-1.5"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {line}
        </p>
      );
    }
  }

  return <div>{elements}</div>;
}
