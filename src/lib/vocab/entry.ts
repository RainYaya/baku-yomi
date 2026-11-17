import { createVocabId } from '../id';
import type {
  VocabDraft,
  VocabEntry,
  VocabExampleSource,
  VocabStatus,
  VocabSynonym,
} from '../../types';

export interface VocabEntryFields {
  word: string;
  reading?: string;
  meaning?: string;
  synonyms?: VocabSynonym[];
  core?: string;
  example: string;
  exampleTranslation?: string;
  exampleSource: VocabExampleSource;
  status?: VocabStatus;
}

/** Build a storable entry from the draft and whatever the user kept. */
export function buildVocabEntry(input: {
  draft: VocabDraft;
  fields: VocabEntryFields;
  id?: string;
  createdAt?: number;
  now?: number;
}): VocabEntry {
  const now = input.now ?? Date.now();
  const { fields } = input;

  return {
    id: input.id ?? createVocabId(),
    word: fields.word.trim(),
    reading: fields.reading?.trim() || undefined,
    meaning: fields.meaning?.trim() || undefined,
    synonyms: fields.synonyms ?? [],
    core: fields.core?.trim() || undefined,
    example: fields.example.trim(),
    exampleTranslation: fields.exampleTranslation?.trim() || undefined,
    exampleSource: fields.exampleSource,
    source: input.draft.source,
    status: fields.status ?? 'new',
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
}
