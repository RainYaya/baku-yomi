export interface Book {
  id: string;
  title: string;
  author: string;
  description?: string;
  publisher?: string;
  chapters: Chapter[];
  coverUrl?: string;
  importedAt: number;
}

export interface Chapter {
  id: string;
  title: string;
  index: number;
  pairs: SentencePair[];
}

export interface SentencePair {
  id: string;
  japanese: string;
  japaneseHtml?: string; // HTML with <ruby> tags preserved for furigana display
  chinese: string;
  chapterIndex: number;
  pairIndex: number;
}
