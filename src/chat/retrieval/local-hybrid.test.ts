import { describe, expect, test } from "vitest";

import { buildTerms } from "../knowledge/terms";
import type {
  GeneratedKnowledgeIndex,
  SourceExcerptKnowledgeChunk,
} from "../knowledge/types";
import { createLocalHybridRetriever } from "./local-hybrid";

const INTENT_ALIASES = {
  overview: [],
  problem: [],
  research: [],
  solution: [],
  architecture: [],
  interaction: [],
  technology: [],
  form: [],
  value: [],
  comparison: [],
  contribution: [],
} as const;

function chunk(
  overrides: Partial<SourceExcerptKnowledgeChunk> = {},
): SourceExcerptKnowledgeChunk {
  const title = overrides.title ?? "Portfolio case study";
  const text = overrides.text ?? "A product design case study.";
  const aliases = overrides.aliases ?? [];
  const tags = overrides.tags ?? ["product"];
  const page = overrides.page ?? 1;
  return {
    id: overrides.id ?? "source:p1:c0",
    sourceId: overrides.sourceId ?? "source",
    page,
    title,
    text,
    terms: overrides.terms ?? buildTerms([title, ...aliases, ...tags, text].join(" ")),
    aliases,
    tags,
    citationLabel: overrides.citationLabel ?? title,
    publicHref: overrides.publicHref ?? "/portfolio/source",
    ...(overrides.projectId ? { projectId: overrides.projectId } : {}),
    knowledgeKind: "source-excerpt",
    intents: [],
    informationDensity: overrides.informationDensity ?? "medium",
    pageRole: overrides.pageRole ?? "profile",
    evidencePages: [page],
    questionAliases: [],
  };
}

function index(
  chunks: readonly SourceExcerptKnowledgeChunk[],
): GeneratedKnowledgeIndex {
  return {
    version: 2,
    sourceDigests: {},
    authoredDigest: "a".repeat(64),
    intentAliases: INTENT_ALIASES,
    chunks,
  };
}

