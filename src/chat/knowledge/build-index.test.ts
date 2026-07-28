// @vitest-environment node

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test, vi } from "vitest";

import { profile } from "../../content/portfolio";
import {
  assertPrivacySafe,
  buildKnowledgeIndex,
  buildTerms,
  chunkExtractedPages,
  extractPdfSourcesWithSharedOcr,
  parseKnowledgeIndexMode,
  publishAtomically,
  sha256,
  stableSerialize,
  validateGeneratedIndex,
} from "./build-index";

import type {
  AuthoredClaimKnowledgeChunk,
  ExtractedPage,
  GeneratedKnowledgeIndex,
  KnowledgeChunk,
  KnowledgeSource,
} from "./types";
import type {
  KnowledgeIntent,
  PageKnowledge,
} from "./authored/types";

const ALL_INTENTS = [
  "overview",
  "problem",
  "research",
  "solution",
  "architecture",
  "interaction",
  "technology",
  "form",
  "value",
  "comparison",
  "contribution",
] as const satisfies readonly KnowledgeIntent[];
const AUTHORED_DIGEST = "b".repeat(64);

function intentAliases(): Readonly<Record<KnowledgeIntent, readonly string[]>> {
  return Object.fromEntries(
    ALL_INTENTS.map((intent) => [intent, [`${intent} alias`]]),
  ) as unknown as Readonly<Record<KnowledgeIntent, readonly string[]>>;
}

function pageKnowledge(
  projectId: string,
  pageNumber: number,
  overrides: Partial<PageKnowledge> = {},
): PageKnowledge {
  return {
    page: pageNumber,
    role: pageNumber === 1 ? "overview" : "detail",
    informationDensity: pageNumber === 1 ? "high" : "low",
    visualSummary: "Synthetic page",
    entities: [],
    relationships: [],
    claimIds: [],
    ...overrides,
  };
}

function pageKnowledgeMap(
  projectId = "project",
  pageCount = 2,
): ReadonlyMap<string, PageKnowledge> {
  return new Map(
    Array.from({ length: pageCount }, (_, index) => {
      const pageNumber = index + 1;
      return [
        `${projectId}:p${pageNumber}`,
        pageKnowledge(projectId, pageNumber),
      ] as const;
    }),
  );
}

function pageKnowledgeForSources(
  sources: readonly KnowledgeSource[],
): ReadonlyMap<string, PageKnowledge> {
  const result = new Map<string, PageKnowledge>();
  for (const source of sources) {
    if (source.kind !== "project-pdf" || !source.projectId) continue;
    for (const [key, value] of pageKnowledgeMap(
      source.projectId,
      source.pageCount ?? 0,
    )) {
      result.set(key, value);
    }
  }
  return result;
}

function authoredDocumentChunk(
  overrides: Partial<AuthoredClaimKnowledgeChunk> = {},
): AuthoredClaimKnowledgeChunk {
  return {
    id: "project:claim:overview",
    sourceId: "project",
    projectId: "project",
    page: 1,
    title: "Project Title",
    text: "Authored project overview",
    terms: ["authored", "project", "overview"],
    aliases: ["Project Alias"],
    tags: ["AI Product"],
    citationLabel: "Project Title · p. 1",
    publicHref: "/projects/pdfs/project.pdf",
    knowledgeKind: "authored-claim",
    intents: ["overview"],
    informationDensity: "high",
    pageRole: "overview",
    provenance: "document_fact",
    evidencePages: [1],
    questionAliases: [],
    ...overrides,
  } as AuthoredClaimKnowledgeChunk;
}

function projectSource(
  overrides: Partial<KnowledgeSource> = {},
): KnowledgeSource {
  return {
    id: "project",
    kind: "project-pdf",
    title: "Project Title",
    aliases: ["Project Alias"],
    tags: ["AI Product"],
    filePath: "public/projects/pdfs/project.pdf",
    publicHref: "/projects/pdfs/project.pdf",
    projectId: "project",
    pageCount: 2,
    ...overrides,
  };
}

function page(pageNumber: number, text: string): ExtractedPage {
  return { page: pageNumber, text, method: "pdf-text" };
}

function validChunk(overrides: Partial<KnowledgeChunk> = {}): KnowledgeChunk {
  return {
    id: "project:p1:c0",
    sourceId: "project",
    projectId: "project",
    page: 1,
    title: "Project Title",
    text: "Searchable project content",
    terms: ["searchable", "project", "content"],
    aliases: ["Project Alias"],
    tags: ["AI Product"],
    citationLabel: "Project Title · p. 1",
    publicHref: "/projects/pdfs/project.pdf",
    knowledgeKind: "source-excerpt",
    intents: [],
    informationDensity: "high",
    pageRole: "overview",
    evidencePages: [1],
    questionAliases: [],
    ...overrides,
  } as KnowledgeChunk;
}

function canonicalIndex(
  sources: readonly KnowledgeSource[],
  pagesBySource: ReadonlyMap<string, readonly ExtractedPage[]>,
): GeneratedKnowledgeIndex {
  return buildIndex(
    sources,
    pagesBySource,
    Object.fromEntries(sources.map(({ id }) => [id, "a".repeat(64)])),
  );
}

