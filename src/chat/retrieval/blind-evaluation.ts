export type BlindEvaluationCategory =
  | "fact"
  | "mechanism"
  | "boundary"
  | "comparison"
  | "contribution"
  | "abstention";

export interface BlindEvaluationCase {
  readonly id: string;
  readonly category: BlindEvaluationCategory;
  readonly locale: "zh" | "en";
  readonly query: string;
  readonly expectedProjectIds?: readonly string[];
  readonly requiredAllChunkIds?: readonly string[];
  readonly requiredAnyChunkIds?: readonly string[];
  readonly minimumDistinctSources?: number;
  readonly expectNoResults?: boolean;
}

export interface BlindRetrievalObservation {
  readonly chunkIds: readonly string[];
  readonly projectIds: readonly string[];
  readonly sourceIds: readonly string[];
}

export interface BlindRetrievalCaseResult {
  readonly id: string;
  readonly category: BlindEvaluationCategory;
  readonly passed: boolean;
  readonly missingChunkIds: readonly string[];
  readonly missingProjectIds: readonly string[];
  readonly missingAlternativeGroup: boolean;
  readonly unexpectedResultCount: number;
  readonly distinctSourceCount: number;
}

export interface BlindEvaluationCategorySummary {
  readonly total: number;
  readonly passed: number;
  readonly passRate: number;
}

export interface BlindRetrievalSummary extends BlindEvaluationCategorySummary {
  readonly byCategory: Readonly<
    Partial<Record<BlindEvaluationCategory, BlindEvaluationCategorySummary>>
  >;
}

export function evaluateBlindRetrievalCase(
  evaluationCase: BlindEvaluationCase,
  observation: BlindRetrievalObservation,
): BlindRetrievalCaseResult {
  const observedChunks = new Set(observation.chunkIds);
  const observedProjects = new Set(observation.projectIds);
  const missingChunkIds = (evaluationCase.requiredAllChunkIds ?? []).filter(
    (chunkId) => !observedChunks.has(chunkId),
  );
  const missingProjectIds = (evaluationCase.expectedProjectIds ?? []).filter(
    (projectId) => !observedProjects.has(projectId),
  );
  const alternatives = evaluationCase.requiredAnyChunkIds ?? [];
  const missingAlternativeGroup =
    alternatives.length > 0 &&
    !alternatives.some((chunkId) => observedChunks.has(chunkId));
  const unexpectedResultCount = evaluationCase.expectNoResults
    ? observation.chunkIds.length
    : 0;
  const distinctSourceCount = new Set(observation.sourceIds).size;
  const lacksSourceDiversity =
    evaluationCase.minimumDistinctSources !== undefined &&
    distinctSourceCount < evaluationCase.minimumDistinctSources;

  return {
    id: evaluationCase.id,
    category: evaluationCase.category,
    passed:
      missingChunkIds.length === 0 &&
      missingProjectIds.length === 0 &&
      !missingAlternativeGroup &&
      unexpectedResultCount === 0 &&
      !lacksSourceDiversity,
    missingChunkIds,
    missingProjectIds,
    missingAlternativeGroup,
    unexpectedResultCount,
    distinctSourceCount,
  };
}

function summaryFor(
  results: readonly { readonly passed: boolean }[],
): BlindEvaluationCategorySummary {
  const total = results.length;
  const passed = results.filter(({ passed }) => passed).length;
  return { total, passed, passRate: total === 0 ? 0 : passed / total };
}

export function summarizeBlindRetrieval(
  results: readonly Pick<
    BlindRetrievalCaseResult,
    "id" | "category" | "passed"
  >[],
): BlindRetrievalSummary {
  const categories = [...new Set(results.map(({ category }) => category))].sort();
  const byCategory = Object.fromEntries(
    categories.map((category) => [
      category,
      summaryFor(results.filter((result) => result.category === category)),
    ]),
  );
  return { ...summaryFor(results), byCategory };
}
