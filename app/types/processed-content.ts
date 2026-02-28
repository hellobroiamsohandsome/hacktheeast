export type DataSourceStatus =
  | "live"
  | "bedrock"
  | "partial_exa"
  | "partial_minimax"
  | "fallback";

export interface ProcessedContent {
  title: string;
  detectedTopics: string[];
  mediaUrl: string;
  ambientVideoCue: string;
  transcript: Array<{
    id: string;
    timestamp?: string;
    text: string;
    translatedText: string;
    shadowingAudioUrl?: string;
  }>;
  flashcards: Array<{
    word: string;
    context: string;
    definition: string;
    imageUrl: string;
  }>;
  /** Set by API for debug badge: which providers contributed to this response. */
  dataSource?: DataSourceStatus;
}
