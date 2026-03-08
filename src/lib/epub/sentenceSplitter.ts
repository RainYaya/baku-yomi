/**
 * Extract text segments from chapter HTML content.
 * Splits on <p> tags and other block elements.
 * Strips <rt>/<rp> ruby annotations so furigana doesn't merge into text.
 */
export function extractSentences(html: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const sentences: string[] = [];

  // Get all block-level text elements
  const blocks = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, li');

  for (const block of blocks) {
    // Skip elements that contain other block elements (avoid duplication)
    if (block.querySelector('p, div')) continue;

    const text = getTextWithoutRuby(block);
    if (text.length > 0) {
      sentences.push(text);
    }
  }

  // If no block elements found, try splitting by newlines
  if (sentences.length === 0) {
    // Strip <rt>/<rp> before extracting text
    const clone = doc.body.cloneNode(true) as HTMLElement;
    for (const rt of clone.querySelectorAll('rt, rp')) rt.remove();
    const body = clone.textContent ?? '';
    const lines = body.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    sentences.push(...lines);
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
