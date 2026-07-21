// @vitest-environment node

import { createHash } from "node:crypto";

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
  ExtractedPage,
  GeneratedKnowledgeIndex,
  KnowledgeChunk,
  KnowledgeSource,
} from "./types";

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
    ...overrides,
  };
}

describe("page-bounded chunk generation", () => {
  test("never crosses a page and keeps deterministic page-local IDs", () => {
    const source = projectSource();
    const firstPage = `FIRST ${"甲".repeat(1_350)}`;
    const secondPage = `SECOND ${"乙".repeat(1_350)}`;

    const chunks = chunkExtractedPages(
      source,
      [page(1, firstPage), page(2, secondPage)],
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
      ]),
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

    expect(chunkExtractedPages(source, [page(2, "Page two content")])).toEqual([
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
      buildKnowledgeIndex(
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
      version: 1,
      sourceDigests: { project: "a".repeat(64) },
      chunks: [chunk, { ...chunk }],
    };

    expect(() =>
      validateGeneratedIndex(index, [source], {
        project: "a".repeat(64),
      }),
    ).toThrow("Duplicate knowledge chunk ID: project:p1:c0");
  });

  test("requires every source to have searchable content", () => {
    const source = projectSource({ pageCount: 1, visualPages: [1] });

    expect(() =>
      buildKnowledgeIndex(
        [source],
        new Map([[source.id, [page(1, "   ")]]]),
        { project: "a".repeat(64) },
      ),
    ).toThrow("Knowledge source project has no searchable content");
  });

  test("allows an empty visual page when the source has other content", () => {
    const source = projectSource({ visualPages: [1] });

    const index = buildKnowledgeIndex(
      [source],
      new Map([[source.id, [page(1, ""), page(2, "Useful content")]]]),
      { project: "a".repeat(64) },
    );

    expect(index.chunks.map(({ page: chunkPage }) => chunkPage)).toEqual([2]);
  });

  test("rejects an empty non-visual page even when the source has other content", () => {
    const source = projectSource();

    expect(() =>
      buildKnowledgeIndex(
        [source],
        new Map([[source.id, [page(1, "  \n "), page(2, "Useful content")]]]),
        { project: "a".repeat(64) },
      ),
    ).toThrow("Knowledge source project page 1 has no searchable content");
  });

  test("rejects invalid page counts, page numbers, and viewer targets", () => {
    expect(() =>
      buildKnowledgeIndex(
        [projectSource({ pageCount: 3 })],
        new Map([
          ["project", [page(1, "One"), page(2, "Two")]],
        ]),
        { project: "a".repeat(64) },
      ),
    ).toThrow("Knowledge source project page count mismatch");

    expect(() =>
      validateGeneratedIndex(
        {
          version: 1,
          sourceDigests: { project: "a".repeat(64) },
          chunks: [validChunk({ page: 3, id: "project:p3:c0" })],
        },
        [projectSource()],
        { project: "a".repeat(64) },
      ),
    ).toThrow("Invalid page for knowledge chunk project:p3:c0");

    expect(() =>
      validateGeneratedIndex(
        {
          version: 1,
          sourceDigests: { project: "a".repeat(64) },
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
        validateGeneratedIndex(
          { version: 1, sourceDigests: digest, chunks: [chunk] },
          [source],
          digest,
        ),
      ).toThrow("Invalid metadata for knowledge chunk project:p1:c0");
    }
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
