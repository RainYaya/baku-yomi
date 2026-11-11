import { useMemo } from 'react';

/**
 * A deliberately small markdown renderer for model output.
 *
 * The reader only ever renders text this app asked a model to produce, and
 * the prompts constrain the shape to headings, short paragraphs, bold spans,
 * inline code and simple lists. Pulling in a full markdown library for that
 * would add a dependency and an HTML-injection surface for no benefit — this
 * builds React nodes directly and never touches `dangerouslySetInnerHTML`.
 *
 * Anything it does not recognise is shown as literal text, which is the right
 * failure mode: the user sees the model's raw characters instead of losing
 * them.
 */

interface Props {
  text: string;
  className?: string;
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; text: string };

export function parseBlocks(source: string): Block[] {
  const lines = source.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }

    // ATX heading
    const heading = /^(#{1,6})\s+(.*)$/u.exec(trimmed);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/u.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/u.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/u, ''));
        i += 1;
      }
      blocks.push({ kind: 'list', ordered: false, items });
      continue;
    }

    // Ordered list
    if (/^\d+[.)]\s+/u.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/u.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/u, ''));
        i += 1;
      }
      blocks.push({ kind: 'list', ordered: true, items });
      continue;
    }

    // Paragraph: consume until a blank line or another block starts.
    const paragraph: string[] = [];
    while (i < lines.length) {
      const current = lines[i].trim();
      if (
        !current ||
        current.startsWith('#') ||
        current.startsWith('```') ||
        /^[-*+]\s+/u.test(current) ||
        /^\d+[.)]\s+/u.test(current)
      ) {
        break;
      }
      paragraph.push(current);
      i += 1;
    }

    // A streaming answer can end mid-marker: "###", "-" or "1." with no text
    // yet. Those look like a block start but are not one, so the loop above
    // breaks without consuming anything. Take the line literally to guarantee
    // progress instead of spinning forever.
    if (paragraph.length === 0) {
      paragraph.push(trimmed);
      i += 1;
    }

    blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
}

/** Inline formatting: **bold**, `code`, and nothing else. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/gu;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${key++}`} style={{ color: 'var(--ink-primary)', fontWeight: 600 }}>
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${key++}`}
          style={{
            fontFamily: 'var(--font-body)',
            backgroundColor: 'var(--accent-subtle)',
            color: 'var(--accent-secondary)',
            padding: '0 0.25em',
            borderRadius: '3px',
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function MarkdownBlock({ text, className }: Props) {
  const blocks = useMemo(() => parseBlocks(text), [text]);

  return (
    <div className={className} style={{ fontFamily: 'var(--font-body)' }}>
      {blocks.map((block, index) => {
        const key = `b-${index}`;

        if (block.kind === 'heading') {
          const size = block.level <= 2 ? '0.95em' : '0.9em';
          return (
            <h4
              key={key}
              className="font-medium"
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: size,
                color: 'var(--accent-primary)',
                marginTop: index === 0 ? 0 : '1.1em',
                marginBottom: '0.45em',
                letterSpacing: '0.02em',
              }}
            >
              {renderInline(block.text, key)}
            </h4>
          );
        }

        if (block.kind === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag
              key={key}
              style={{
                margin: '0.35em 0 0.75em',
                paddingLeft: '1.25em',
                listStyleType: block.ordered ? 'decimal' : 'disc',
                color: 'var(--ink-secondary)',
                lineHeight: '1.75',
              }}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`} style={{ marginBottom: '0.25em' }}>
                  {renderInline(item, `${key}-${itemIndex}`)}
                </li>
              ))}
            </ListTag>
          );
        }

        if (block.kind === 'code') {
          return (
            <pre
              key={key}
              style={{
                margin: '0.5em 0 0.75em',
                padding: '0.6em 0.75em',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-light)',
                borderRadius: '4px',
                overflowX: 'auto',
                fontSize: '0.9em',
              }}
            >
              <code>{block.text}</code>
            </pre>
          );
        }

        return (
          <p
            key={key}
            style={{
              margin: '0 0 0.7em',
              color: 'var(--ink-secondary)',
              lineHeight: '1.8',
            }}
          >
            {renderInline(block.text, key)}
          </p>
        );
      })}
    </div>
  );
}
