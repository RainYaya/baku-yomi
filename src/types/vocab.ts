/** A vocabulary entry keeps the sentence it was met in, not just the word. */

export type VocabExampleSource = 'article' | 'ai' | 'user';
export type VocabStatus = 'new' | 'known';

export interface VocabSynonym {
  word: string;
  /** Short nuance label, e.g. 纳得 / 断念 / 心情. */
  nuance?: string;
}

export interface VocabSource {
  bookId: string;
  chapterId: string;
  chapterIndex: number;
  pairId: string;
  startOffset?: number;
  endOffset?: number;
}

export interface VocabEntry {
  id: string;
  word: string;
  reading?: string;
  meaning?: string;
  synonyms: VocabSynonym[];
  core?: string;
  example: string;
  exampleTranslation?: string;
  exampleSource: VocabExampleSource;
  source?: VocabSource;
  status: VocabStatus;
  createdAt: number;
  updatedAt: number;
  model?: string;
}

/** The editable starting point before an entry is saved. */
export interface VocabDraft {
  word: string;
  reading?: string;
  meaning?: string;
  synonyms?: VocabSynonym[];
  core?: string;
  example: string;
  exampleTranslation?: string;
  exampleSource: VocabExampleSource;
  source?: VocabSource;
}

/** The fields the model is allowed to fill. */
export interface VocabFillFields {
  reading?: string;
  meaning?: string;
  synonyms?: VocabSynonym[];
  core?: string;
  example?: string;
}
