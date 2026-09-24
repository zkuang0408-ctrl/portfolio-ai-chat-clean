import type { Retriever } from "./retriever.js";
import {
  evaluateBlindRetrievalCase,
  summarizeBlindRetrieval,
  type BlindEvaluationCase,
  type BlindRetrievalCaseResult,
  type BlindRetrievalSummary,
} from "./blind-evaluation.js";

export interface BlindRetrievalDetailedResult
  extends BlindRetrievalCaseResult {
  readonly query: string;
  readonly locale: "zh" | "en";
  readonly retrievedChunkIds: readonly string[];
  readonly retrievedProjectIds: readonly string[];
  readonly retrievedSourceIds: readonly string[];
  readonly retrievedScores: readonly number[];
}

export interface BlindRetrievalReport {
  readonly generatedAt: string;
  readonly retrievalLimit: number;
  readonly summary: BlindRetrievalSummary;
  readonly results: readonly BlindRetrievalDetailedResult[];
}

export async function runBlindRetrievalEvaluation(
  cases: readonly BlindEvaluationCase[],
  retriever: Retriever,
  retrievalLimit = 8,
): Promise<BlindRetrievalReport> {
  const results: BlindRetrievalDetailedResult[] = [];

  for (const evaluationCase of cases) {
    const { results: retrieved } = await retriever.search(evaluationCase.query, {
      locale: evaluationCase.locale,
      limit: retrievalLimit,
    });
    const retrievedChunkIds = retrieved.map(({ chunk }) => chunk.id);
    const retrievedProjectIds = retrieved
      .map(({ chunk }) => chunk.projectId)
      .filter((projectId): projectId is string => projectId !== undefined);
    const retrievedSourceIds = retrieved.map(({ chunk }) => chunk.sourceId);
    const evaluation = evaluateBlindRetrievalCase(evaluationCase, {
      chunkIds: retrievedChunkIds,
      projectIds: retrievedProjectIds,
      sourceIds: retrievedSourceIds,
    });

    results.push({
      ...evaluation,
      query: evaluationCase.query,
      locale: evaluationCase.locale,
      retrievedChunkIds,
      retrievedProjectIds,
      retrievedSourceIds,
      retrievedScores: retrieved.map(({ score }) => score),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    retrievalLimit,
    summary: summarizeBlindRetrieval(results),
    results,
  };
}
