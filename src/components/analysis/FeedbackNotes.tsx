import type { AnalysisResult } from '../../types';

interface Note {
  category: string;
  summary: string;
  userText?: string;
  originalText?: string;
  analysis?: string;
}

interface Section {
  title: string;
  body: string;
}

function splitSections(markdown: string): Section[] {
  const marks: { title: string; start: number; end: number }[] = [];
  const re = /【([^】]+)】/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown))) {
    marks.push({ title: match[1], start: match.index, end: re.lastIndex });
  }

  return marks.map((mark, index) => ({
    title: mark.title,
    body: markdown
      .slice(mark.end, index + 1 < marks.length ? marks[index + 1].start : undefined)
      .trim(),
  }));
}

function stripMarkdown(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .trim();
}

function field(lines: string[], label: RegExp): string | undefined {
  const line = lines.find((item) => label.test(item));
  if (!line) return undefined;
  const cleaned = stripMarkdown(line.replace(/^[-·•]\s*/, ''));
  const value = cleaned.replace(/^[^:：]{1,14}[:：]\s*/, '').trim();
  return value || undefined;
}

/**
 * The keyless providers answer in whichever language the prompt suggests, so
 * the model sometimes returns 回訳文/【総合評価】 instead of 回译文/【综合评分】.
 * Parse the body, not the exact heading.
 */
function parseNotes(result: AnalysisResult): Note[] {
  if (result.errors.length > 0) {
    return result.errors.map((error) => ({
      category: error.category,
      summary: '',
      userText: error.userText,
      originalText: error.correctText,
      analysis: error.explanation,
    }));
  }

  return result.rawMarkdown
    .split(/^####\s*/m)
    .slice(1)
    .map((chunk) => {
      const lines = chunk.split('\n');
      const head = lines.shift() ?? '';
      const match = head.match(/^\d+\.\s*([^：:]+)[：:]\s*(.*)$/);
      return {
        category: match?.[1]?.trim() || '批注',
        summary: stripMarkdown(match?.[2] ?? ''),
        userText: field(lines, /回訳文|回译文|訳文|你的回译/),
        originalText: field(lines, /原文/),
        analysis: field(lines, /分析|解説|説明/),
      };
    })
    .filter((note) => note.summary || note.analysis || note.userText);
}

function parseList(markdown: string, titles: RegExp[]): string[] {
  const section = splitSections(markdown).find((item) =>
    titles.some((title) => title.test(item.title))
  );
  if (!section) return [];

  return section.body
    .split('\n')
    .map((line) => stripMarkdown(line.replace(/^[-·•]\s*/, '')))
    .filter((line) => line.length > 0 && !line.startsWith('####'));
}

/** A score that also works for analyses stored before the score regex was widened. */
export function scoreOf(result: AnalysisResult): number {
  if (result.score > 0) return result.score;

  const match =
    result.rawMarkdown.match(/【[^】]*(?:评分|評価)[^】]*】\s*(\d{1,3})/) ??
    result.rawMarkdown.match(/(\d{1,3})\s*\/\s*100/);
  if (!match) return 0;

  const score = Number(match[1]);
  return Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0;
}

interface Props {
  result: AnalysisResult;
  /** The desk uses the larger numbered note list. */
  variant?: 'inline' | 'desk';
}

/**
 * The analysis markdown, rendered as the artboard's numbered margin notes
 * instead of a generic markdown dump.
 */
export function FeedbackNotes({ result, variant = 'inline' }: Props) {
  const notes = parseNotes(result);
  const strengths = parseList(result.rawMarkdown, [/优点|長所|良い点|强项|強み/]);
  const suggestions = parseList(result.rawMarkdown, [
    /建议|提案|アドバイス|改善|下一步/,
  ]);

  if (notes.length === 0 && strengths.length === 0 && suggestions.length === 0) {
    return <p className="feedback-empty">这一句没有需要修改的地方。</p>;
  }

  const listClass = variant === 'desk' ? 'd2-notes' : 'feedback-list';

  return (
    <div className="feedback-notes">
      {notes.length > 0 && (
        <ul className={listClass}>
          {notes.map((note, index) => (
            <li key={index}>
              {variant === 'desk' && (
                <span className="d2-note-num">{String(index + 1).padStart(2, '0')}</span>
              )}
              <p>
                <b>{note.category}</b>
                {note.summary ? ` · ${note.summary}` : ''}
                {(note.userText || note.originalText) && (
                  <>
                    {' '}
                    <span className="feedback-diff">
                      {note.userText ? `「${note.userText}」` : ''}
                      {note.userText && note.originalText ? ' → ' : ''}
                      {note.originalText ? `「${note.originalText}」` : ''}
                    </span>
                  </>
                )}
                {note.analysis ? ` ${note.analysis}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}

      {strengths.length > 0 && (
        <div className="feedback-extra">
          <span className="mini-label">做得好的地方</span>
          <ul>
            {strengths.slice(0, 4).map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="feedback-extra">
          <span className="mini-label">下一步</span>
          <ul>
            {suggestions.slice(0, 3).map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