function buildIndex(
  sources: readonly KnowledgeSource[],
  pagesBySource: ReadonlyMap<string, readonly ExtractedPage[]>,
  digests: Readonly<Record<string, string>>,
): GeneratedKnowledgeIndex {
  return buildKnowledgeIndex(
    sources,
    pagesBySource,
    digests,
    [],
    pageKnowledgeForSources(sources),
    intentAliases(),
    AUTHORED_DIGEST,
  );
}

function validateIndex(
  candidate: unknown,
  sources: readonly KnowledgeSource[],
  digests: Readonly<Record<string, string>>,
): GeneratedKnowledgeIndex {
  return validateGeneratedIndex(
    candidate,
    sources,
    digests,
    [],
    pageKnowledgeForSources(sources),
    intentAliases(),
    AUTHORED_DIGEST,
  );
}

function mutableCopy<T>(value: T): T {
  return structuredClone(value);
}

describe("knowledge index v2 contract", () => {
  test("publishes exact v2 keys with canonical raw metadata before authored claims", () => {
    const source = projectSource({ pageCount: 1 });
    const aliases = intentAliases();
    const authored = authoredDocumentChunk();
    const index = buildKnowledgeIndex(
      [source],
      new Map([[source.id, [page(1, "Searchable project content")]]]),
      { project: "a".repeat(64) },
      [authored],
      pageKnowledgeMap("project", 1),
      aliases,
      AUTHORED_DIGEST,
    );

    expect(Object.keys(index).sort()).toEqual([
      "authoredDigest",
      "chunks",
      "intentAliases",
      "sourceDigests",
      "version",
    ]);
    expect(index.version).toBe(2);
    expect(index.authoredDigest).toBe(AUTHORED_DIGEST);
    expect(index.intentAliases).toEqual(aliases);
    expect(index.chunks.map(({ id }) => id)).toEqual([
      "project:p1:c0",
      "project:claim:overview",
    ]);
    expect(index.chunks[0]).toMatchObject({
      knowledgeKind: "source-excerpt",
      intents: [],
      informationDensity: "high",
      pageRole: "overview",
      evidencePages: [1],
      questionAliases: [],
    });
    expect(index.chunks[0]).not.toHaveProperty("provenance");
  });

  test("assigns fixed medium profile and resume metadata without provenance", () => {
    const profileSource: KnowledgeSource = {
      id: "profile",
      kind: "profile",
      title: "Public Profile",
      aliases: [],
      tags: [],
      publicHref: "#about",
      structuredText: "Structured public profile content",
    };
    const resumeSource: KnowledgeSource = {
      id: "resume",
      kind: "resume",
      title: "Public Resume",
      aliases: [],
      tags: [],
      filePath: "public/resume.pdf",
      publicHref: "/resume.pdf",
      pageCount: 1,
    };
    const index = buildKnowledgeIndex(
      [profileSource, resumeSource],
      new Map([
        [profileSource.id, [
          { page: 1, text: profileSource.structuredText!, method: "structured" },
        ]],
        [resumeSource.id, [page(1, "Resume content")]],
      ]),
      { profile: "a".repeat(64), resume: "c".repeat(64) },
      [],
      new Map(),
      intentAliases(),
      AUTHORED_DIGEST,
    );

    expect(index.chunks).toEqual([
      expect.objectContaining({
        sourceId: "profile",
        informationDensity: "medium",
        pageRole: "profile",
      }),
      expect.objectContaining({
        sourceId: "resume",
        informationDensity: "medium",
        pageRole: "resume",
      }),
    ]);
    expect(index.chunks.every((chunk) => !("provenance" in chunk))).toBe(true);
  });

  test("rejects duplicate raw/authored IDs and candidate provenance", () => {
    const source = projectSource({ pageCount: 1 });
    const common = [
      [source],
      new Map([[source.id, [page(1, "Searchable project content")]]]),
      { project: "a".repeat(64) },
    ] as const;
    const metadata = [
      pageKnowledgeMap("project", 1),
      intentAliases(),
      AUTHORED_DIGEST,
    ] as const;

    expect(() =>
      buildKnowledgeIndex(
        ...common,
        [authoredDocumentChunk({ id: "project:p1:c0" })],
        ...metadata,
      ),
    ).toThrow("Duplicate knowledge chunk ID: project:p1:c0");
    expect(() =>
      buildKnowledgeIndex(
        ...common,
        [
          authoredDocumentChunk(),
          authoredDocumentChunk(),
        ],
        ...metadata,
      ),
    ).toThrow("Duplicate knowledge chunk ID: project:claim:overview");
    expect(() =>
      buildKnowledgeIndex(
        ...common,
        [
          authoredDocumentChunk({
            provenance: "candidate_contribution",
          } as unknown as Partial<AuthoredClaimKnowledgeChunk>),
        ],
        ...metadata,
      ),
    ).toThrow(/candidate/i);
  });

  test("accepts an owner-confirmed authored claim with no page", () => {
    const source = projectSource({ pageCount: 1 });
    const owner = authoredDocumentChunk({
      id: "project:claim:owner",
      citationLabel: "Project Title · Owner-confirmed",
      provenance: "owner_statement",
      pageRole: "owner-confirmed",
      evidencePages: [],
    } as Partial<AuthoredClaimKnowledgeChunk>);
    delete (owner as { page?: number }).page;
    const index = buildKnowledgeIndex(
      [source],
      new Map([[source.id, [page(1, "Searchable project content")]]]),
      { project: "a".repeat(64) },
      [owner],
      pageKnowledgeMap("project", 1),
      intentAliases(),
      AUTHORED_DIGEST,
    );

    expect(index.chunks.at(-1)).toMatchObject({
      provenance: "owner_statement",
      pageRole: "owner-confirmed",
      evidencePages: [],
    });
    expect(index.chunks.at(-1)).not.toHaveProperty("page");
  });

  test("preserves authored dossier aliases that differ from manifest aliases", () => {
    const source = projectSource({ pageCount: 1 });
    const authored = authoredDocumentChunk({
      aliases: ["Dossier-specific alias"],
    });

    const index = buildKnowledgeIndex(
      [source],
      new Map([[source.id, [page(1, "Searchable project content")]]]),
      { project: "a".repeat(64) },
      [authored],
      pageKnowledgeMap("project", 1),
      intentAliases(),
      AUTHORED_DIGEST,
    );

    expect(index.chunks.at(-1)?.aliases).toEqual(["Dossier-specific alias"]);
  });

  test("preserves an authored dossier title that differs from its manifest title", () => {
    const source = projectSource({ pageCount: 1 });
    const authored = authoredDocumentChunk({
      title: "Dossier Project Title",
      citationLabel: "Dossier Project Title · p. 1",
    });

    const index = buildKnowledgeIndex(
      [source],
      new Map([[source.id, [page(1, "Searchable project content")]]]),
      { project: "a".repeat(64) },
      [authored],
      pageKnowledgeMap("project", 1),
      intentAliases(),
      AUTHORED_DIGEST,
    );

    expect(index.chunks.at(-1)?.title).toBe("Dossier Project Title");
    expect(index.chunks.at(-1)?.citationLabel).toBe(
      "Dossier Project Title · p. 1",
    );
  });

  test("strictly validates v2 index metadata, all 11 intents, and authored digest drift", () => {
    const source = projectSource({ pageCount: 1 });
    const authored = authoredDocumentChunk();
    const aliases = intentAliases();
    const index = buildKnowledgeIndex(
      [source],
      new Map([[source.id, [page(1, "Searchable project content")]]]),
      { project: "a".repeat(64) },
      [authored],
      pageKnowledgeMap("project", 1),
      aliases,
      AUTHORED_DIGEST,
    );
    const validate = (candidate: unknown, currentAuthoredDigest = AUTHORED_DIGEST) =>
      validateGeneratedIndex(
        candidate,
        [source],
        { project: "a".repeat(64) },
        [authored],
        pageKnowledgeMap("project", 1),
        aliases,
        currentAuthoredDigest,
      );

    expect(() => validate(index)).not.toThrow();
    expect(() => validate({ ...index, extra: true })).toThrow(/keys/i);
    expect(() => validate({ ...index, authoredDigest: "invalid" })).toThrow(
      /authored digest/i,
    );
    expect(() => validate(index, "c".repeat(64))).toThrow(
      /authored.*digest.*mismatch/i,
    );
    const { contribution: _removed, ...missingIntent } = aliases;
    expect(() =>
      validate({ ...index, intentAliases: missingIntent }),
    ).toThrow(/intent aliases/i);
    expect(() =>
      validate({
        ...index,
        intentAliases: { ...aliases, extra: [] },
      }),
    ).toThrow(/intent aliases/i);
  });
});

