import { describe, expect, test } from "vitest";

import type {
  GeneratedKnowledgeIndex,
  KnowledgeChunk,
  SourceExcerptKnowledgeChunk,
} from "../knowledge/types";
import generatedIndex from "../knowledge/generated-index.json";
import { createQueryRouter } from "./query-routing";

const INTENT_ALIASES = {
  overview: ["是什么", "介绍", "what is", "introduce"],
  problem: ["解决什么问题", "problem"],
  research: ["research"],
  solution: ["solution"],
  architecture: ["系统架构", "architecture", "system"],
  interaction: ["拍摄", "interaction"],
  technology: ["感知情绪", "technology"],
  form: ["form"],
  value: ["value"],
  comparison: ["哪个项目", "system thinking"],
  contribution: ["contribute", "contribution"],
} as const;

function projectChunk(
  projectId: string,
  aliases: readonly string[],
  overrides: Partial<SourceExcerptKnowledgeChunk> = {},
): SourceExcerptKnowledgeChunk {
  const title = overrides.title ?? projectId;
  return {
    id: overrides.id ?? `${projectId}:p1:c0`,
    sourceId: overrides.sourceId ?? projectId,
    projectId,
    page: overrides.page ?? 1,
    title,
    text: overrides.text ?? title,
    terms: overrides.terms ?? [],
    aliases,
    tags: overrides.tags ?? [],
    citationLabel: overrides.citationLabel ?? title,
    publicHref: overrides.publicHref ?? `/portfolio/${projectId}`,
    knowledgeKind: "source-excerpt",
    intents: [],
    informationDensity: "medium",
    pageRole: "project",
    evidencePages: [1],
    questionAliases: [],
  };
}

function index(
  chunks: readonly KnowledgeChunk[],
  intentAliases: GeneratedKnowledgeIndex["intentAliases"] = INTENT_ALIASES,
): GeneratedKnowledgeIndex {
  return {
    version: 2,
    sourceDigests: {},
    authoredDigest: "a".repeat(64),
    intentAliases,
    chunks,
  };
}

