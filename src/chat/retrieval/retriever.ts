import type { KnowledgeChunk } from "../knowledge/types.js";
import type { QueryRoute } from "./query-routing.js";

export interface SearchOptions {
  readonly locale: "zh" | "en";
  readonly limit?: number;
}

export interface SearchResult {
  readonly chunk: KnowledgeChunk;
  readonly score: number;
}

export interface RetrievalOutcome {
  readonly route: QueryRoute;
  readonly results: readonly SearchResult[];
}

export interface Retriever {
  search(query: string, options: SearchOptions): Promise<RetrievalOutcome>;
}
