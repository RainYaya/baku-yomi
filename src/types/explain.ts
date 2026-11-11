/**
 * Types for the "深度讲解" (reading explanation) feature.
 *
 * The feature asks a model to explain a selected fragment of Japanese in the
 * reader. Unlike the back-translation grader, the answer is meant to be read
 * *while* looking at the sentence, so the interesting part is not the prose
 * but the anchoring: the model returns a table of syntactic units, and we map
 * every row back onto exact character offsets in the original sentence. Rows
 * that do not line up are dropped rather than rendered in the wrong place.
 */

export type ExplainAction = 'meaning' | 'grammar' | 'usage' | 'nuance';

export const EXPLAIN_ACTIONS: ReadonlyArray<{
  id: ExplainAction;
  label: string;
  hint: string;
}> = [
  { id: 'meaning', label: '读懂', hint: '这句话在说什么' },
  { id: 'grammar', label: '拆句', hint: '成分与结构' },
  { id: 'usage', label: '用法', hint: '值得学的表达' },
  { id: 'nuance', label: '语感', hint: '语气与言外之意' },
];

export type ExplainDepth = 'concise' | 'detailed';

export interface ExplainRequest {
  /** The sentence the fragment came from — always sent as context. */
  sentence: string;
  /** The exact selected fragment. Empty means "the whole sentence". */
  fragment: string;
  action: ExplainAction;
  depth: ExplainDepth;
  /** Language for the explanation prose, e.g. 'zh-Hans'. */
  targetLanguage: string;
}

/**
 * A syntactic unit anchored to the source sentence.
 *
 * `start`/`end` are character offsets into `ExplainRequest.sentence`, not into
 * the fragment, so the reader can highlight the unit in place.
 */
export interface SentenceUnit {
  text: string;
  start: number;
  end: number;
  /** Part of speech, already normalised to a short label. */
  pos: string;
  /** Syntactic role, already normalised to a short label. */
  role: string;
  meaning: string;
}

export interface ExplainAnswer {
  action: ExplainAction;
  /** The prose answer with the table stripped out. */
  markdown: string;
  /** Anchored units; empty when the model returned no usable table. */
  units: SentenceUnit[];
  /** True when a table was present but every row failed to anchor. */
  unitsRejected: boolean;
  /** Model id that produced the answer, for display/debugging. */
  model: string;
  createdAt: number;
}
