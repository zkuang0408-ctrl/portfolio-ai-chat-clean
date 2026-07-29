import { buildTerms } from "../knowledge/terms.js";
import type { KnowledgeIntent } from "../knowledge/authored/types.js";
import type {
  AuthoredClaimKnowledgeChunk,
  GeneratedKnowledgeIndex,
  KnowledgeChunk,
} from "../knowledge/types.js";
import { createQueryRouter, type QueryRoute } from "./query-routing.js";
import type { Retriever, SearchOptions, SearchResult } from "./retriever.js";

const DEFAULT_MINIMUM_SCORE = 2.5;
const DEFAULT_MAX_RESULTS = 8;
const DEFAULT_MAX_PER_SOURCE = DEFAULT_MAX_RESULTS;
const BM25_K = 1.2;
const BM25_B = 0.75;

const SCORE = {
  routedProject: 20,
  excludedProject: -20,
  authoredClaim: 12,
  intentMatch: 8,
  exactQuestionAlias: 12,
  questionAliasTerms: 3,
  highDensity: 4,
  mediumDensity: 0,
  lowDensity: -8,
  overviewRoleForOverview: 8,
  architectureRoleForArchitecture: 8,
  contributionForOtherIntent: -10,
} as const;

export interface StructuredProjectRouteDecision {
  readonly score: number;
  readonly eligible: boolean;
}

/** Evaluates the fail-closed project boundary from the same score it reports. */
export function evaluateStructuredProjectRoute(
  projectId: string | undefined,
  routedProjectIds: readonly string[],
): StructuredProjectRouteDecision {
  if (projectId === undefined || routedProjectIds.length === 0) {
    return { score: 0, eligible: true };
  }
  const score = routedProjectIds.includes(projectId)
    ? SCORE.routedProject
    : SCORE.excludedProject;
  return {
    score,
    eligible: score > SCORE.excludedProject,
  };
}

const ENGLISH_QUERY_STOP_TERMS = new Set([
  "a",
  "an",
  "about",
  "and",
  "are",
  "can",
  "could",
  "do",
  "does",
  "for",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "please",
  "tell",
  "the",
  "this",
  "to",
  "us",
  "we",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "your",
]);
const CHINESE_QUERY_STOP_TERMS = new Set([
  "什么",
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
]);

export interface StructuredHybridRetrieverConfig {
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
  readonly normalizedQuestionAliases: ReadonlySet<string>;
  readonly questionAliasTerms: ReadonlySet<string>;
  readonly bodyLength: number;
}