describe("local hybrid retriever", () => {
  test.each(["ink seat", "INKSeat"])(
    "ranks the INKSeat title and alias first for %s",
    async (query) => {
      const retriever = createLocalHybridRetriever(
        index([
          chunk({
            id: "inkseat:p1:c0",
            sourceId: "inkseat",
            title: "INKSeat",
            aliases: ["ink seat", "智能座椅"],
            text: "A wearable interface concept.",
          }),
          chunk({
            id: "other:p1:c0",
            sourceId: "other",
            title: "Seat research",
            text: "Research about an airport seat.",
          }),
        ]),
      );

      const results = await retriever.search(query, { locale: "en" });

      expect(results[0]?.chunk.id).toBe("inkseat:p1:c0");
    },
  );

  test("boosts system/product tags and aliases for a Chinese system-thinking query", async () => {
    const retriever = createLocalHybridRetriever(
      index([
        chunk({
          id: "systems:p1:c0",
          sourceId: "systems",
          aliases: ["系统思考", "system thinking"],
          tags: ["system", "product"],
          text: "A research process for connected product services.",
        }),
        chunk({
          id: "visual:p1:c0",
          sourceId: "visual",
          tags: ["visual"],
          text: "An illustration and typography exploration.",
        }),
      ]),
    );

    const results = await retriever.search("系统思考", { locale: "zh" });

    expect(results[0]?.chunk.id).toBe("systems:p1:c0");
  });

  test("retrieves Chinese chunk text through an English bilingual alias", async () => {
    const retriever = createLocalHybridRetriever(
      index([
        chunk({
          id: "chinese:p1:c0",
          sourceId: "chinese",
          title: "服务设计",
          aliases: ["system thinking", "系统思考"],
          text: "通过系统思考连接产品、服务与用户旅程。",
        }),
      ]),
    );

    const results = await retriever.search("How do you use system thinking?", {
      locale: "en",
    });

    expect(results.map(({ chunk: resultChunk }) => resultChunk.id)).toEqual([
      "chinese:p1:c0",
    ]);
  });

  test("caps each source at three of eight results", async () => {
    const chunks = ["a", "b", "c", "d"].flatMap((sourceId) =>
      Array.from({ length: 4 }, (_, number) =>
        chunk({
          id: `${sourceId}:p1:c${number}`,
          sourceId,
          title: `Alpha project ${sourceId}-${number}`,
          aliases: ["alpha"],
          text: "Alpha product research.",
        }),
      ),
    );
    const retriever = createLocalHybridRetriever(index(chunks), {
      minimumScore: 0,
    });

    const results = await retriever.search("alpha", { locale: "en", limit: 8 });
    const counts = results.reduce<Record<string, number>>(
      (all, { chunk: resultChunk }) => {
        all[resultChunk.sourceId] = (all[resultChunk.sourceId] ?? 0) + 1;
        return all;
      },
      {},
    );

    expect(results).toHaveLength(8);
    expect(Object.values(counts).every((count) => count <= 3)).toBe(true);
  });

  test("clamps the requested result limit to the configured maximum", async () => {
    const retriever = createLocalHybridRetriever(
      index(
        Array.from({ length: 7 }, (_, number) =>
          chunk({
            id: `source-${number}:p1:c0`,
            sourceId: `source-${number}`,
            aliases: ["alpha"],
            text: "alpha",
          }),
        ),
      ),
      { minimumScore: 0, maxResults: 5 },
    );

    await expect(retriever.search("alpha", { locale: "en", limit: 99 })).resolves.toHaveLength(5);
    await expect(retriever.search("alpha", { locale: "en", limit: 2 })).resolves.toHaveLength(2);
  });

  test("rejects an invalid requested result limit instead of silently changing it", async () => {
    const retriever = createLocalHybridRetriever(index([chunk({ aliases: ["alpha"] })]));

    await expect(
      retriever.search("alpha", { locale: "en", limit: -1 }),
    ).rejects.toThrow("limit must be a finite non-negative integer");
    await expect(
      retriever.search("alpha", { locale: "en", limit: 1.5 }),
    ).rejects.toThrow("limit must be a finite non-negative integer");
    await expect(
      retriever.search("alpha", { locale: "en", limit: Number.POSITIVE_INFINITY }),
    ).rejects.toThrow("limit must be a finite non-negative integer");
  });

  test("rejects unrelated noise at the default minimum score", async () => {
    const retriever = createLocalHybridRetriever(
      index([
        chunk({
          id: "generic:p1:c0",
          sourceId: "generic",
          tags: ["product", "design"],
          text: "Product design research and portfolio process.",
        }),
      ]),
    );

    await expect(
      retriever.search("quantum tax law", { locale: "en" }),
    ).resolves.toEqual([]);
  });

  test("keeps a career topic after an English question wrapper", async () => {
    const retriever = createLocalHybridRetriever(
      index([
        chunk({
          id: "career:p1:c0",
          sourceId: "career",
          title: "Career opportunities",
          aliases: ["career opportunities"],
          text: "A portfolio overview.",
        }),
      ]),
    );

    const results = await retriever.search(
      "Can you tell me about career opportunities?",
      { locale: "en" },
    );

    expect(results.map(({ chunk: resultChunk }) => resultChunk.id)).toEqual([
      "career:p1:c0",
    ]);
  });

  test("filters pure English function-word wrappers", async () => {
    const retriever = createLocalHybridRetriever(
      index([
        chunk({
          id: "about:p1:c0",
          sourceId: "about",
          title: "About the portfolio",
          text: "Portfolio overview.",
        }),
      ]),
      { minimumScore: 0 },
    );

    await expect(
      retriever.search("Can you tell me about it?", { locale: "en" }),
    ).resolves.toEqual([]);
  });

  test("returns no result for an unrelated natural-language question", async () => {
    const retriever = createLocalHybridRetriever(
      index([
        chunk({
          id: "career:p1:c0",
          sourceId: "career",
          title: "Career opportunities",
          aliases: ["career opportunities"],
          text: "A portfolio overview.",
        }),
      ]),
    );

    await expect(
      retriever.search("Are you free on weekends?", { locale: "en" }),
    ).resolves.toEqual([]);
  });

  test("keeps Chinese semantic CJK bigrams after a polite wrapper", async () => {
    expect(buildTerms("我想寻找机会")).toEqual([
      "我想",
      "想寻",
      "寻找",
      "找机",
      "机会",
    ]);
    const retriever = createLocalHybridRetriever(
      index([
        chunk({
          id: "career-zh:p1:c0",
          sourceId: "career-zh",
          title: "寻找",
          aliases: ["寻找"],
          text: "作品集概览。",
        }),
        chunk({
          id: "opportunity-zh:p1:c0",
          sourceId: "opportunity-zh",
          title: "机会",
          aliases: ["机会"],
          text: "作品集概览。",
        }),
      ]),
    );

    const results = await retriever.search("我想寻找机会", { locale: "zh" });

    expect(results.map(({ chunk: resultChunk }) => resultChunk.id)).toEqual([
      "career-zh:p1:c0",
      "opportunity-zh:p1:c0",
    ]);
  });

  test.each([
    { id: "question-title:p1:c0", sourceId: "question-title", title: "What opportunities are you looking for?" },
    { id: "question-alias:p1:c0", sourceId: "question-alias", aliases: ["What opportunities are you looking for?"] },
    { id: "question-source:p1:c0", sourceId: "What opportunities are you looking for?" },
  ])("keeps the unfiltered full phrase for exact $id matching", async (overrides) => {
    const retriever = createLocalHybridRetriever(
      index([
        chunk({
          ...overrides,
          text: "A portfolio overview.",
        }),
      ]),
    );

    const results = await retriever.search("What opportunities are you looking for?", {
      locale: "en",
    });

    expect(results.map(({ chunk: resultChunk }) => resultChunk.id)).toEqual([
      overrides.id,
    ]);
  });

  test("breaks equal scores by stable chunk ID", async () => {
    const retriever = createLocalHybridRetriever(
      index([
        chunk({ id: "z:p1:c0", sourceId: "z", aliases: ["alpha"], text: "alpha" }),
        chunk({ id: "a:p1:c0", sourceId: "a", aliases: ["alpha"], text: "alpha" }),
      ]),
      { minimumScore: 0 },
    );

    const results = await retriever.search("alpha", { locale: "en" });

    expect(results.map(({ chunk: resultChunk }) => resultChunk.id)).toEqual([
      "a:p1:c0",
      "z:p1:c0",
    ]);
  });

  test("does not return zero-score chunks when minimumScore is zero", async () => {
    const retriever = createLocalHybridRetriever(index([chunk()]), {
      minimumScore: 0,
    });

    await expect(retriever.search("alpha", { locale: "en" })).resolves.toEqual([]);
  });

  test("keeps a body-only BM25 score unchanged by metadata-only terms", async () => {
    const target = chunk({
      id: "target:p1:c0",
      sourceId: "target",
      title: "Target",
      text: "alpha",
    });
    const withoutMetadata = createLocalHybridRetriever(
      index([
        target,
        chunk({ id: "plain:p1:c0", sourceId: "plain", title: "Plain", text: "beta" }),
      ]),
      { minimumScore: 0 },
    );
    const withMetadata = createLocalHybridRetriever(
      index([
        target,
        chunk({
          id: "metadata:p1:c0",
          sourceId: "metadata",
          title: "Metadata",
          aliases: ["alpha"],
          text: "beta",
        }),
      ]),
      { minimumScore: 0 },
    );

    const scoreWithoutMetadata = (await withoutMetadata.search("alpha", { locale: "en" })).find(
      ({ chunk: resultChunk }) => resultChunk.id === "target:p1:c0",
    )?.score;
    const scoreWithMetadata = (await withMetadata.search("alpha", { locale: "en" })).find(
      ({ chunk: resultChunk }) => resultChunk.id === "target:p1:c0",
    )?.score;

    expect(scoreWithMetadata).toBe(scoreWithoutMetadata);
  });

  test("returns no results for an empty or whitespace-only query", async () => {
    const retriever = createLocalHybridRetriever(index([chunk()]));

    await expect(retriever.search("", { locale: "en" })).resolves.toEqual([]);
    await expect(retriever.search(" \n\t ", { locale: "zh" })).resolves.toEqual([]);
  });

  test("uses Task 5 normalization, punctuation, casing, and CJK bigrams", async () => {
    expect(buildTerms("INKSeat，系统思考!")).toEqual([
      "inkseat",
      "系统",
      "统思",
      "思考",
    ]);
    const retriever = createLocalHybridRetriever(
      index([
        chunk({
          id: "normalized:p1:c0",
          sourceId: "normalized",
          aliases: ["INKSeat", "系统思考"],
          text: "A bilingual concept.",
        }),
      ]),
    );

    const punctuated = await retriever.search("inkseat，系统思考!", { locale: "zh" });
    const normalized = await retriever.search("INKSeat 系统思考", { locale: "zh" });

    expect(punctuated).toEqual(normalized);
  });

  test("returns finite non-negative scores and rejects invalid configuration", async () => {
    const retriever = createLocalHybridRetriever(
      index([chunk({ aliases: ["alpha"], text: "alpha alpha alpha" })]),
      { minimumScore: 0 },
    );

    const results = await retriever.search("alpha", { locale: "en" });

    expect(results.every(({ score }) => Number.isFinite(score) && score >= 0)).toBe(true);
    expect(() => createLocalHybridRetriever(index([]), { maxResults: 0 })).toThrow();
    expect(() => createLocalHybridRetriever(index([]), { maxPerSource: -1 })).toThrow();
    expect(() => createLocalHybridRetriever(index([]), { minimumScore: Number.NaN })).toThrow();
  });
});
