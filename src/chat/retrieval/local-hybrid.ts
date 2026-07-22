import { buildTerms } from "../knowledge/build-index";
import type {
  GeneratedKnowledgeIndex,
  KnowledgeChunk,
} from "../knowledge/types";
import type { Retriever, SearchOptions, SearchResult } from "./retriever";

const DEFAULT_MINIMUM_SCORE = 2.5;
const DEFAULT_MAX_RESULTS = 8;
const DEFAULT_MAX_PER_SOURCE = 3;
const BM25_K = 1.2;
const BM25_B = 0.75;

const ENGLISH_QUERY_STOP_TERMS = new Set([
  "a",
  "an",
  "are",
  "do",
  "does",
  "for",
  "how",
  "i",
  "is",
  "looking",
  "look",
  "of",
  "opportunities",
  "opportunity",
  "please",
  "the",
  "what",
  "where",
  "which",
  "who",
  "why",
  "you",
  "your",
]);
const CHINESE_QUERY_STOP_TERMS = new Set([
  "你在",
  "在寻",
  "寻找",
  "找什",
  "什么",
  "么机",
  "机会",
  "如何",
  "怎么",
  "怎样",
  "哪些",
  "是否",
  "可以",
  "请问",
  "能否",
  "吗",
  "呢",
  "帮我",
  "给我",
  "我想",
  "想要",
]);

export interface LocalHybridRetrieverConfig {
  readonly minimumScore?: number;
  readonly maxResults?: number;
  readonly maxPerSource?: number;
}

interface ResolvedConfig {
  readonly minimumScore: number;
  readonly maxResults: number;
  readonly maxPerSource: number;
}

interface IndexedChunk {
  readonly chunk: KnowledgeChunk;
  readonly bodyTerms: ReadonlySet<string>;
  readonly titleTerms: ReadonlySet<string>;
  readonly aliasTerms: ReadonlySet<string>;
  readonly tagTerms: ReadonlySet<string>;
  readonly sourceTerms: ReadonlySet<string>;
  readonly normalizedTitle: string;
  readonly normalizedAliases: ReadonlySet<string>;
  readonly normalizedSourceId: string;
  readonly bodyLength: number;
}

