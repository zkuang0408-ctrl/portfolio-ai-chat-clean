import { describe, expect, test } from "vitest";

import generatedIndex from "../knowledge/generated-index.json";
import { buildTerms } from "../knowledge/terms";
import type {
  GeneratedKnowledgeIndex,
  KnowledgeChunk,
  SourceExcerptKnowledgeChunk,
} from "../knowledge/types";
import {
  createStructuredHybridRetriever,
  evaluateStructuredProjectRoute,
} from "./structured-hybrid";

const INTENT_ALIASES = {
  overview: ["是什么作品", "what is"],
  problem: ["解决什么问题"],
  research: ["研究"],
  solution: ["方案"],
  architecture: ["系统架构"],
  interaction: ["交互"],
  technology: ["技术"],
  form: ["造型"],
  value: ["价值"],
  comparison: ["哪个项目"],
  contribution: ["贡献"],
} as const;

function sourceChunk(
  overrides: Partial<SourceExcerptKnowledgeChunk> = {},
): SourceExcerptKnowledgeChunk {
  const title = overrides.title ?? "INKSeat";
  const text = overrides.text ?? "INKSeat intelligent cabin experience";
  const aliases = overrides.aliases ?? ["INKSeat"];
  const tags = overrides.tags ?? ["portfolio"];
  const page = overrides.page ?? 1;
  const projectId = Object.hasOwn(overrides, "projectId")
    ? overrides.projectId
    : "inkseat";
  return {
    id: overrides.id ?? "inkseat:p1:c0",
    sourceId: overrides.sourceId ?? "inkseat",
    ...(projectId ? { projectId } : {}),
    page,
    title,
    text,
    terms: overrides.terms ?? buildTerms([title, ...aliases, ...tags, text].join(" ")),
    aliases,
    tags,
    citationLabel: overrides.citationLabel ?? title,
    publicHref: overrides.publicHref ?? "/portfolio/inkseat",
    knowledgeKind: "source-excerpt",
    intents: [],
    informationDensity: overrides.informationDensity ?? "medium",
    pageRole: overrides.pageRole ?? "detail",
    evidencePages: [page],
    questionAliases: [],
  };
}

function authoredClaim(overrides: Partial<KnowledgeChunk> = {}): KnowledgeChunk {
  const title = overrides.title ?? "INKSeat";
  const text = overrides.text ?? "INKSeat is an intelligent cabin display system.";
  const aliases = overrides.aliases ?? ["INKSeat"];
  const tags = overrides.tags ?? ["portfolio"];
  return {
    id: overrides.id ?? "inkseat:claim:overview",
    sourceId: overrides.sourceId ?? "inkseat",
    projectId: overrides.projectId ?? "inkseat",
    page: overrides.page ?? 1,
    title,
    text,
    terms: overrides.terms ?? buildTerms([title, ...aliases, ...tags, text].join(" ")),
    aliases,
    tags,
    citationLabel: overrides.citationLabel ?? title,
    publicHref: overrides.publicHref ?? "/portfolio/inkseat",
    knowledgeKind: "authored-claim",
    intents: overrides.intents ?? ["overview"],
    informationDensity: overrides.informationDensity ?? "high",
    pageRole: overrides.pageRole ?? "overview",
    provenance: overrides.provenance ?? "document_fact",
    evidencePages: overrides.evidencePages ?? [1],
    questionAliases: overrides.questionAliases ?? ["INKSeat是什么作品"],
  } as KnowledgeChunk;
}

function index(chunks: readonly KnowledgeChunk[]): GeneratedKnowledgeIndex {
  return {
    version: 2,
    sourceDigests: {},
    authoredDigest: "a".repeat(64),
    intentAliases: INTENT_ALIASES,
    chunks,
  };
}

