import { initEpubFile } from '@lingo-reader/epub-parser';
import type { Book, Chapter } from '../../types';
import { extractSentences } from './sentenceSplitter';
import { buildPairs } from './pairBuilder';
import { extractImmersiveTranslatePairs } from './immersiveTranslate';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EpubFile = any;

interface TocEntry {
  label: unknown;
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

/** Extract pairs from one or more HTML strings combined */
function extractPairsFromHtml(htmlParts: string[], chapterIndex: number) {
  const combined = htmlParts.join('\n');
  return (
    extractImmersiveTranslatePairs(combined, chapterIndex) ??
    buildPairs(extractSentences(combined), chapterIndex)
  );
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

  // Build spine index: id -> position in spine order
  const spineIndex = new Map<string, number>();
  for (let i = 0; i < spine.length; i++) {
    spineIndex.set(spine[i].id, i);
  }

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

  const chapters: Chapter[] = [];

  if (flatToc.length > 0) {
    // Sort TOC entries by their spine position to ensure correct order
    const tocWithSpinePos = flatToc
      .filter((e) => e.id && spineIndex.has(e.id))
      .map((e) => ({ entry: e, spinePos: spineIndex.get(e.id)! }))
      .sort((a, b) => a.spinePos - b.spinePos);

    for (let t = 0; t < tocWithSpinePos.length; t++) {
      const { entry, spinePos: startPos } = tocWithSpinePos[t];
      const nextPos = tocWithSpinePos[t + 1]?.spinePos ?? spine.length;

      // Collect HTML from all spine items between this TOC entry and the next
      const htmlParts: string[] = [];
      for (let s = startPos; s < nextPos; s++) {
        const html = spineHtml.get(spine[s].id);
        if (html) htmlParts.push(html);
      }

      if (htmlParts.length === 0) continue;

      const pairs = extractPairsFromHtml(htmlParts, chapters.length);
      if (pairs.length === 0) continue;

      chapters.push({
        id: `${bookId}-ch${chapters.length}`,
        title: extractText(entry.label) || `第${chapters.length + 1}章`,
        index: chapters.length,
        pairs,
      });
    }
  }

  // Fallback: if TOC produced nothing, fall back to spine-per-chapter
  if (chapters.length === 0) {
    for (const [spineId, html] of spineHtml) {
      const pairs = extractPairsFromHtml([html], chapters.length);
      if (pairs.length === 0) continue;

      const tocEntry = flatToc.find((t) => t.id === spineId);
      chapters.push({
        id: `${bookId}-ch${chapters.length}`,
        title: extractText(tocEntry?.label) || `第${chapters.length + 1}章`,
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