describe("page-bounded chunk generation", () => {
  test("never crosses a page and keeps deterministic page-local IDs", () => {
    const source = projectSource();
    const firstPage = `FIRST ${"甲".repeat(1_350)}`;
    const secondPage = `SECOND ${"乙".repeat(1_350)}`;

    const chunks = chunkExtractedPages(
      source,
      [page(1, firstPage), page(2, secondPage)],
      pageKnowledgeMap(),
      { chunkCharacters: 1_200, overlapCharacters: 150 },
    );

    expect(chunks.map(({ id }) => id)).toEqual([
      "project:p1:c0",
      "project:p1:c1",
      "project:p2:c0",
      "project:p2:c1",
    ]);
    expect(chunks.filter(({ page }) => page === 1)).toSatisfy(
      (pageChunks: readonly KnowledgeChunk[]) =>
        pageChunks.every(({ text }) => text.includes("SECOND") === false),
    );
    expect(chunks.filter(({ page }) => page === 2)).toSatisfy(
      (pageChunks: readonly KnowledgeChunk[]) =>
        pageChunks.every(({ text }) => text.includes("FIRST") === false),
    );
    expect(chunks[0]?.text).toHaveLength(1_200);
    expect(chunks[1]?.text.slice(0, 150)).toBe(
      chunks[0]?.text.slice(-150),
    );
  });

  test("uses a deterministic structured-page convention for profile content", () => {
    const source: KnowledgeSource = {
      id: "profile",
      kind: "profile",
      title: "Public Profile",
      aliases: ["Profile"],
      tags: ["Industrial Design"],
      publicHref: "#about",
      structuredText: "Structured public profile content",
    };

    expect(
      chunkExtractedPages(source, [
        { page: 1, text: source.structuredText!, method: "structured" },
      ], new Map()),
    ).toEqual([
      expect.objectContaining({
        id: "profile:p1:c0",
        page: 1,
        publicHref: "#about",
        citationLabel: "Public Profile",
      }),
    ]);
  });

  test("keeps exact PDF viewer metadata and page citations", () => {
    const source = projectSource({
      id: "inkseat",
      title: "INKSeat",
      projectId: "inkseat",
      publicHref: "/projects/pdfs/inkseat.pdf",
    });

    expect(chunkExtractedPages(
      source,
      [page(2, "Page two content")],
      pageKnowledgeMap("inkseat", 2),
    )).toEqual([
      expect.objectContaining({
        id: "inkseat:p2:c0",
        sourceId: "inkseat",
        projectId: "inkseat",
        page: 2,
        citationLabel: "INKSeat · p. 2",
        publicHref: "/projects/pdfs/inkseat.pdf",
      }),
    ]);
  });

  test("normalizes a whitespace boundary while preserving exact overlap", () => {
    const source = projectSource({ pageCount: 1 });
    const chunks = chunkExtractedPages(source, [
      page(1, `${"A".repeat(1_199)} ${"B".repeat(200)}`),
    ], pageKnowledgeMap("project", 1));

    expect(chunks).toHaveLength(2);
    expect(Array.from(chunks[0]!.text)).toHaveLength(1_199);
    expect(chunks[0]!.text).toBe(chunks[0]!.text.trim());
    expect(chunks[1]!.text).toBe(chunks[1]!.text.trim());
    expect(Array.from(chunks[0]!.text).slice(-150).join("")).toBe(
      Array.from(chunks[1]!.text).slice(0, 150).join(""),
    );
    expect(() =>
      validateIndex(
        {
          version: 2,
          sourceDigests: { project: "a".repeat(64) },
          authoredDigest: AUTHORED_DIGEST,
          intentAliases: intentAliases(),
          chunks,
        },
        [source],
        { project: "a".repeat(64) },
      ),
    ).not.toThrow();
  });
});

