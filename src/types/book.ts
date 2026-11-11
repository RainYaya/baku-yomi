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

export type BookSourceKind = 'epub' | 'text' | 'url' | 'collection';

export interface BookSource {
  kind: BookSourceKind;
  url?: string;
  site?: string;
}

export interface Chapter {
  id: string;
  title: string;
  index: number;
  pairs: SentencePair[];
  sourceUrl?: string;
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
}
