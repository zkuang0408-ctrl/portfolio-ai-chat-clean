import { describe, expect, test } from "vitest";

import generatedIndex from "../knowledge/generated-index.json";
import type { GeneratedKnowledgeIndex } from "../knowledge/types";
import { portfolioRetrievalEvaluationCases } from "./evaluation-cases";
import { createStructuredHybridRetriever } from "./structured-hybrid";

describe("portfolio retrieval acceptance suite", () => {
  const retriever = createStructuredHybridRetriever(
    generatedIndex as GeneratedKnowledgeIndex,
  );

  test.each(portfolioRetrievalEvaluationCases)(
    "$name",
    async ({
      query,
      locale,
      requiredChunkIds,
      requiredSourceIds,
      forbiddenPrimaryChunkIds,
      minimumDistinctSources,
      expectNoResults,
    }) => {
      const results = await retriever.search(query, { locale, limit: 8 });

      if (expectNoResults) {
        expect(results).toEqual([]);
        return;
      }

      const resultIds = results.map(({ chunk }) => chunk.id);
      const sourceIds = results.map(({ chunk }) => chunk.sourceId);

      for (const chunkId of requiredChunkIds ?? []) {
        expect(resultIds).toContain(chunkId);
      }
      for (const sourceId of requiredSourceIds ?? []) {
        expect(sourceIds).toContain(sourceId);
      }
      for (const chunkId of forbiddenPrimaryChunkIds ?? []) {
        expect(results[0]?.chunk.id).not.toBe(chunkId);
      }
      if (minimumDistinctSources !== undefined) {
        expect(new Set(sourceIds).size).toBeGreaterThanOrEqual(
          minimumDistinctSources,
        );
      }
    },
  );
});
