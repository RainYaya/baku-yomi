import type { Book, BookSourceKind } from '../../types';

/** How a material appears in the library filter. */
export type SourceGroup =
  | 'book'
  | 'note'
  | 'ai'
  | 'subtitle'
  | 'video'
  | 'link'
  | 'collection';
export type LibraryFilter = 'all' | SourceGroup;

const GROUP_OF: Record<BookSourceKind, SourceGroup> = {
  epub: 'book',
  text: 'book',
  url: 'link',
  collection: 'collection',
  note: 'note',
  ai: 'ai',
  subtitle: 'subtitle',
  video: 'video',
  audiobook: 'book',
};

const LABEL_OF: Record<BookSourceKind, string> = {
  epub: 'EPUB',
  text: '粘贴',
  url: '链接',
  collection: '合集',
  note: 'note',
  ai: 'AI 情景',
  subtitle: '字幕',
  video: '视频',
  audiobook: '有声书',
};

function kindOf(book: Book): BookSourceKind | undefined {
  return book.source?.kind;
}

export function sourceGroup(book: Book): SourceGroup {
  const kind = kindOf(book);
  return kind ? (GROUP_OF[kind] ?? 'book') : 'book';
}

export function sourceLabel(book: Book): string {
  const kind = kindOf(book);
  return kind ? (LABEL_OF[kind] ?? '书') : '书';
}

/** The hidden book that holds opened note articles. */
export function isNoteBook(book: Book): boolean {
  return book.source?.kind === 'note';
}

/** Books shown in the flat library grid — note lives behind its own view. */
export function visibleBooks(books: Book[]): Book[] {
  return books.filter((book) => !isNoteBook(book));
}

export function booksInGroup(books: Book[], group: LibraryFilter): Book[] {
  if (group === 'all') return books;
  return books.filter((book) => sourceGroup(book) === group);
}

const GROUP_LABEL: Record<SourceGroup, string> = {
  book: '书',
  link: '链接',
  collection: '合集',
  ai: 'AI 情景',
  subtitle: '字幕',
  video: '视频',
  note: 'note',
};

export function sourceGroupLabel(group: SourceGroup): string {
  return GROUP_LABEL[group];
}
