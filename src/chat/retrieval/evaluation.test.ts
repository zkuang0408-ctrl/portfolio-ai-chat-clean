import { describe, expect, test } from "vitest";

import generatedIndex from "../knowledge/generated-index.json";
import type { GeneratedKnowledgeIndex } from "../knowledge/types";
import { retrievalEvaluationCases } from "./evaluation-cases";
import { createStructuredHybridRetriever } from "./structured-hybrid";

describe("portfolio retrieval acceptance suite", () => {
  const retriever = createStructuredHybridRetriever(
    generatedIndex as GeneratedKnowledgeIndex,
  );

  test("keeps the published evaluation case names stable", () => {
    expect(retrievalEvaluationCases.map(({ name }) => name)).toEqual([
      "INKSeat Chinese overview",
      "INKSeat architecture",
      "INKSeat problem",
      "EMOVUE technology",
      "Fruit algorithm",
      "Atempo data translation",
      "UroSense measurement",
      "First Fly English overview",
      "Cross-project systems thinking",
      "Unrelated private scheduling",
    ]);
  });

  test.each(retrievalEvaluationCases)(
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

  test("does not hard-reject a project question that mentions a weekend scenario", async () => {
    const results = await retriever.search("INKSeat 在周末场景如何使用？", {
      locale: "zh",
      limit: 8,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.some(({ chunk }) => chunk.projectId === "inkseat")).toBe(true);
  });

  test.each([
    "赵实旷什么时候有空？",
    "赵实旷周末是否有时间？",
  ])("rejects a named person's private availability question: %s", async (query) => {
    await expect(retriever.search(query, { locale: "zh", limit: 8 })).resolves.toEqual([]);
  });
});