function normalizePhrase(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function termsAsSet(value: string): ReadonlySet<string> {
  return new Set(buildTerms(value));
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function resolveConfig(config: LocalHybridRetrieverConfig): ResolvedConfig {
  const resolved = {
    minimumScore: config.minimumScore ?? DEFAULT_MINIMUM_SCORE,
    maxResults: config.maxResults ?? DEFAULT_MAX_RESULTS,
    maxPerSource: config.maxPerSource ?? DEFAULT_MAX_PER_SOURCE,
  };
  if (!Number.isFinite(resolved.minimumScore) || resolved.minimumScore < 0) {
    throw new Error("minimumScore must be a finite non-negative number");
  }
  positiveInteger(resolved.maxResults, "maxResults");
  positiveInteger(resolved.maxPerSource, "maxPerSource");
  return resolved;
}

function containsAllTerms(
  queryTerms: ReadonlySet<string>,
  candidateTerms: ReadonlySet<string>,
): boolean {
  for (const term of queryTerms) {
    if (!candidateTerms.has(term)) return false;
  }
  return queryTerms.size > 0;
}

function requestedLimit(options: SearchOptions, maximum: number): number {
  if (options.limit === undefined) return maximum;
  if (
    !Number.isFinite(options.limit) ||
    !Number.isInteger(options.limit) ||
    options.limit < 0
  ) {
    throw new Error("limit must be a finite non-negative integer");
  }
  // A valid caller limit is capped only by the retriever's configured ceiling.
  return Math.min(maximum, options.limit);
}

function searchTerms(queryTerms: ReadonlySet<string>): ReadonlySet<string> {
  return new Set(
    [...queryTerms].filter(
      (term) =>
        !ENGLISH_QUERY_STOP_TERMS.has(term) &&
        !CHINESE_QUERY_STOP_TERMS.has(term),
    ),
  );
}

/**
 * Creates the local, deterministic implementation behind the Retriever boundary.
 *
 * Metadata is deliberately scored as field presence rather than repeated text.
 * The generated `terms` field mixes metadata and body terms, so this constructor
 * rebuilds separate sets once. This prevents a title, alias, and tag repeating a
 * word from acting like repeated body prose while retaining their explicit boosts.
 */
export function createLocalHybridRetriever(
  index: GeneratedKnowledgeIndex,
  config: LocalHybridRetrieverConfig = {},
): Retriever {
  const resolved = resolveConfig(config);
  const indexedChunks: readonly IndexedChunk[] = index.chunks.map((chunk) => {
    const bodyTerms = termsAsSet(chunk.text);
    const titleTerms = termsAsSet(chunk.title);
    const aliasTerms = termsAsSet(chunk.aliases.join(" "));
    const tagTerms = termsAsSet(chunk.tags.join(" "));
    const sourceTerms = termsAsSet(chunk.sourceId);
    return {
      chunk,
      bodyTerms,
      titleTerms,
      aliasTerms,
      tagTerms,
      sourceTerms,
      normalizedTitle: normalizePhrase(chunk.title),
      normalizedAliases: new Set(chunk.aliases.map(normalizePhrase).filter(Boolean)),
      normalizedSourceId: normalizePhrase(chunk.sourceId),
      bodyLength: Math.max(1, bodyTerms.size),
    };
  });
  const documentFrequency = new Map<string, number>();
  for (const indexed of indexedChunks) {
    for (const term of indexed.bodyTerms) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const documentCount = indexedChunks.length;
  const averageBodyLength =
    documentCount === 0
      ? 1
      : Math.max(
          1,
          indexedChunks.reduce((total, indexed) => total + indexed.bodyLength, 0) /
            documentCount,
        );

  // Binary body terms intentionally suppress repeated OCR tokens from inflating BM25.
  const binaryBodyTermBm25 = (term: string, indexed: IndexedChunk): number => {
    if (!indexed.bodyTerms.has(term) || documentCount === 0) return 0;
    const frequency = documentFrequency.get(term) ?? 0;
    const inverseDocumentFrequency = Math.log(
      1 + (documentCount - frequency + 0.5) / (frequency + 0.5),
    );
    const normalization =
      1 - BM25_B + BM25_B * (indexed.bodyLength / averageBodyLength);
    return (inverseDocumentFrequency * (BM25_K + 1)) / (1 + BM25_K * normalization);
  };

  return {
    async search(query: string, options: SearchOptions): Promise<readonly SearchResult[]> {
      // Keep the locale in the replaceable public boundary; aliases already bridge
      // languages, so the local scorer intentionally uses one deterministic path.
      void options.locale;
      const unfilteredQueryTerms = termsAsSet(query);
      const normalizedQuery = normalizePhrase(query);
      if (!normalizedQuery) return [];
      const queryTerms = searchTerms(unfilteredQueryTerms);
      const scored: SearchResult[] = [];

      for (const indexed of indexedChunks) {
        let score = 0;
        for (const term of queryTerms) {
          score += binaryBodyTermBm25(term, indexed);
          if (indexed.titleTerms.has(term)) score += 1.5;
          if (indexed.aliasTerms.has(term)) score += 1.75;
          if (indexed.tagTerms.has(term)) score += 1.25;
          if (indexed.sourceTerms.has(term)) score += 1;
        }
        if (normalizedQuery === indexed.normalizedTitle) score += 6;
        if (indexed.normalizedAliases.has(normalizedQuery)) score += 6;
        if (normalizedQuery === indexed.normalizedSourceId) score += 4;

        // A complete multi-word alias is a stronger bilingual bridge than isolated
        // body terms, but must not rescue a query with no matching token at all.
        if (containsAllTerms(queryTerms, indexed.aliasTerms)) score += 1;
        if (
          !Number.isFinite(score) ||
          score <= 0 ||
          score < resolved.minimumScore
        ) {
          continue;
        }
        scored.push({ chunk: indexed.chunk, score: Math.max(0, score) });
      }

      scored.sort(
        (left, right) =>
          right.score - left.score ||
          (left.chunk.id < right.chunk.id ? -1 : left.chunk.id > right.chunk.id ? 1 : 0),
      );
      const limit = requestedLimit(options, resolved.maxResults);
      if (limit === 0) return [];
      const sourceCounts = new Map<string, number>();
      const results: SearchResult[] = [];
      for (const result of scored) {
        if (results.length >= limit) break;
        const count = sourceCounts.get(result.chunk.sourceId) ?? 0;
        if (count >= resolved.maxPerSource) continue;
        sourceCounts.set(result.chunk.sourceId, count + 1);
        results.push({ chunk: result.chunk, score: result.score });
      }
      return results;
    },
  };
}
