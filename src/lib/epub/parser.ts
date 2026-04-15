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

/** Try to find a cover image URL from loaded spine HTML */
function extractCoverFromSpineHtml(
  epub: EpubFile,
  spine: { id: string; href: string }[],
  spineHtml: Map<string, string>,
): string | undefined {
  // Check if manifest declares a cover-image
  const manifest = epub.getManifest?.() ?? {};
  let hasCoverInManifest = false;
  for (const item of Object.values(manifest) as { properties?: string; mediaType?: string }[]) {
    if (item.properties?.includes('cover-image') && item.mediaType?.startsWith('image/')) {
      hasCoverInManifest = true;
      break;
    }
  }

  // Look at first 2 spine items for an <img> or <image> (cover pages are first)
  const candidates = spine.slice(0, hasCoverInManifest ? 3 : 1);
  for (const item of candidates) {
    const html = spineHtml.get(item.id);
    if (!html) continue;

    // Match <img src="..."> or <image ... href="..."> (SVG wrapped covers)
    const imgMatch = html.match(
      /(?:<img[^>]+src=["']([^"']+)["'])|(?:<image[^>]+(?:href|xlink:href)=["']([^"']+)["'])/i
    );
    const url = imgMatch?.[1] ?? imgMatch?.[2];
    if (url) return url;
  }

  return undefined;
}

export async function parseEpubFile(file: File): Promise<Book> {
  const epub: EpubFile = await initEpubFile(file);

  const metadata = epub.getMetadata?.() ?? epub.metadata ?? {};
  const title = extractText(metadata.title) ?? file.name.replace(/\.epub$/i, '');
  const author = extractCreator(metadata.creator) ?? 'Unknown';
  const description = extractText(metadata.description) ?? undefined;
  const publisher = extractText(metadata.publisher) ?? undefined;
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

  // Extract cover from loaded HTML (blob URLs in browser, file paths in Node)
  let coverUrl: string | undefined;
  try {
    const rawCoverUrl = extractCoverFromSpineHtml(epub, spine, spineHtml);
    if (rawCoverUrl) {
      // Convert blob URL to data URL so it survives localStorage persistence
      if (rawCoverUrl.startsWith('blob:')) {
        const resp = await fetch(rawCoverUrl);
        const blob = await resp.blob();
        coverUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } else if (rawCoverUrl.startsWith('data:')) {
        coverUrl = rawCoverUrl;
      }
    }
  } catch {
    // best-effort
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
    description,
    publisher,
    coverUrl,
    chapters,
    importedAt: Date.now(),
  };
}
