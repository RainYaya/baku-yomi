import { useMemo, useState } from 'react';
import type { SentenceUnit } from '../../types';

/**
 * Renders the source sentence with each anchored syntactic unit highlighted
 * and labelled.
 *
 * The units are contiguous and non-overlapping by construction (see
 * `anchor.ts`), so this can walk the string once instead of doing interval
 * maths. Anything the model failed to cover is rendered as plain text — the
 * gaps are informative, not a bug.
 *
 * Hovering a unit explains it inline; tapping works too, which matters on the
 * tablet-sized layouts this reader targets.
 */

interface Props {
  sentence: string;
  units: SentenceUnit[];
  /** Called when a unit is picked, so the panel can scroll to its detail. */
  onFocusUnit?: (index: number) => void;
}

export function SentenceUnitText({ sentence, units, onFocusUnit }: Props) {
  const [active, setActive] = useState<number | null>(null);

  const segments = useMemo(() => {
    const parts: Array<
      | { kind: 'plain'; text: string }
      | { kind: 'unit'; text: string; index: number; unit: SentenceUnit }
    > = [];

    let cursor = 0;
    units.forEach((unit, index) => {
      if (unit.start > cursor) {
        parts.push({ kind: 'plain', text: sentence.slice(cursor, unit.start) });
      }
      parts.push({ kind: 'unit', text: sentence.slice(unit.start, unit.end), index, unit });
      cursor = unit.end;
    });
    if (cursor < sentence.length) {
      parts.push({ kind: 'plain', text: sentence.slice(cursor) });
    }

    return parts;
  }, [sentence, units]);

  const activeUnit = active !== null ? units[active] : null;

  return (
    <div className="space-y-3">
      <p className="text-reading" style={{ lineHeight: '2.4' }}>
        {segments.map((segment, i) =>
          segment.kind === 'plain' ? (
            <span key={i}>{segment.text}</span>
          ) : (
            <span
              key={i}
              role="button"
              tabIndex={0}
              className={`unit-chip ${active === segment.index ? 'unit-chip-active' : ''}`}
              data-unit-role={segment.unit.role}
              onMouseEnter={() => setActive(segment.index)}
              onMouseLeave={() => setActive((current) => (current === segment.index ? null : current))}
              onFocus={() => setActive(segment.index)}
              onClick={() => {
                setActive(segment.index);
                onFocusUnit?.(segment.index);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActive(segment.index);
                  onFocusUnit?.(segment.index);
                }
              }}
            >
              {segment.text}
              <span className="unit-chip-label">{segment.unit.role}</span>
            </span>
          )
        )}
      </p>

      {activeUnit && (
        <div
          className="rounded p-3 text-sm space-y-1 animate-fade-in"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-light)',
            fontFamily: 'var(--font-body)',
          }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: 'var(--accent-subtle)',
                color: 'var(--accent-secondary)',
                fontFamily: 'var(--font-ui)',
              }}
            >
              {activeUnit.pos}
            </span>
            <span
              className="text-xs"
              style={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-ui)' }}
            >
              {activeUnit.role}
            </span>
          </div>
          <p style={{ color: 'var(--ink-secondary)', lineHeight: '1.7' }}>
            {activeUnit.meaning}
          </p>
        </div>
      )}
    </div>
  );
}
