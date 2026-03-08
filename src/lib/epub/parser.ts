import { initEpubFile } from '@lingo-reader/epub-parser';
import type { Book, Chapter } from '../../types';
import { extractSentences } from './sentenceSplitter';
import { buildPairs } from './pairBuilder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EpubFile = any;

export async function parseEpubFile(file: File): Promise<Book> {
  const epub: EpubFile = await initEpubFile(file);

  const metadata = epub.getMetadata?.() ?? epub.metadata ?? {};
  const title = metadata.title ?? file.name.replace(/\.epub$/i, '');
  const author = metadata.creator ?? 'Unknown';
  const bookId = `book-${Date.now()}`;

  const spine = epub.getSpine?.() ?? epub.spine ?? [];
  const toc = epub.getToc?.() ?? epub.navMap ?? [];
  const chapters: Chapter[] = [];

  for (let i = 0; i < spine.length; i++) {
    const spineItem = spine[i];
    const id = spineItem.id;

    let html = '';
    try {
      const chapter = await epub.loadChapter(id);
      html = chapter?.html ?? '';
    } catch {
      continue;
    }

    if (!html.trim()) continue;

    const sentences = extractSentences(html);
    const pairs = buildPairs(sentences, chapters.length);

    if (pairs.length === 0) continue;

    // Try to find a title from TOC
    const tocEntry = toc.find(
      (t: { content?: string; label?: string }) =>
        t.content && spineItem.href?.includes(t.content)
    );
    const chapterTitle =
      tocEntry?.label ?? `第${chapters.length + 1}章`;

    chapters.push({
      id: `${bookId}-ch${chapters.length}`,
      title: chapterTitle,
      index: chapters.length,
      pairs,
    });
  }

  return {
    id: bookId,
    title,
    author,
    chapters,
    importedAt: Date.now(),
  };
}
