export interface Book {
  id: string;
  title: string;
  author: string;
  description?: string;
  publisher?: string;
  chapters: Chapter[];
  coverUrl?: string;
  importedAt: number;
  source?: BookSource;
  /** First-run sample content, safe to delete. */
  demo?: boolean;
  /** Next chapter sequence for collection books; never reused after a delete. */
  chapterSeq?: number;
  /** Legacy tag grouping. Collections are books now; kept for old data. */
  collectionId?: string;
}

export interface Collection {
  id: string;
  title: string;
  createdAt: number;
}

export type BookSourceKind =
  | 'epub'
  | 'text'
  | 'url'
  | 'collection'
  | 'note'
  | 'ai'
  | 'subtitle'
  | 'video';

export type VideoProvider = 'youtube' | 'local';

export interface VideoSource {
  provider: VideoProvider;
  // YouTube
  url?: string;
  videoId?: string;
  channel?: string;
  thumbnailUrl?: string;
  // Local file metadata; the file itself is never stored.
  fileName?: string;
  fileSize?: number;
  fileLastModified?: number;
  mimeType?: string;
  // Shared
  durationSec?: number;
}

export interface BookSource {
  kind: BookSourceKind;
  url?: string;
  site?: string;
  /** The user's prompt for an AI-generated material. */
  scenario?: string;
  /** Original subtitle file name. */
  fileName?: string;
  /** Present on video books. */
  video?: VideoSource;
}

export interface Chapter {
  id: string;
  title: string;
  index: number;
  pairs: SentencePair[];
  sourceUrl?: string;
  /** Present when this chapter is an opened note article. */
  note?: NoteChapterMeta;
}

export interface NoteChapterMeta {
  url: string;
  author: string;
  publishedAt: number;
  sourceKind: 'hashtag' | 'author';
  sourceKey: string;
  tags?: string[];
}

export type TranslationSource = 'ai' | 'human' | 'imported';

export interface SentencePair {
  id: string;
  japanese: string;
  japaneseHtml?: string; // HTML with <ruby> tags preserved for furigana display
  chinese: string;
  chapterIndex: number;
  pairIndex: number;
  /** Where the reference translation came from. Empty when untranslated. */
  translationSource?: TranslationSource;
  /** Set when the reader has checked an AI translation. */
  translationReviewed?: boolean;
  translatedAt?: number;
  /** Video timeline: cue start and end in milliseconds. */
  startMs?: number;
  endMs?: number;
}
