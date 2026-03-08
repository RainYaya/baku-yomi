export interface Book {
  id: string;
  title: string;
  author: string;
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
  chinese: string;
  chapterIndex: number;
  pairIndex: number;
}
