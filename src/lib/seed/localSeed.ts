import type { Book } from '../../types';
import { readAudioAsset } from '../audio/asset';
import { buildTextChapters } from '../import/textMaterial';

/**
 * Optional local default library.
 *
 * `public/default-library.json` is gitignored on purpose: it lets a deployment
 * ship personal reading material without committing it to the repository.
 * The file is fetched on every start and any book not already in the store is
 * added, so a phone opening the same deployment sees the same shelf.
 */
interface LocalSeedEntry {
  id?: string;
  title: string;
  author?: string;
  kind?: 'book' | 'collection' | 'audiobook';
  /** Text material, for `book` and `collection` entries. */
  file?: string;
  /** `asset.json` of an audiobook asset, for `audiobook` entries. */
  asset?: string;
}

interface LocalSeedManifest {
  books?: LocalSeedEntry[];
}

function slug(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'local-seed'
  );
}

export async function fetchLocalSeedLibrary(): Promise<Book[]> {
  let manifest: LocalSeedManifest;
  try {
    const response = await fetch('/default-library.json', { cache: 'no-store' });
    if (!response.ok) return [];
    manifest = (await response.json()) as LocalSeedManifest;
  } catch {
    return [];
  }

  const books: Book[] = [];
  for (const entry of manifest.books ?? []) {
    if (!entry?.title) continue;

    if (entry.kind === 'audiobook') {
      const book = await fetchAudioSeed(entry);
      if (book) books.push(book);
      continue;
    }

    if (!entry.file) continue;
    try {
      const response = await fetch(entry.file, { cache: 'no-store' });
      if (!response.ok) continue;
      const text = await response.text();
      const bookId = entry.id?.trim() || `local-${slug(entry.title)}`;
      const { chapters, nextSeq } = buildTextChapters({ bookId, text });
      if (chapters.length === 0) continue;

      books.push({
        id: bookId,
        title: entry.title,
        author: entry.author?.trim() || '合集',
        chapters,
        importedAt: Date.now(),
        source: {
          kind: entry.kind === 'collection' ? 'collection' : 'text',
        },
        chapterSeq: entry.kind === 'collection' ? nextSeq : undefined,
      });
    } catch {
      // A missing or malformed seed file should never block the app.
    }
  }
  return books;
}

/**
 * An audiobook asset is a directory holding `asset.json` and its chapter
 * files; the book, its timings and the URL base all come from one fetch.
 */
async function fetchAudioSeed(entry: LocalSeedEntry): Promise<Book | null> {
  if (!entry.asset) return null;

  try {
    const response = await fetch(entry.asset, { cache: 'no-store' });
    if (!response.ok) return null;
    const base = entry.asset.replace(/\/asset\.json$/, '');
    const book = readAudioAsset(await response.json(), { base });
    if (!book) return null;

    return {
      ...book,
      demo: true,
      title: entry.title.trim() || book.title,
      author: entry.author?.trim() || book.author,
    };
  } catch {
    return null;
  }
}