function normalizeQuestion(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/([a-z0-9])([\p{Script=Han}])/gu, "$1 $2")
    .replace(/([\p{Script=Han}])([a-z0-9])/gu, "$1 $2")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function termsAsSet(value: string): ReadonlySet<string> {
  return new Set(buildTerms(value));
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function resolveConfig(config: StructuredHybridRetrieverConfig): ResolvedConfig {
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

function requestedLimit(options: SearchOptions, maximum: number): number {
  if (options.limit === undefined) return maximum;
  if (
    !Number.isFinite(options.limit) ||
    !Number.isInteger(options.limit) ||
    options.limit < 0
  ) {
    throw new Error("limit must be a finite non-negative integer");
  }
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

function isAuthoredClaim(
  chunk: KnowledgeChunk,
): chunk is AuthoredClaimKnowledgeChunk {
  return chunk.knowledgeKind === "authored-claim";
}

function isOwnerStatement(
  chunk: KnowledgeChunk,
): chunk is AuthoredClaimKnowledgeChunk {
  return (
    isAuthoredClaim(chunk) &&
    chunk.provenance === "owner_statement"
  );
}

function isProfileOrResume(chunk: KnowledgeChunk): boolean {
  return (
    chunk.knowledgeKind === "source-excerpt" &&
    (chunk.sourceId === "profile" || chunk.sourceId === "resume")
  );
}

function containsIntent(
  chunk: KnowledgeChunk,
  intent: KnowledgeIntent,
): boolean {
  return isAuthoredClaim(chunk) && chunk.intents.includes(intent);
}

function contributionQuery(route: QueryRoute): boolean {
  return route.intents.includes("contribution");
}

function canRetrieve(
  chunk: KnowledgeChunk,
  route: QueryRoute,
): boolean {
  const hasExplicitProjects = route.projectIds.length > 0;
  const isContribution = contributionQuery(route);

  if (isContribution) {
    if (isProfileOrResume(chunk)) return true;
    return (
      isOwnerStatement(chunk) &&
      (!hasExplicitProjects || route.projectIds.includes(chunk.projectId))
    );
  }

  if (!hasExplicitProjects) return true;
  return chunk.projectId !== undefined && route.projectIds.includes(chunk.projectId);
}

function densityScore(chunk: KnowledgeChunk): number {
  switch (chunk.informationDensity) {
    case "high":
      return SCORE.highDensity;
    case "medium":
      return SCORE.mediumDensity;
    case "low":
      return SCORE.lowDensity;
  }
}

function assertNoCandidateContribution(index: GeneratedKnowledgeIndex): void {
  for (const chunk of index.chunks) {
    if (
      (chunk as unknown as { readonly provenance?: unknown }).provenance ===
      "candidate_contribution"
    ) {
      throw new Error("Candidate contribution claims cannot be retrieved");
    }
  }
}

function primaryIntent(chunk: KnowledgeChunk): KnowledgeIntent | undefined {
  return isAuthoredClaim(chunk) ? chunk.intents[0] : undefined;
}

function primaryEvidencePage(chunk: KnowledgeChunk): number | undefined {
  return chunk.evidencePages[0] ?? chunk.page;
}

function isOverviewClaim(result: SearchResult): boolean {
  return (
    isAuthoredClaim(result.chunk) &&
    result.chunk.pageRole === "overview"
  );
}

function deduplicateClaimText(
  scored: readonly SearchResult[],
): readonly SearchResult[] {
  const seenClaimText = new Set<string>();
  return scored.filter((result) => {
    if (!isAuthoredClaim(result.chunk)) return true;
    const normalizedText = normalizeQuestion(result.chunk.text);
    if (!normalizedText || seenClaimText.has(normalizedText)) return false;
    seenClaimText.add(normalizedText);
    return true;
  });
}

interface EvidenceSelectionPass {
  readonly sourceLimit: number;
  readonly intentLimit: number;
  readonly distinctPagesOnly: boolean;
}

/**
 * Converts the score-ordered candidate list into a compact evidence packet.
 * Each pass relaxes a preference only when the earlier, more diverse pass
 * cannot fill the caller's requested limit.
 */
function selectEvidencePacket(
  scored: readonly SearchResult[],
  route: QueryRoute,
  config: ResolvedConfig,
  limit: number,
): readonly SearchResult[] {
  const candidates = deduplicateClaimText(scored);
  const selected: SearchResult[] = [];
  const selectedIds = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const intentCounts = new Map<KnowledgeIntent, number>();
  const evidencePages = new Set<number>();

  const add = (result: SearchResult): void => {
    selected.push(result);
    selectedIds.add(result.chunk.id);
    sourceCounts.set(
      result.chunk.sourceId,
      (sourceCounts.get(result.chunk.sourceId) ?? 0) + 1,
    );
    const intent = primaryIntent(result.chunk);
    if (intent !== undefined) {
      intentCounts.set(intent, (intentCounts.get(intent) ?? 0) + 1);
    }
    const page = primaryEvidencePage(result.chunk);
    if (page !== undefined) evidencePages.add(page);
  };

  if (
    route.projectIds.length > 0 &&
    (route.intents.length === 0 ||
      (route.intents.length === 1 && route.intents[0] === "overview"))
  ) {
    const overview = candidates.find(isOverviewClaim);
    if (overview !== undefined) add(overview);
  }

  const addFromPass = ({
    sourceLimit,
    intentLimit,
    distinctPagesOnly,
  }: EvidenceSelectionPass): void => {
    for (const result of candidates) {
      if (selected.length >= limit) return;
      if (selectedIds.has(result.chunk.id)) continue;
      const sourceCount = sourceCounts.get(result.chunk.sourceId) ?? 0;
      if (sourceCount >= sourceLimit) continue;
      const intent = primaryIntent(result.chunk);
      if (
        intent !== undefined &&
        (intentCounts.get(intent) ?? 0) >= intentLimit
      ) {
        continue;
      }
      const page = primaryEvidencePage(result.chunk);
      if (distinctPagesOnly && page !== undefined && evidencePages.has(page)) {
        continue;
      }
      add(result);
    }
  };

  const comparisonSourceLimit = route.intents.includes("comparison")
    ? Math.min(2, config.maxPerSource)
    : config.maxPerSource;
  const preferredPasses: readonly EvidenceSelectionPass[] = [
    {
      sourceLimit: comparisonSourceLimit,
      intentLimit: 2,
      distinctPagesOnly: true,
    },
    {
      sourceLimit: comparisonSourceLimit,
      intentLimit: 2,
      distinctPagesOnly: false,
    },
    {
      sourceLimit: config.maxPerSource,
      intentLimit: 2,
      distinctPagesOnly: true,
    },
    {
      sourceLimit: config.maxPerSource,
      intentLimit: 2,
      distinctPagesOnly: false,
    },
    {
      sourceLimit: config.maxPerSource,
      intentLimit: Number.POSITIVE_INFINITY,
      distinctPagesOnly: true,
    },
    {
      sourceLimit: config.maxPerSource,
      intentLimit: Number.POSITIVE_INFINITY,
      distinctPagesOnly: false,
    },
  ];
  for (const pass of preferredPasses) {
    if (selected.length >= limit) break;
    addFromPass(pass);
  }
  return selected;
}

/**
 * Scores published portfolio evidence with deterministic routing, authored
 * claim boosts, and a compact, diverse evidence-selection packet.
 */
export function createStructuredHybridRetriever(
  index: GeneratedKnowledgeIndex,
  config: StructuredHybridRetrieverConfig = {},
): Retriever {
  assertNoCandidateContribution(index);
  const resolved = resolveConfig(config);
  const router = createQueryRouter(index);
  const indexedChunks: readonly IndexedChunk[] = index.chunks.map((chunk) => {
    const bodyTerms = termsAsSet(chunk.text);
    return {
      chunk,
      bodyTerms,
      titleTerms: termsAsSet(chunk.title),
      aliasTerms: termsAsSet(chunk.aliases.join(" ")),
      tagTerms: termsAsSet(chunk.tags.join(" ")),
      sourceTerms: termsAsSet(chunk.sourceId),
      normalizedQuestionAliases: new Set(chunk.questionAliases.map(normalizeQuestion)),
      questionAliasTerms: termsAsSet(chunk.questionAliases.join(" ")),
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
      void options.locale;
      const route = router.route(query);
      if (!route.normalizedQuery) return [];
      const queryTerms = searchTerms(termsAsSet(query));
      const scored: SearchResult[] = [];

      for (const indexed of indexedChunks) {
        const projectRoute = evaluateStructuredProjectRoute(
          indexed.chunk.projectId,
          route.projectIds,
        );
        const isRoutedProject =
          projectRoute.eligible && projectRoute.score === SCORE.routedProject;
        if (projectRoute.eligible && !canRetrieve(indexed.chunk, route)) continue;

        let score = projectRoute.score;
        let hasLexicalSignal = false;
        for (const term of queryTerms) {
          const bodyScore = binaryBodyTermBm25(term, indexed);
          score += bodyScore;
          if (bodyScore > 0) hasLexicalSignal = true;
          if (indexed.titleTerms.has(term)) {
            score += 1.5;
            hasLexicalSignal = true;
          }
          if (indexed.aliasTerms.has(term)) {
            score += 1.75;
            hasLexicalSignal = true;
          }
          if (indexed.tagTerms.has(term)) {
            score += 1.25;
            hasLexicalSignal = true;
          }
          if (indexed.sourceTerms.has(term)) {
            score += 1;
            hasLexicalSignal = true;
          }
          if (indexed.questionAliasTerms.has(term)) {
            score += SCORE.questionAliasTerms;
            hasLexicalSignal = true;
          }
        }
        if (isAuthoredClaim(indexed.chunk)) score += SCORE.authoredClaim;
        let matchingIntentCount = 0;
        for (const intent of route.intents) {
          if (containsIntent(indexed.chunk, intent)) {
            score += SCORE.intentMatch;
            matchingIntentCount += 1;
          }
        }
        const hasExactQuestionAlias = indexed.normalizedQuestionAliases.has(
          route.normalizedQuery,
        );
        if (hasExactQuestionAlias) {
          score += SCORE.exactQuestionAlias;
        }
        // The negative route score is part of the same deterministic scoring
        // path, while this fail-closed boundary guarantees that even unusually
        // strong lexical overlap cannot revive another project's PDF evidence.
        if (!projectRoute.eligible) continue;
        if (
          !isRoutedProject &&
          !hasLexicalSignal &&
          matchingIntentCount === 0 &&
          !hasExactQuestionAlias
        ) {
          continue;
        }
        score += densityScore(indexed.chunk);
        if (route.intents.includes("overview") && indexed.chunk.pageRole === "overview") {
          score += SCORE.overviewRoleForOverview;
        }
        if (
          route.intents.includes("architecture") &&
          indexed.chunk.pageRole === "system-architecture"
        ) {
          score += SCORE.architectureRoleForArchitecture;
        }
        if (
          !contributionQuery(route) &&
          containsIntent(indexed.chunk, "contribution")
        ) {
          score += SCORE.contributionForOtherIntent;
        }
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
      return selectEvidencePacket(scored, route, resolved, limit);
    },
  };
}