describe("query routing", () => {
  test.each([
    ["INKSeat是什么", ["inkseat"], ["overview"]],
    ["INKSeat系统架构", ["inkseat"], ["architecture"]],
    ["EMOVUE如何感知情绪并拍摄", ["emovue"], ["interaction", "technology"]],
    ["UroSense解决什么问题", ["urosense"], ["problem"]],
    ["What is First Fly", ["first-fly"], ["overview"]],
    ["What did Zhao contribute to Atempo", ["atempo"], ["contribution"]],
    ["哪个项目最能体现系统思考", [
      "inkseat",
      "emovue",
      "evolution-fruit",
      "atempo",
      "urosense",
      "first-fly",
    ], ["comparison"]],
  ] as const)("routes the generated v2 index query %s", (query, projectIds, intents) => {
    expect(createQueryRouter(generatedIndex as GeneratedKnowledgeIndex).route(query)).toMatchObject({
      projectIds,
      intents,
    });
  });

  test("routes INKSeat overview through its complete alias and overview phrase", () => {
    const route = createQueryRouter(index([
      projectChunk("inkseat", ["INKSeat", "ink seat"]),
    ])).route("INKSeat是什么");

    expect(route).toMatchObject({
      normalizedQuery: "inkseat 是什么",
      projectIds: ["inkseat"],
      intents: ["overview"],
    });
  });

  test("uses index intent phrases for an explicit project's architecture", () => {
    const route = createQueryRouter(index([
      projectChunk("inkseat", ["INKSeat"]),
    ])).route("INKSeat系统架构");

    expect(route).toMatchObject({ projectIds: ["inkseat"], intents: ["architecture"] });
  });

  test("combines only intent phrases supplied by the index", () => {
    const route = createQueryRouter(index([
      projectChunk("emovue", ["EMOVUE"]),
    ])).route("EMOVUE如何感知情绪并拍摄");

    expect(route).toMatchObject({
      projectIds: ["emovue"],
      intents: ["interaction", "technology"],
    });
  });

  test("routes UroSense problem language without a project-specific rule", () => {
    const route = createQueryRouter(index([
      projectChunk("urosense", ["UroSense"]),
    ])).route("UroSense解决什么问题");

    expect(route).toMatchObject({ projectIds: ["urosense"], intents: ["problem"] });
  });

  test("normalizes an English overview question before alias matching", () => {
    const route = createQueryRouter(index([
      projectChunk("first-fly", ["First Fly"]),
    ])).route("What is First Fly?");

    expect(route).toMatchObject({
      normalizedQuery: "what is first fly",
      projectIds: ["first-fly"],
      intents: ["overview"],
    });
  });

  test("routes contribution language from index aliases", () => {
    const route = createQueryRouter(index([
      projectChunk("atempo", ["Atempo"]),
    ])).route("What did Zhao contribute to Atempo?");

    expect(route).toMatchObject({ projectIds: ["atempo"], intents: ["contribution"] });
  });

  test("expands a global comparison question to projects in index order", () => {
    const route = createQueryRouter(index([
      projectChunk("first-fly", ["First Fly"]),
      projectChunk("inkseat", ["INKSeat"]),
    ])).route("哪个项目最能体现系统思考？");

    expect(route).toMatchObject({
      projectIds: ["first-fly", "inkseat"],
      intents: ["comparison"],
    });
  });

  test("normalizes full-width punctuation, casing, and duplicate terms deterministically", () => {
    const route = createQueryRouter(index([
      projectChunk("inkseat", ["INKSeat"]),
    ])).route(" ＩＮＫＳＥＡＴ，inkseat！ 是什么 ");

    expect(route).toEqual({
      normalizedQuery: "inkseat inkseat 是什么",
      queryTerms: ["inkseat", "是什", "什么"],
      projectIds: ["inkseat"],
      intents: ["overview"],
    });
  });

  test("prefers complete aliases and supports multiple explicit projects", () => {
    const router = createQueryRouter(index([
      projectChunk("inkseat", ["INKSeat", "Seat"]),
      projectChunk("first-fly", ["First Fly"]),
    ]));

    expect(router.route("seat design")).toMatchObject({ projectIds: [] });
    expect(router.route("INKSeat and First Fly")).toMatchObject({
      projectIds: ["inkseat", "first-fly"],
    });
  });

  test("does not route generic system design or unrelated questions", () => {
    const router = createQueryRouter(index([
      projectChunk("inkseat", ["INKSeat"]),
    ]));

    expect(router.route("system design")).toMatchObject({ projectIds: [], intents: [] });
    expect(router.route("quantum tax law")).toMatchObject({ projectIds: [], intents: [] });
  });

  test("uses question aliases only on exact normalized equality", () => {
    const claim = {
      ...projectChunk("atempo", ["Atempo"]),
      id: "atempo:claim:contribution",
      knowledgeKind: "authored-claim",
      intents: ["contribution"],
      informationDensity: "high",
      pageRole: "owner-confirmed",
      questionAliases: ["What was Zhao's contribution to Atempo?"],
    } as unknown as KnowledgeChunk;
    const router = createQueryRouter(index([claim]));

    expect(router.route("WHAT WAS ZHAO'S CONTRIBUTION TO ATEMPO!")).toMatchObject({
      projectIds: ["atempo"],
      intents: ["contribution"],
    });
    expect(router.route("What was Zhao's role in Atempo?")).toMatchObject({
      projectIds: ["atempo"],
      intents: [],
    });
  });

  test("does not mutate its index and rejects malformed v2 project aliases", () => {
    const input = index([projectChunk("inkseat", ["INKSeat"])]);
    const before = JSON.stringify(input);

    createQueryRouter(input).route("INKSeat是什么");

    expect(JSON.stringify(input)).toBe(before);
    expect(() => createQueryRouter({
      ...input,
      chunks: [{ ...input.chunks[0], aliases: [] }],
    } as GeneratedKnowledgeIndex)).toThrow("Invalid v2 project aliases");
  });
});
