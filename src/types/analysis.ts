export interface AnalysisResult {
  pairId: string;
  userTranslation: string;
  originalJapanese: string;
  score: number;
  errors: AnalysisError[];
  strengths: string[];
  suggestions: string[];
  rawMarkdown: string;
  analyzedAt: number;
}

export interface AnalysisError {
  category: ErrorCategory;
  userText: string;
  correctText: string;
  explanation: string;
}

export type ErrorCategory =
  | '文法'
  | '語彙'
  | '助詞'
  | '敬語'
  | '時制'
  | '表現'
  | '語順'
  | 'その他';