describe("digests and search terms", () => {
  test("computes SHA-256 for file bytes and deterministic profile text", () => {
    const fileBytes = Buffer.from([0, 1, 2, 255]);
    const structuredProfile = "姓名：公开资料\n方向：AI Product";

    expect(sha256(fileBytes)).toBe(
      createHash("sha256").update(fileBytes).digest("hex"),
    );
    expect(sha256(structuredProfile)).toBe(
      createHash("sha256").update(structuredProfile, "utf8").digest("hex"),
    );
  });

  test("builds Chinese bigrams and normalized English terms", () => {
    expect(buildTerms("智能交互 AI Product")).toEqual([
      "智能",
      "能交",
      "交互",
      "ai",
      "product",
    ]);
  });
});

describe("knowledge validation", () => {
  test("rejects duplicate source IDs", () => {
    const source = projectSource();

    expect(() =>
      buildIndex(
        [source, { ...source }],
        new Map([[source.id, [page(1, "Content")]]]),
        { project: "a".repeat(64) },
      ),
    ).toThrow("Duplicate knowledge source ID: project");
  });

  test("rejects duplicate chunk IDs", () => {
    const source = projectSource();
    const chunk = validChunk();
    const index: GeneratedKnowledgeIndex = {
      version: 2,
      sourceDigests: { project: "a".repeat(64) },
      authoredDigest: AUTHORED_DIGEST,
      intentAliases: intentAliases(),
      chunks: [chunk, { ...chunk }],
    };

    expect(() =>
      validateIndex(index, [source], {
        project: "a".repeat(64),
      }),
    ).toThrow("Duplicate knowledge chunk ID: project:p1:c0");
  });

  test("requires every source to have searchable content", () => {
    const source = projectSource({ pageCount: 1, visualPages: [1] });

    expect(() =>
      buildIndex(
        [source],
        new Map([[source.id, [page(1, "   ")]]]),
        { project: "a".repeat(64) },
      ),
    ).toThrow("Knowledge source project has no searchable content");
  });

  test("allows an empty visual page when the source has other content", () => {
    const source = projectSource({ visualPages: [1] });

    const index = buildIndex(
      [source],
      new Map([[source.id, [page(1, ""), page(2, "Useful content")]]]),
      { project: "a".repeat(64) },
    );

    expect(index.chunks.map(({ page: chunkPage }) => chunkPage)).toEqual([2]);
  });

  test("rejects an empty non-visual page even when the source has other content", () => {
    const source = projectSource();

    expect(() =>
      buildIndex(
        [source],
        new Map([[source.id, [page(1, "  \n "), page(2, "Useful content")]]]),
        { project: "a".repeat(64) },
      ),
    ).toThrow("Knowledge source project page 1 has no searchable content");
  });

  test("rejects invalid page counts, page numbers, and viewer targets", () => {
    expect(() =>
      buildIndex(
        [projectSource({ pageCount: 3 })],
        new Map([
          ["project", [page(1, "One"), page(2, "Two")]],
        ]),
        { project: "a".repeat(64) },
      ),
    ).toThrow("Knowledge source project page count mismatch");

    expect(() =>
      validateIndex(
        {
          version: 2,
          sourceDigests: { project: "a".repeat(64) },
          authoredDigest: AUTHORED_DIGEST,
          intentAliases: intentAliases(),
          chunks: [validChunk({ page: 3, id: "project:p3:c0" })],
        },
        [projectSource()],
        { project: "a".repeat(64) },
      ),
    ).toThrow("Invalid page for knowledge chunk project:p3:c0");

    expect(() =>
      validateIndex(
        {
          version: 2,
          sourceDigests: { project: "a".repeat(64) },
          authoredDigest: AUTHORED_DIGEST,
          intentAliases: intentAliases(),
          chunks: [validChunk({ publicHref: "/unexpected.pdf" })],
        },
        [projectSource()],
        { project: "a".repeat(64) },
      ),
    ).toThrow("Invalid public viewer target for knowledge chunk project:p1:c0");
  });

  test("rejects non-string aliases and tags in committed chunks", () => {
    const source = projectSource();
    const digest = { project: "a".repeat(64) };

    for (const chunk of [
      validChunk({ aliases: [1] as unknown as readonly string[] }),
      validChunk({ tags: [2] as unknown as readonly string[] }),
    ]) {
      expect(() =>
        validateIndex(
          {
            version: 2,
            sourceDigests: digest,
            authoredDigest: AUTHORED_DIGEST,
            intentAliases: intentAliases(),
            chunks: [chunk],
          },
          [source],
          digest,
        ),
      ).toThrow("Invalid metadata for knowledge chunk project:p1:c0");
    }
  });

  test("rejects extra or missing keys at the index and chunk boundaries", () => {
    const source = projectSource({ pageCount: 1 });
    const index = canonicalIndex(
      [source],
      new Map([[source.id, [page(1, "Canonical synthetic content")]]]),
    );
    const digest = { project: "a".repeat(64) };

    for (const candidate of [
      { ...mutableCopy(index), extra: true },
      { ...mutableCopy(index), chunks: [{ ...index.chunks[0], extra: true }] },
      { sourceDigests: mutableCopy(index.sourceDigests), chunks: mutableCopy(index.chunks) },
      {
        ...mutableCopy(index),
        chunks: index.chunks.map(({ title: _removed, ...chunk }) => chunk),
      },
    ]) {
      expect(() => validateIndex(candidate, [source], digest)).toThrow();
    }
  });

  test("requires canonical manifest metadata and ordered canonical terms", () => {
    const source = projectSource({
      pageCount: 1,
      aliases: ["First Alias", "Second Alias"],
      tags: ["First Tag", "Second Tag"],
    });
    const index = canonicalIndex(
      [source],
      new Map([[source.id, [page(1, "Canonical synthetic content")]]]),
    );
    const digest = { project: "a".repeat(64) };
    const mutations: Partial<KnowledgeChunk>[] = [
      { aliases: ["Stale Alias"] },
      { aliases: [...source.aliases].reverse() },
      { tags: ["Stale Tag"] },
      { tags: [...source.tags].reverse() },
      { terms: ["forged"] },
      { projectId: "forged-project" },
      { title: "Forged Title" },
      { publicHref: "/forged.pdf" },
      { citationLabel: "Forged citation" },
    ];

    for (const mutation of mutations) {
      const copy = mutableCopy(index);
      const candidate = { ...copy, chunks: [{ ...copy.chunks[0]!, ...mutation }] };
      expect(() => validateIndex(candidate, [source], digest)).toThrow();
    }

    const sourceWithoutProject = projectSource({
      id: "resume",
      kind: "resume",
      projectId: undefined,
      pageCount: 1,
    });
    const withoutProject = canonicalIndex(
      [sourceWithoutProject],
      new Map([[sourceWithoutProject.id, [page(1, "Synthetic resume content")]]]),
    );
    const forgedPresence = mutableCopy(withoutProject) as unknown as {
      version: 2;
      sourceDigests: Record<string, string>;
      chunks: Array<Record<string, unknown>>;
    };
    forgedPresence.chunks[0]!.projectId = undefined;
    expect(() =>
      validateIndex(forgedPresence, [sourceWithoutProject], {
        resume: "a".repeat(64),
      }),
    ).toThrow();
  });

  test("rejects non-normalized text and text replacement with stale terms", () => {
    const source = projectSource({ pageCount: 1 });
    const index = canonicalIndex(
      [source],
      new Map([[source.id, [page(1, "Canonical synthetic content")]]]),
    );
    const digest = { project: "a".repeat(64) };

    for (const text of [" Canonical synthetic content ", "Replacement content"]) {
      const copy = mutableCopy(index);
      const candidate = { ...copy, chunks: [{ ...copy.chunks[0]!, text }] };
      expect(() => validateIndex(candidate, [source], digest)).toThrow();
    }
  });

  test("requires canonical source/page order and every nonvisual page group", () => {
    const first = projectSource({ id: "first", projectId: "first" });
    const second = projectSource({ id: "second", projectId: "second", pageCount: 1 });
    const index = canonicalIndex(
      [first, second],
      new Map([
        [first.id, [page(1, "First page"), page(2, "Second page")]],
        [second.id, [page(1, "Other source")]],
      ]),
    );
    const digests = { first: "a".repeat(64), second: "a".repeat(64) };

    for (const chunks of [
      [index.chunks[1]!, index.chunks[0]!, index.chunks[2]!],
      [index.chunks[2]!, index.chunks[0]!, index.chunks[1]!],
      [index.chunks[0]!, index.chunks[2]!],
      [index.chunks[0]!, index.chunks[0]!, index.chunks[1]!, index.chunks[2]!],
    ]) {
      expect(() =>
        validateIndex({ ...index, chunks }, [first, second], digests),
      ).toThrow();
    }
  });

  test("enforces chunk length, progression, and exact 150-code-point overlap", () => {
    const source = projectSource({ pageCount: 1 });
    const longText = Array.from({ length: 2_400 }, (_, index) =>
      String.fromCharCode(65 + (index % 26)),
    ).join("");
    const index = canonicalIndex(
      [source],
      new Map([[source.id, [page(1, longText)]]]),
    );
    const digest = { project: "a".repeat(64) };
    expect(index.chunks).toHaveLength(3);

    const tooLongCopy = mutableCopy(index);
    const tooLong = { ...tooLongCopy, chunks: [
      {
        ...tooLongCopy.chunks[0]!,
        text: `${tooLongCopy.chunks[0]!.text}X`,
        terms: buildTerms(
          [source.title, ...source.aliases, ...source.tags, `${tooLongCopy.chunks[0]!.text}X`].join(" "),
        ),
      },
      ...tooLongCopy.chunks.slice(1),
    ] };
    expect(() => validateIndex(tooLong, [source], digest)).toThrow();

    const badOverlapCopy = mutableCopy(index);
    const alteredText = `B${badOverlapCopy.chunks[1]!.text.slice(1)}`;
    const badOverlap = { ...badOverlapCopy, chunks: [
      badOverlapCopy.chunks[0]!,
      {
        ...badOverlapCopy.chunks[1]!,
        text: alteredText,
        terms: buildTerms(
          [source.title, ...source.aliases, ...source.tags, alteredText].join(" "),
        ),
      },
      badOverlapCopy.chunks[2]!,
    ] };
    expect(() => validateIndex(badOverlap, [source], digest)).toThrow();

    const shortMiddleCopy = mutableCopy(index);
    const shortenedText = shortMiddleCopy.chunks[1]!.text.slice(0, -1);
    const shortMiddle = { ...shortMiddleCopy, chunks: [
      shortMiddleCopy.chunks[0]!,
      {
        ...shortMiddleCopy.chunks[1]!,
        text: shortenedText,
        terms: buildTerms(
          [source.title, ...source.aliases, ...source.tags, shortenedText].join(" "),
        ),
      },
      shortMiddleCopy.chunks[2]!,
    ] };
    expect(() => validateIndex(shortMiddle, [source], digest)).toThrow();

    const earlyBoundaryCopy = mutableCopy(index);
    const earlyFirstText = earlyBoundaryCopy.chunks[0]!.text.slice(0, -1);
    const earlySecondText = `${earlyFirstText.slice(-150)}${earlyBoundaryCopy.chunks[1]!.text.slice(150)}`;
    const earlyBoundary = {
      ...earlyBoundaryCopy,
      chunks: [
        {
          ...earlyBoundaryCopy.chunks[0]!,
          text: earlyFirstText,
          terms: buildTerms(
            [source.title, ...source.aliases, ...source.tags, earlyFirstText].join(" "),
          ),
        },
        {
          ...earlyBoundaryCopy.chunks[1]!,
          text: earlySecondText,
          terms: buildTerms(
            [source.title, ...source.aliases, ...source.tags, earlySecondText].join(" "),
          ),
        },
        earlyBoundaryCopy.chunks[2]!,
      ],
    };
    expect(() =>
      validateIndex(earlyBoundary, [source], digest),
    ).toThrow();
  });
});

