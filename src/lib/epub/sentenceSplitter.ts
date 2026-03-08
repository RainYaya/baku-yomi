/**
 * Extract text segments from chapter HTML content.
 * Splits on <p> tags and other block elements.
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

    const text = block.textContent?.trim();
    if (text && text.length > 0) {
      sentences.push(text);
    }
  }

  // If no block elements found, try splitting by newlines
  if (sentences.length === 0) {
    const body = doc.body.textContent ?? '';
    const lines = body.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    sentences.push(...lines);
  }

  return sentences;
}
