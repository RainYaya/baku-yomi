export type NoteSourceKind = 'hashtag' | 'author';

/** A feed source as the server and client both refer to it. */
export interface NoteFeedSource {
  kind: NoteSourceKind;
  key: string;
}

export interface NoteFeedItem {
  url: string;
  title: string;
  author: string;
  publishedAt: number;
  excerpt: string;
  thumbnail?: string;
  sourceId: string;
}

export interface NoteSource {
  id: string;
  kind: NoteSourceKind;
  key: string;
  label: string;
  enabled: boolean;
  addedAt: number;
}

export interface NoteSourceCache {
  sourceId: string;
  items: NoteFeedItem[];
  fetchedAt: number;
  error?: string;
}
