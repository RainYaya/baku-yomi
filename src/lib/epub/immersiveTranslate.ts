import type { SentencePair } from '../../types';

/**
 * Get text content from an element, excluding <rt> (ruby annotation) content.
 * <ruby>漢字<rt>かんじ</rt></ruby> → "漢字" instead of "漢字かんじ"
 */
function getTextWithoutRuby(el: Element | HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  for (const rt of clone.querySelectorAll('rt, rp')) {
    rt.remove();
  }
  return clone.textContent?.trim() ?? '';
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

    // Extract Japanese: clone the block, remove the translate wrapper, get text without ruby
    const clone = block.cloneNode(true) as HTMLElement;
    const cloneWrapper = clone.querySelector(
      '[class*="immersive-translate-target-wrapper"]'
    );
    cloneWrapper?.remove();
    const japanese = getTextWithoutRuby(clone);
    if (!japanese) continue;

    pairs.push({
      id: `ch${chapterIndex}-p${pairIndex}`,
      japanese,
      chinese,
      chapterIndex,
      pairIndex,
    });
    pairIndex++;
  }

  return pairs.length > 0 ? pairs : null;
}
