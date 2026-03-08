export interface ExtractedSentence {
  text: string;
  html?: string; // HTML with ruby tags preserved, only set when ruby exists
}

/**
 * Extract text segments from chapter HTML content.
 * Strips <rt>/<rp> from plain text but preserves ruby HTML for furigana display.
 */
export function extractSentences(html: string): ExtractedSentence[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const sentences: ExtractedSentence[] = [];

  const blocks = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, li');

  for (const block of blocks) {
    if (block.querySelector('p, div')) continue;

    const text = getTextWithoutRuby(block);
    if (text.length === 0) continue;

    const rubyHtml = block.querySelector('ruby')
      ? sanitizeRubyHtml(block.innerHTML)
      : undefined;

    sentences.push({ text, html: rubyHtml });
  }

  if (sentences.length === 0) {
    const clone = doc.body.cloneNode(true) as HTMLElement;
    for (const rt of clone.querySelectorAll('rt, rp')) rt.remove();
    const body = clone.textContent ?? '';
    const lines = body.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      sentences.push({ text: line });
    }
  }

  return sentences;
}

function getTextWithoutRuby(el: Element): string {
  const clone = el.cloneNode(true) as HTMLElement;
  for (const rt of clone.querySelectorAll('rt, rp')) {
    rt.remove();
  }
  return clone.textContent?.trim() ?? '';
}

function sanitizeRubyHtml(html: string): string {
  return html
    .replace(/<(\/?)ruby([^>]*)>/gi, '\x01$1ruby$2\x02')
    .replace(/<(\/?)rt([^>]*)>/gi, '\x01$1rt$2\x02')
    .replace(/<(\/?)rp([^>]*)>/gi, '\x01$1rp$2\x02')
    .replace(/<[^>]+>/g, '')
    .replace(/\x01/g, '<')
    .replace(/\x02/g, '>');
}
