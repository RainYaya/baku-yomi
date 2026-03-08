import type { SentencePair } from '../../types';

/**
 * Get text content from an element, excluding <rt>/<rp> ruby annotations.
 * <ruby>漢字<rt>かんじ</rt></ruby> → "漢字"
 */
function getTextWithoutRuby(el: Element | HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  for (const rt of clone.querySelectorAll('rt, rp')) {
    rt.remove();
  }
  return clone.textContent?.trim() ?? '';
}

/**
 * Get innerHTML preserving only ruby-related tags, stripping everything else.
 * Returns sanitized HTML suitable for dangerouslySetInnerHTML.
 */
function getHtmlWithRuby(el: Element | HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  // Check if there are any ruby elements worth preserving
  if (!clone.querySelector('ruby')) {
    return '';
  }
  return sanitizeRubyHtml(clone.innerHTML);
}

/** Keep only ruby/rt/rp tags, strip all other HTML tags */
function sanitizeRubyHtml(html: string): string {
  // Replace allowed tags with placeholders, strip the rest, restore
  return html
    .replace(/<(\/?)ruby([^>]*)>/gi, '\x01$1ruby$2\x02')
    .replace(/<(\/?)rt([^>]*)>/gi, '\x01$1rt$2\x02')
    .replace(/<(\/?)rp([^>]*)>/gi, '\x01$1rp$2\x02')
    .replace(/<[^>]+>/g, '')
    .replace(/\x01/g, '<')
    .replace(/\x02/g, '>');
}

/**
 * Try to extract pairs from Immersive Translate format.
 * Pattern: <p>Japanese text<span class="...immersive-translate-target-wrapper...">
 *            <span class="...immersive-translate-target-inner...">Chinese text</span>
 *          </span></p>
 *
 * Returns pairs if detected, or null if this format is not present.
 */
export function extractImmersiveTranslatePairs(
  html: string,
  chapterIndex: number
): SentencePair[] | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Check if this HTML uses immersive translate format
  const translateSpans = doc.querySelectorAll(
    '[class*="immersive-translate-target-wrapper"]'
  );
  if (translateSpans.length === 0) return null;

  const pairs: SentencePair[] = [];
  let pairIndex = 0;

  // Find all block elements that contain translate spans
  const blocks = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');

  for (const block of blocks) {
    const wrapper = block.querySelector(
      '[class*="immersive-translate-target-wrapper"]'
    );
    if (!wrapper) continue;

    // Extract Chinese from the inner translation span
    const innerSpan = wrapper.querySelector(
      '[class*="immersive-translate-target-inner"]'
    );
    const chinese = innerSpan?.textContent?.trim();
    if (!chinese) continue;

    // Extract Japanese: clone the block, remove the translate wrapper
    const clone = block.cloneNode(true) as HTMLElement;
    const cloneWrapper = clone.querySelector(
      '[class*="immersive-translate-target-wrapper"]'
    );
    cloneWrapper?.remove();

    const japanese = getTextWithoutRuby(clone);
    if (!japanese) continue;

    const japaneseHtml = getHtmlWithRuby(clone) || undefined;

    pairs.push({
      id: `ch${chapterIndex}-p${pairIndex}`,
      japanese,
      japaneseHtml,
      chinese,
      chapterIndex,
      pairIndex,
    });
    pairIndex++;
  }

  return pairs.length > 0 ? pairs : null;
}
