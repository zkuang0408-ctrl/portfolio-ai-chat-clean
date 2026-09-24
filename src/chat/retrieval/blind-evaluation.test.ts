import { describe, expect, test } from "vitest";

import generatedIndex from "../knowledge/generated-index.json";
import type { KnowledgeChunk } from "../knowledge/types";
import type { GeneratedKnowledgeIndex } from "../knowledge/types";
import {
  evaluateBlindRetrievalCase,
  summarizeBlindRetrieval,
  type BlindEvaluationCase,
  type BlindRetrievalObservation,
} from "./blind-evaluation";
import { blindEvaluationCases } from "./blind-evaluation-cases";
import { runBlindRetrievalEvaluation } from "./blind-evaluation-runner";
import { retrievalEvaluationCases } from "./evaluation-cases";
import { createStructuredHybridRetriever } from "./structured-hybrid";

function observation(
  chunkIds: readonly string[],
  projectIds: readonly string[],
): BlindRetrievalObservation {
  return { chunkIds, projectIds, sourceIds: projectIds };
}

describe("blind retrieval evaluation", () => {
  test("passes the maintained 60-question regression bank", async () => {
    const report = await runBlindRetrievalEvaluation(
      blindEvaluationCases,
      createStructuredHybridRetriever(generatedIndex as GeneratedKnowledgeIndex),
    );

    expect(report.results.filter(({ passed }) => !passed).map(({ id }) => id)).toEqual([]);
    expect(report.summary).toMatchObject({ total: 60, passed: 60, passRate: 1 });
  });

  test("keeps a separate 60-question bank with unique ids and queries", () => {
    expect(blindEvaluationCases).toHaveLength(60);
    expect(new Set(blindEvaluationCases.map(({ id }) => id)).size).toBe(60);
    expect(new Set(blindEvaluationCases.map(({ query }) => query)).size).toBe(60);

    const existingQueries = new Set(
      retrievalEvaluationCases.map(({ query }) => query),
    );
    expect(
      blindEvaluationCases.filter(({ query }) => existingQueries.has(query)),
    ).toEqual([]);
  });

  test("passes when every required claim and project is retrieved", () => {
    const evaluationCase: BlindEvaluationCase = {
      id: "sample-required-all",
      category: "fact",
      locale: "zh",
      query: "示例问题",
      expectedProjectIds: ["inkseat"],
      requiredAllChunkIds: ["claim-a", "claim-b"],
    };

    expect(
      evaluateBlindRetrievalCase(
        evaluationCase,
        observation(["claim-a", "claim-b"], ["inkseat"]),
      ),
    ).toMatchObject({ passed: true, missingChunkIds: [], missingProjectIds: [] });
  });

  test("fails when none of the alternative claims is retrieved", () => {
    const evaluationCase: BlindEvaluationCase = {
      id: "sample-required-any",
      category: "fact",
      locale: "zh",
      query: "示例问题",
      expectedProjectIds: ["atempo"],
      requiredAnyChunkIds: ["claim-a", "claim-b"],
    };

    expect(
      evaluateBlindRetrievalCase(
        evaluationCase,
        observation(["claim-c"], ["atempo"]),
      ),
    ).toMatchObject({ passed: false, missingAlternativeGroup: true });
  });

  test("passes an abstention case only when retrieval is empty", () => {
    const evaluationCase: BlindEvaluationCase = {
      id: "sample-abstention",
      category: "abstention",
      locale: "zh",
      query: "私人问题",
      expectNoResults: true,
    };

    expect(
      evaluateBlindRetrievalCase(evaluationCase, observation([], [])),
    ).toMatchObject({ passed: true });
    expect(
      evaluateBlindRetrievalCase(
        evaluationCase,
        observation(["unrelated"], ["inkseat"]),
      ),
    ).toMatchObject({ passed: false, unexpectedResultCount: 1 });
  });

  test("summarizes overall and category pass rates", () => {
    const summary = summarizeBlindRetrieval([
      { id: "a", category: "fact", passed: true },
      { id: "b", category: "fact", passed: false },
      { id: "c", category: "abstention", passed: true },
    ]);

    expect(summary).toEqual({
      total: 3,
      passed: 2,
      passRate: 2 / 3,
      byCategory: {
        abstention: { total: 1, passed: 1, passRate: 1 },
        fact: { total: 2, passed: 1, passRate: 0.5 },
      },
    });
  });

  test("runs a question bank through a retriever and preserves evidence", async () => {
    const chunk = {
      id: "inkseat:claim:architecture",
      projectId: "inkseat",
      sourceId: "inkseat-authored",
      title: "INKSeat architecture",
      text: "A structured architecture claim.",
      terms: [],
      aliases: [],
      tags: [],
      citationLabel: "INKSeat architecture",
      publicHref: "/projects/inkseat",
      knowledgeKind: "authored-claim",
      intents: ["architecture"],
      informationDensity: "high",
      pageRole: "owner-confirmed",
      provenance: "owner_statement",
      evidencePages: [],
      questionAliases: [],
    } satisfies KnowledgeChunk;
    const retriever = {
      search: async () => ({
        route: {
          scope: "project" as const,
          normalizedQuery: "架构是什么",
          queryTerms: ["架构"],
          projectIds: ["inkseat"],
          intents: ["architecture" as const],
        },
        results: [
          {
            chunk,
            score: 9,
          },
        ],
      }),
    };
    const evaluationCase: BlindEvaluationCase = {
      id: "sample-runner",
      category: "mechanism",
      locale: "zh",
      query: "架构是什么？",
      expectedProjectIds: ["inkseat"],
      requiredAllChunkIds: ["inkseat:claim:architecture"],
    };

    const report = await runBlindRetrievalEvaluation(
      [evaluationCase],
      retriever,
    );

    expect(report.summary).toMatchObject({ total: 1, passed: 1, passRate: 1 });
    expect(report.results[0]).toMatchObject({
      id: "sample-runner",
      query: "架构是什么？",
      passed: true,
      retrievedChunkIds: ["inkseat:claim:architecture"],
      retrievedScores: [9],
    });
  });
});