describe("generation resource ownership", () => {
  const sources = [
    projectSource({ id: "one", projectId: "one", pageCount: 1 }),
    projectSource({ id: "two", projectId: "two", pageCount: 1 }),
  ] as const;

  test("creates one OCR run, reuses it across documents, and terminates once", async () => {
    const ocrPage = vi.fn(async () => "ocr");
    const terminate = vi.fn(async () => undefined);
    const createRun = vi.fn(async () => ({ ocrPage, terminate }));
    const destroyed: string[] = [];
    const loadSource = vi.fn(async (source: KnowledgeSource) => ({
      document: { id: source.id },
      digest: source.id.repeat(64).slice(0, 64),
      destroy: async () => destroyed.push(source.id),
    }));
    const extractPages = vi.fn(
      async (
        document: { id: string },
        options: { readonly ocrPage: typeof ocrPage },
      ) => {
        expect(options.ocrPage).toBe(ocrPage);
        return [page(1, `Content ${document.id}`)];
      },
    );

    const result = await extractPdfSourcesWithSharedOcr(sources, {
      createRun,
      loadSource,
      extractPages,
    });

    expect(createRun).toHaveBeenCalledOnce();
    expect(loadSource).toHaveBeenCalledTimes(2);
    expect(extractPages).toHaveBeenCalledTimes(2);
    expect(result.pagesBySource.size).toBe(2);
    expect(destroyed).toEqual(["one", "two"]);
    expect(terminate).toHaveBeenCalledOnce();
  });

  test("terminates the one shared OCR run when a later document fails", async () => {
    const terminate = vi.fn(async () => undefined);
    const destroyed: string[] = [];
    const failure = new Error("synthetic extraction failure");
    const extractPages = vi
      .fn()
      .mockResolvedValueOnce([page(1, "First")])
      .mockRejectedValueOnce(failure);

    await expect(
      extractPdfSourcesWithSharedOcr(sources, {
        createRun: vi.fn(async () => ({
          ocrPage: vi.fn(async () => "ocr"),
          terminate,
        })),
        loadSource: vi.fn(async (source: KnowledgeSource) => ({
          document: { id: source.id },
          digest: "a".repeat(64),
          destroy: async () => destroyed.push(source.id),
        })),
        extractPages,
      }),
    ).rejects.toBe(failure);

    expect(destroyed).toEqual(["one", "two"]);
    expect(terminate).toHaveBeenCalledOnce();
  });

  test("preserves extraction failure and attaches document destruction failure", async () => {
    const extractionError = new Error("synthetic extraction failure");
    const destructionError = new Error("synthetic destruction failure");
    const terminate = vi.fn(async () => undefined);

    let thrown: unknown;
    try {
      await extractPdfSourcesWithSharedOcr([sources[0]], {
        createRun: vi.fn(async () => ({
          ocrPage: vi.fn(async () => "ocr"),
          terminate,
        })),
        loadSource: vi.fn(async () => ({
          document: { id: "one" },
          digest: "a".repeat(64),
          destroy: vi.fn().mockRejectedValue(destructionError),
        })),
        extractPages: vi.fn().mockRejectedValue(extractionError),
      });
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBe(extractionError);
    expect((thrown as Error).cause).toBeInstanceOf(AggregateError);
    expect(((thrown as Error).cause as AggregateError).errors).toContain(
      destructionError,
    );
    expect(terminate).toHaveBeenCalledOnce();
  });

  test("preserves extraction failure and attaches OCR termination failure", async () => {
    const extractionError = new Error("synthetic extraction failure");
    const terminationError = new Error("synthetic termination failure");

    let thrown: unknown;
    try {
      await extractPdfSourcesWithSharedOcr([sources[0]], {
        createRun: vi.fn(async () => ({
          ocrPage: vi.fn(async () => "ocr"),
          terminate: vi.fn().mockRejectedValue(terminationError),
        })),
        loadSource: vi.fn(async () => ({
          document: { id: "one" },
          digest: "a".repeat(64),
          destroy: vi.fn().mockResolvedValue(undefined),
        })),
        extractPages: vi.fn().mockRejectedValue(extractionError),
      });
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBe(extractionError);
    expect((thrown as Error).cause).toBeInstanceOf(AggregateError);
    expect(((thrown as Error).cause as AggregateError).errors).toContain(
      terminationError,
    );
  });
});

describe("atomic index publishing", () => {
  test("preserves the destination and cleans the temporary file on publish failure", async () => {
    const files = new Map([["index.json", "committed"]]);
    const rename = vi.fn(async () => {
      throw Object.assign(new Error("replacement denied"), { code: "EPERM" });
    });

    await expect(
      publishAtomically("index.json", "replacement", {
        processId: 7,
        writeFile: async (path, content) => void files.set(path, content),
        rename,
        removeFile: async (path) => void files.delete(path),
      }),
    ).rejects.toThrow("replacement denied");

    expect(files.get("index.json")).toBe("committed");
    expect(files.has("index.json.tmp-7")).toBe(false);
    expect(rename).toHaveBeenCalledOnce();
  });

  test("replaces an existing destination with one real same-directory rename", async () => {
    const directory = await mkdtemp(join(tmpdir(), "knowledge-publish-"));
    const destination = join(directory, "index.json");
    const processId = 41;
    const renameCalls: Array<readonly [string, string]> = [];
    await writeFile(destination, "committed", "utf8");

    try {
      await publishAtomically(destination, "replacement", {
        processId,
        writeFile: (path, content) => writeFile(path, content, "utf8"),
        rename: async (source, target) => {
          renameCalls.push([source, target]);
          await rename(source, target);
        },
        removeFile: (path) => rm(path, { force: true }),
      });

      expect(await readFile(destination, "utf8")).toBe("replacement");
      expect(renameCalls).toEqual([
        [`${destination}.tmp-${processId}`, destination],
      ]);
      await expect(
        readFile(`${destination}.tmp-${processId}`, "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("preserves a real destination and removes the temp file after rename failure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "knowledge-publish-"));
    const destination = join(directory, "index.json");
    const temporaryPath = `${destination}.tmp-42`;
    const replacementError = Object.assign(new Error("replacement denied"), {
      code: "EPERM",
    });
    await writeFile(destination, "committed", "utf8");

    try {
      await expect(
        publishAtomically(destination, "replacement", {
          processId: 42,
          writeFile: (path, content) => writeFile(path, content, "utf8"),
          rename: vi.fn().mockRejectedValue(replacementError),
          removeFile: (path) => rm(path, { force: true }),
        }),
      ).rejects.toBe(replacementError);

      expect(await readFile(destination, "utf8")).toBe("committed");
      await expect(readFile(temporaryPath, "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

describe("privacy and deterministic serialization", () => {
  test("rejects synthetic private contact and address markers", () => {
    expect(() => assertPrivacySafe("phone: +1 555 010 2048")).toThrow(
      "Private contact data detected",
    );
    expect(() => assertPrivacySafe("email: private.person@example.test")).toThrow(
      "Private contact data detected",
    );
    expect(() => assertPrivacySafe("address: PRIVATE_ADDRESS")).toThrow(
      "Private contact data detected",
    );
  });

  test("allows the one approved public Gmail and ordinary project numbers", () => {
    expect(() =>
      assertPrivacySafe(
        `Public contact: ${profile.email}; project 01; page 12 of 28; model 2035`,
      ),
    ).not.toThrow();
  });

  test("allows only the exact approved email token", () => {
    expect(() => assertPrivacySafe(profile.email.toUpperCase())).not.toThrow();
    expect(() => assertPrivacySafe(`prefix${profile.email}`)).toThrow(
      "Private contact data detected",
    );
    expect(() => assertPrivacySafe(`${profile.email}.example.test`)).toThrow(
      "Private contact data detected",
    );
  });

  test("detects unlabelled international and mobile phone candidates", () => {
    for (const text of [
      "+44 7700 900123",
      "☎ +81 (0) 90-1234-5678",
      "13800138000",
    ]) {
      expect(() => assertPrivacySafe(text)).toThrow("Private contact data detected");
    }
  });

  test("allows benign numeric and technical address contexts", () => {
    for (const text of [
      "Timeline 2020-2024",
      "Dimensions 1200 x 150 x 30 mm",
      "Model XR-2035; page 12 of 28",
      "IP address: 192.0.2.10",
      "memory address: 0x7fff0000",
      "address bus width: 64-bit",
    ]) {
      expect(() => assertPrivacySafe(text)).not.toThrow();
    }
  });

  test("rejects synthetic residential address context", () => {
    for (const text of [
      "Home address: 42 Example Street",
      "联系地址：示例市测试区虚构路 88 号",
      "Send mail to 17 Sample Avenue, Test City",
    ]) {
      expect(() => assertPrivacySafe(text)).toThrow("Private contact data detected");
    }
  });

  test("rejects private addresses that follow technical address text on one line", () => {
    for (const text of [
      "IP address: 192.0.2.10; Home address: 42 Example Street",
      "memory address: 0x7fff0000; 联系地址：示例市测试区虚构路 88 号",
      "address bus width: 64-bit; 住址：示例市样本街 17 号",
    ]) {
      expect(() => assertPrivacySafe(text)).toThrow("Private contact data detected");
    }
  });

  test("rejects unlabelled formatted local phone candidates", () => {
    for (const text of [
      "☎ (212) 555-0198",
      "020 7946 0958",
      "138 0013 8000",
    ]) {
      expect(() => assertPrivacySafe(text)).toThrow("Private contact data detected");
    }
  });

  test("allows labelled non-phone numeric formats", () => {
    for (const text of [
      "Year range: 2020-2024",
      "Dimensions: 1200-150-030 mm",
      "Page range: 000-123-4567",
      "Model: 020-7946-0958",
      "Serial: (212) 555-0198",
      "Product code: 138 0013 8000",
      "Date: 2026-07-22",
    ]) {
      expect(() => assertPrivacySafe(text)).not.toThrow();
    }
  });

  test("allows longer hyphen-delimited technical identifiers", () => {
    expect(() => assertPrivacySafe("Artifact ID: 123-456-7890-A")).not.toThrow();
  });

  test("serializes recursively with stable key ordering", () => {
    const first = {
      version: 1,
      sourceDigests: { zeta: "z", alpha: "a" },
      chunks: [{ text: "content", id: "source:p1:c0", terms: ["b", "a"] }],
    };
    const second = {
      chunks: [{ terms: ["b", "a"], id: "source:p1:c0", text: "content" }],
      sourceDigests: { alpha: "a", zeta: "z" },
      version: 1,
    };

    expect(stableSerialize(first)).toBe(stableSerialize(second));
    expect(stableSerialize(first)).toBe(
      '{\n  "chunks": [\n    {\n      "id": "source:p1:c0",\n      "terms": [\n        "b",\n        "a"\n      ],\n      "text": "content"\n    }\n  ],\n  "sourceDigests": {\n    "alpha": "a",\n    "zeta": "z"\n  },\n  "version": 1\n}\n',
    );
  });
});

describe("CLI mode parsing", () => {
  test("accepts exactly one generate or verify mode", () => {
    expect(parseKnowledgeIndexMode(["--generate"])).toBe("generate");
    expect(parseKnowledgeIndexMode(["--verify"])).toBe("verify");
    expect(() => parseKnowledgeIndexMode([])).toThrow(
      "Choose exactly one knowledge index mode",
    );
    expect(() => parseKnowledgeIndexMode(["--generate", "--verify"])).toThrow(
      "Choose exactly one knowledge index mode",
    );
    expect(() => parseKnowledgeIndexMode(["--verify", "extra"])).toThrow(
      "Choose exactly one knowledge index mode",
    );
  });
});