describe("structured hybrid retriever", () => {
  test("ranks the reviewed INKSeat overview ahead of sparse PDF excerpts", async () => {
    const retriever = createStructuredHybridRetriever(
      generatedIndex as GeneratedKnowledgeIndex,
    );

    const results = await retriever.search("inkseat是什么作品", { locale: "zh", limit: 3 });

    expect(results[0]?.chunk.id).toBe("inkseat:claim:inkseat.overview");
    expect(results.slice(0, 3).map(({ chunk }) => chunk.id)).not.toContain("inkseat:p14:c0");
    expect(results.slice(0, 3).map(({ chunk }) => chunk.id)).not.toContain("inkseat:p18:c0");
  });

  test("ranks the reviewed architecture claim and retains its source page", async () => {
    const retriever = createStructuredHybridRetriever(
      generatedIndex as GeneratedKnowledgeIndex,
    );

    const results = await retriever.search("INKSeat的系统架构是什么", { locale: "zh" });

    expect(results[0]?.chunk.id).toBe("inkseat:claim:inkseat.architecture");
    expect(results[0]?.chunk.evidencePages).toContain(8);
  });

  test("diversifies real comparison evidence across portfolio projects", async () => {
    const retriever = createStructuredHybridRetriever(
      generatedIndex as GeneratedKnowledgeIndex,
    );

    const results = await retriever.search("哪个项目最能体现系统思考？", {
      locale: "zh",
      limit: 8,
    });

    expect(new Set(results.map(({ chunk }) => chunk.sourceId)).size).toBeGreaterThanOrEqual(2);
    expect(results.every(({ chunk }) => chunk.knowledgeKind === "authored-claim")).toBe(true);
  });

  test("diversifies a detailed INKSeat answer across primary intents", async () => {
    const retriever = createStructuredHybridRetriever(
      generatedIndex as GeneratedKnowledgeIndex,
    );

    const results = await retriever.search("详细介绍INKSeat", {
      locale: "zh",
      limit: 8,
    });

    expect(results).toHaveLength(3);
    expect(results.every(({ chunk }) => chunk.knowledgeKind === "authored-claim")).toBe(true);
    expect(new Set(results.map(({ chunk }) => {
      if (chunk.knowledgeKind !== "authored-claim") {
        throw new Error("Detailed project evidence must be an authored claim");
      }
      return chunk.intents[0];
    })).size).toBeGreaterThanOrEqual(3);
  });

  test("selects the best overview claim first for an explicitly routed project", async () => {
    const retriever = createStructuredHybridRetriever(index([
      authoredClaim({
        id: "inkseat:claim:overview",
        text: "INKSeat is an intelligent cabin display system.",
        pageRole: "overview",
        intents: ["overview"],
      }),
      authoredClaim({
        id: "inkseat:claim:detail",
        text: "INKSeat 的详细介绍和结构信息。",
        pageRole: "detail",
        intents: ["architecture"],
        questionAliases: ["INKSeat是什么作品的详细介绍"],
      }),
    ]), { minimumScore: 0 });

    const results = await retriever.search("INKSeat是什么作品的详细介绍", { locale: "zh" });

    expect(results[0]?.chunk.id).toBe("inkseat:claim:overview");
  });

  test("deduplicates authored claims with identical normalized text", async () => {
    const retriever = createStructuredHybridRetriever(index([
      authoredClaim({
        id: "inkseat:claim:duplicate-a",
        text: "INKSeat 是一个智能座舱信息系统。",
        evidencePages: [3],
      }),
      authoredClaim({
        id: "inkseat:claim:duplicate-b",
        text: "  INKSeat 是一个智能座舱信息系统！ ",
        evidencePages: [7],
      }),
    ]), { minimumScore: 0 });

    const results = await retriever.search("INKSeat", { locale: "zh" });

    expect(results.map(({ chunk }) => chunk.id)).toEqual([
      "inkseat:claim:duplicate-a",
    ]);
  });

  test("treats same-numbered evidence pages from different projects as distinct", async () => {
    const retriever = createStructuredHybridRetriever(index([
      authoredClaim({
        id: "alpha:claim:page-1",
        sourceId: "alpha",
        projectId: "alpha",
        title: "哪个项目 Alpha overview",
        aliases: ["Alpha"],
        text: "Alpha overview.",
        intents: ["overview", "comparison"],
        evidencePages: [1],
      }),
      authoredClaim({
        id: "alpha:claim:page-2",
        sourceId: "alpha",
        projectId: "alpha",
        title: "Alpha",
        aliases: ["Alpha"],
        text: "Alpha second evidence.",
        intents: ["research", "comparison"],
        evidencePages: [2],
      }),
      authoredClaim({
        id: "beta:claim:page-1",
        sourceId: "beta",
        projectId: "beta",
        title: "哪个项目 Beta architecture",
        aliases: ["Beta"],
        text: "Beta architecture.",
        intents: ["architecture", "comparison"],
        evidencePages: [1],
      }),
    ]), { minimumScore: 0 });

    const results = await retriever.search("哪个项目", { locale: "zh", limit: 2 });

    expect(results.map(({ chunk }) => chunk.id)).toEqual([
      "alpha:claim:page-1",
      "beta:claim:page-1",
    ]);
  });

  test("applies the explicit negative route rule and excludes another project's PDF", async () => {
    const retriever = createStructuredHybridRetriever(index([
      authoredClaim(),
      sourceChunk({
        id: "emovue:p1:c0",
        sourceId: "emovue",
        projectId: "emovue",
        title: "INKSeat architecture evidence",
        aliases: ["INKSeat"],
        text: "INKSeat architecture ".repeat(80),
        informationDensity: "high",
      }),
    ]), { minimumScore: 0 });

    const results = await retriever.search("INKSeat的系统架构是什么", { locale: "zh" });

    expect(evaluateStructuredProjectRoute("emovue", ["inkseat"])).toEqual({
      score: -20,
      eligible: false,
    });
    expect(results.map(({ chunk }) => chunk.id)).not.toContain("emovue:p1:c0");
  });

  test("penalizes low-density pages without deleting them", async () => {
    const retriever = createStructuredHybridRetriever(index([
      authoredClaim(),
      sourceChunk({ id: "inkseat:p2:c0", page: 2, informationDensity: "high" }),
      sourceChunk({ id: "inkseat:p3:c0", page: 3, informationDensity: "low" }),
    ]), { minimumScore: 0 });

    const results = await retriever.search("INKSeat", { locale: "en" });
    const scoreById = new Map(results.map(({ chunk, score }) => [chunk.id, score]));

    expect(scoreById.get("inkseat:p2:c0")).toBeGreaterThan(scoreById.get("inkseat:p3:c0") ?? 0);
    expect(scoreById.has("inkseat:p3:c0")).toBe(true);
  });

  test("keeps contribution retrieval to owner statements and public profile evidence", async () => {
    const profile = sourceChunk({
      id: "profile:p1:c0",
      sourceId: "profile",
      projectId: undefined,
      title: "赵实旷",
      aliases: ["赵实旷"],
      text: "赵实旷的公开作品集简介。",
      pageRole: "profile",
    });
    const ownerStatement = {
      ...authoredClaim({
        id: "inkseat:claim:core-contributor",
        pageRole: "owner-confirmed",
        questionAliases: ["赵实旷在INKSeat中做了什么"],
        text: "据作品所有者确认，赵实旷是 INKSeat 团队项目的核心贡献者。",
      }),
      intents: ["contribution"],
      provenance: "owner_statement",
      evidencePages: [],
    } as KnowledgeChunk;
    const retriever = createStructuredHybridRetriever(index([
      authoredClaim(),
      sourceChunk({ id: "inkseat:p2:c0", page: 2, text: "赵实旷参与 INKSeat 的展示。" }),
      profile,
      ownerStatement,
    ]));

    const results = await retriever.search("赵实旷在INKSeat中做了什么", { locale: "zh" });

    expect(results.map(({ chunk }) => chunk.id)).toContain("inkseat:claim:core-contributor");
    expect(results.map(({ chunk }) => chunk.id)).not.toContain("inkseat:p2:c0");
    expect(results.every(({ chunk }) =>
      chunk.sourceId === "profile" || chunk.sourceId === "resume" || chunk.provenance === "owner_statement",
    )).toBe(true);
  });

  test.each([
    "赵实旷的贡献",
    "赵实旷做了什么",
  ])("keeps generic personal contribution evidence public and owner-confirmed: %s", async (query) => {
    const retriever = createStructuredHybridRetriever(
      generatedIndex as GeneratedKnowledgeIndex,
    );

    const results = await retriever.search(query, { locale: "zh" });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every(({ chunk }) =>
      (chunk.knowledgeKind === "authored-claim" && chunk.provenance === "owner_statement")
      || (chunk.knowledgeKind === "source-excerpt"
        && (chunk.sourceId === "profile" || chunk.sourceId === "resume")),
    )).toBe(true);
    expect(results.some(({ chunk }) =>
      chunk.knowledgeKind === "source-excerpt" && chunk.projectId !== undefined,
    )).toBe(false);
    expect(results.some(({ chunk }) =>
      chunk.knowledgeKind === "authored-claim" && chunk.provenance !== "owner_statement",
    )).toBe(false);
  });

  test("fails closed if a candidate contribution claim reaches the published index", () => {
    const candidate = {
      ...authoredClaim({ id: "inkseat:claim:private-candidate" }),
      intents: ["contribution"],
      provenance: "candidate_contribution",
    } as unknown as KnowledgeChunk;

    expect(() => createStructuredHybridRetriever(index([candidate]))).toThrow(
      "Candidate contribution claims cannot be retrieved",
    );
  });

  test("rejects unrelated questions and preserves retriever boundaries", async () => {
    const retriever = createStructuredHybridRetriever(index([authoredClaim()]));

    await expect(retriever.search("quantum tax law", { locale: "en" })).resolves.toEqual([]);
    await expect(retriever.search("INKSeat", { locale: "en", limit: -1 })).rejects.toThrow(
      "limit must be a finite non-negative integer",
    );
    await expect(retriever.search("INKSeat", { locale: "en", limit: 1.5 })).rejects.toThrow(
      "limit must be a finite non-negative integer",
    );
    await expect(retriever.search("INKSeat", { locale: "en", limit: Number.POSITIVE_INFINITY })).rejects.toThrow(
      "limit must be a finite non-negative integer",
    );

    const results = await retriever.search("INKSeat", { locale: "en" });
    expect(results.every(({ score }) => Number.isFinite(score) && score >= 0)).toBe(true);
    expect(() => createStructuredHybridRetriever(index([]), { maxResults: 0 })).toThrow();
    expect(() => createStructuredHybridRetriever(index([]), { maxPerSource: -1 })).toThrow();
    expect(() => createStructuredHybridRetriever(index([]), { minimumScore: Number.NaN })).toThrow();
  });
});
