export interface MarkupBookmark {
  startOffset: number;
  endOffset: number;
  colorId: string;
}

export interface MarkupColor {
  id: string;
  bg: string;
  border: string;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Subtitle and note text is untrusted. Escape it before it reaches
 * `dangerouslySetInnerHTML`; only the `<mark>` wrapper we build may be HTML.
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

export function bookmarkedHtml(
  japanese: string,
  bookmarks: readonly MarkupBookmark[],
  colors: readonly MarkupColor[]
): string {
  const sorted = [...bookmarks].sort((a, b) => b.endOffset - a.endOffset);
  const escaped = escapeHtml(japanese);
  let html = escaped;

  // Offsets refer to the raw text; escaping can change their length. Convert
  // each boundary by escaping the prefix, so marks still land on the right
  // characters while generated markup from later marks is left untouched.
  const escapedOffset = (offset: number) =>
    escapeHtml(japanese.slice(0, offset)).length;

  for (const bookmark of sorted) {
    const color = colors.find((item) => item.id === bookmark.colorId);
    const start = escapedOffset(bookmark.startOffset);
    const end = escapedOffset(bookmark.endOffset);
    const before = html.slice(0, start);
    const marked = html.slice(start, end);
    const after = html.slice(end);
    html = `${before}<mark style="background-color: ${
      color?.bg || 'transparent'
    }; border-bottom: 2px solid ${
      color?.border || 'transparent'
    };">${marked}</mark>${after}`;
  }

  return html;
}
