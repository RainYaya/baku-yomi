import { initEpubFile } from '@lingo-reader/epub-parser';
import type { Book, Chapter } from '../../types';
import { extractSentences } from './sentenceSplitter';
import { buildPairs } from './pairBuilder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EpubFile = any;

interface TocEntry {
  label: string;
  href: string;
  id: string;
  children?: TocEntry[];
}

/** Flatten nested TOC into a flat ordered list */
function flattenToc(toc: TocEntry[]): TocEntry[] {
  const result: TocEntry[] = [];
  for (const entry of toc) {
    result.push(entry);
    if (entry.children?.length) {
      result.push(...flattenToc(entry.children));
    }
  }
  return result;
}

/**
 * Split HTML by element IDs (from TOC #fragment anchors).
 * Returns segments of HTML that correspond to each TOC section within the same file.
 */
function splitHtmlByIds(html: string, ids: string[]): Map<string, string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<html><body>${html}</body></html>`,
    'text/html'
  );
  const body = doc.body;
  const result = new Map<string, string>();

  if (ids.length === 0) return result;

  // Find all split-point elements in document order
  const splitPoints: { id: string; element: Element }[] = [];
  for (const id of ids) {
    const el = body.querySelector(`[id="${id}"]`);
    if (el) splitPoints.push({ id, element: el });
  }

  if (splitPoints.length === 0) return result;

  // Collect all top-level children in order
  const allChildren = Array.from(body.children);

  for (let i = 0; i < splitPoints.length; i++) {
    const { id, element } = splitPoints[i];
    const nextElement = splitPoints[i + 1]?.element;

    // Find the top-level ancestor of element within body
    const startAncestor = findTopLevelAncestor(body, element);
    const endAncestor = nextElement
      ? findTopLevelAncestor(body, nextElement)
      : null;

    const startIdx = allChildren.indexOf(startAncestor);
    const endIdx = endAncestor
      ? allChildren.indexOf(endAncestor)
      : allChildren.length;

    if (startIdx === -1) continue;

    const segment = allChildren
      .slice(startIdx, endIdx)
      .map((el) => el.outerHTML)
      .join('');
    result.set(id, segment);
  }

  return result;
}

function findTopLevelAncestor(root: Element, el: Element): Element {
  let current = el;
  while (current.parentElement && current.parentElement !== root) {
    current = current.parentElement;
  }
  return current;
}

/** Safely extract a plain string from metadata values that may be objects like {_, $} */
function extractText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && '_' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)._);
  }
  return String(value);
}

/** Extract creator name from metadata.creator which is an array of {contributor, fileAs, role} */
function extractCreator(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === 'string') return first;
    if (typeof first === 'object' && first !== null) {
      return extractText(first.contributor) ?? extractText(first._) ?? null;
    }
  }
  return extractText(value);
}

export async function parseEpubFile(file: File): Promise<Book> {
  const epub: EpubFile = await initEpubFile(file);

  const metadata = epub.getMetadata?.() ?? epub.metadata ?? {};
  const title = extractText(metadata.title) ?? file.name.replace(/\.epub$/i, '');
  const author = extractCreator(metadata.creator) ?? 'Unknown';
  const bookId = `book-${Date.now()}`;

  const spine: { id: string; href: string }[] =
    epub.getSpine?.() ?? epub.spine ?? [];
  const toc: TocEntry[] = epub.getToc?.() ?? epub.navMap ?? [];
  const flatToc = flattenToc(toc);

  // Pre-load all spine HTML content, keyed by manifest id
  const spineHtml = new Map<string, string>();
  for (const item of spine) {
    try {
      const ch = await epub.loadChapter(item.id);
      if (ch?.html?.trim()) {
        spineHtml.set(item.id, ch.html);
      }
    } catch {
      // skip unloadable items
    }
  }

  // Group TOC entries by their spine id (multiple TOC entries may share one HTML file)
  const tocBySpineId = new Map<string, { label: string; fragment: string }[]>();
  for (const entry of flatToc) {
    const spineId = entry.id;
    if (!spineId) continue;
    const fragment = entry.href?.split('#')[1] ?? '';
    if (!tocBySpineId.has(spineId)) tocBySpineId.set(spineId, []);
    tocBySpineId.get(spineId)!.push({ label: entry.label, fragment });
  }

  const chapters: Chapter[] = [];

  if (flatToc.length > 0) {
    // ---- TOC-driven chapter building ----
    // Process in TOC order so chapters follow the book's actual structure
    const processedSegments = new Set<string>();

    for (const entry of flatToc) {
      const spineId = entry.id;
      if (!spineId) continue;

      const fullHtml = spineHtml.get(spineId);
      if (!fullHtml) continue;

      const fragment = entry.href?.split('#')[1] ?? '';
      const segmentKey = `${spineId}#${fragment}`;
      if (processedSegments.has(segmentKey)) continue;
      processedSegments.add(segmentKey);

      let html = fullHtml;

      // If multiple TOC entries share this spine file, split by fragment
      const siblings = tocBySpineId.get(spineId) ?? [];
      if (siblings.length > 1 && fragment) {
        const fragments = siblings
          .map((s) => s.fragment)
          .filter(Boolean);
        const segments = splitHtmlByIds(fullHtml, fragments);
        html = segments.get(fragment) ?? fullHtml;
      }

      const sentences = extractSentences(html);
      const pairs = buildPairs(sentences, chapters.length);

      if (pairs.length === 0) continue;

      chapters.push({
        id: `${bookId}-ch${chapters.length}`,
        title: entry.label || `第${chapters.length + 1}章`,
        index: chapters.length,
        pairs,
      });
    }
  }

  // Fallback: if TOC produced nothing, fall back to spine-per-chapter
  if (chapters.length === 0) {
    for (const [spineId, html] of spineHtml) {
      const sentences = extractSentences(html);
      const pairs = buildPairs(sentences, chapters.length);
      if (pairs.length === 0) continue;

      // Try to find label from TOC
      const tocEntry = flatToc.find((t) => t.id === spineId);
      chapters.push({
        id: `${bookId}-ch${chapters.length}`,
        title: tocEntry?.label || `第${chapters.length + 1}章`,
        index: chapters.length,
        pairs,
      });
    }
  }

  return {
    id: bookId,
    title,
    author,
    chapters,
    importedAt: Date.now(),
  };
}
