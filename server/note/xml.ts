const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decode the entities that appear in RSS and article HTML. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const hex = code[1]?.toLowerCase() === 'x';
      const parsed = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(parsed)) return match;
      try {
        return String.fromCodePoint(parsed);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Strip markup from an RSS description and collapse it to one line. */
export function stripTags(html: string): string {
  const withoutMarkup = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|section|article|tr|td|th)>/gi, ' ')
    .replace(/<[^>]+>/g, '');

  return decodeEntities(withoutMarkup).replace(/\s+/g, ' ').trim();
}

/**
 * Return the inner HTML of the first element with `id`, following nested
 * elements of the same tag instead of stopping at the first closing tag.
 */
export function innerById(html: string, id: string): string | null {
  const open = html.match(
    new RegExp(`<([a-z][a-z0-9:-]*)\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i')
  );
  return open ? innerOfElement(html, open) : null;
}

/** Same as `innerById`, for the first element with the given tag name. */
export function innerByTag(html: string, tag: string): string | null {
  const open = html.match(new RegExp(`(${tag})\\b[^>]*>`, 'i'));
  return open ? innerOfElement(html, open) : null;
}

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function innerOfElement(html: string, open: RegExpMatchArray): string {
  if (open.index === undefined) return '';
  const tag = open[1].toLowerCase();
  const start = open.index + open[0].length;
  const closeOrOpen = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  closeOrOpen.lastIndex = start;

  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = closeOrOpen.exec(html))) {
    if (VOID_TAGS.has(tag) || /\/>\s*$/.test(match[0])) continue;
    depth += match[1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index);
  }

  return html.slice(start);
}
