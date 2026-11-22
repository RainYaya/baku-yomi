import { scoreOf } from '../../lib/analysis/score';
import type { PracticeAttempt } from '../../lib/practice/journal';

interface Props {
  attempts: PracticeAttempt[];
}

/** One line per submission: number, score, translation, date. */
export function PracticeAttemptHistory({ attempts }: Props) {
  if (attempts.length === 0) return null;

  return (
    <section className="attempt-history">
      <h3>练习历史 · {attempts.length} 次</h3>
      <ol>
        {attempts.map((attempt, index) => {
          const score = scoreOf(attempt.analysis);
          return (
            <li key={`${attempt.at}-${index}`} className="attempt-row">
              <span className="attempt-index">第 {index + 1} 次</span>
              <span
                className="attempt-score"
                data-band={score < 70 ? 'weak' : score < 85 ? 'mid' : 'good'}
              >
                {score}
              </span>
              <span className="attempt-text">
                {attempt.translation || '（没有写下回译）'}
              </span>
              <span className="attempt-time">
                {attempt.at
                  ? new Date(attempt.at).toLocaleDateString('zh-CN')
                  : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
