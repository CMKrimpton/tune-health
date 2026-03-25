export interface ApiUsage {
  model: string;
  stage: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface ApiResult {
  text: string;
  usage: ApiUsage;
}

export interface VoiceAudit {
  bannedPhrases: string[];
  paragraphsOver3Sentences: number;
  longestParagraphSentences: number;
  youCount: number;
  wordCount: number;
  shortSentenceCount: number;
  totalParagraphs: number;
  shortSentenceRatio: string;
  rhetoricQuestionCount: number;
  passed: boolean;
  failures: string[];
}

export interface ClaudeOptions {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  webSearch?: boolean;
  maxSearches?: number;
}
