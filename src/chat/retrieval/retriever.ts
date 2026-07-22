import type { KnowledgeChunk } from "../knowledge/types";

export interface SearchOptions {
  readonly locale: "zh" | "en";
  readonly limit?: number;
}

export interface SearchResult {
  readonly chunk: KnowledgeChunk;
  readonly score: number;
}

export interface Retriever {
  search(query: string, options: SearchOptions): Promise<readonly SearchResult[]>;
}
