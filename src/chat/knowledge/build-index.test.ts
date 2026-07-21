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

function canonicalIndex(
  sources: readonly KnowledgeSource[],
  pagesBySource: ReadonlyMap<string, readonly ExtractedPage[]>,
): GeneratedKnowledgeIndex {
  return buildKnowledgeIndex(
    sources,
    pagesBySource,
    Object.fromEntries(sources.map(({ id }) => [id, "a".repeat(64)])),
  );
}

function mutableCopy<T>(value: T): T {
  return structuredClone(value);
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

  test("normalizes a whitespace boundary while preserving exact overlap", () => {
    const source = projectSource({ pageCount: 1 });
    const chunks = chunkExtractedPages(source, [
      page(1, `${"A".repeat(1_199)} ${"B".repeat(200)}`),
    ]);

    expect(chunks).toHaveLength(2);
    expect(Array.from(chunks[0]!.text)).toHaveLength(1_199);
    expect(chunks[0]!.text).toBe(chunks[0]!.text.trim());
    expect(chunks[1]!.text).toBe(chunks[1]!.text.trim());
    expect(Array.from(chunks[0]!.text).slice(-150).join("")).toBe(
      Array.from(chunks[1]!.text).slice(0, 150).join(""),
    );
    expect(() =>
      validateGeneratedIndex(
        {
          version: 1,
          sourceDigests: { project: "a".repeat(64) },
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
      expect(() => validateGeneratedIndex(candidate, [source], digest)).toThrow();
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
      expect(() => validateGeneratedIndex(candidate, [source], digest)).toThrow();
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
      version: 1;
      sourceDigests: Record<string, string>;
      chunks: Array<Record<string, unknown>>;
    };
    forgedPresence.chunks[0]!.projectId = undefined;
    expect(() =>
      validateGeneratedIndex(forgedPresence, [sourceWithoutProject], {
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
      expect(() => validateGeneratedIndex(candidate, [source], digest)).toThrow();
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
        validateGeneratedIndex({ ...index, chunks }, [first, second], digests),
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
    expect(() => validateGeneratedIndex(tooLong, [source], digest)).toThrow();

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
    expect(() => validateGeneratedIndex(badOverlap, [source], digest)).toThrow();

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
    expect(() => validateGeneratedIndex(shortMiddle, [source], digest)).toThrow();

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
      validateGeneratedIndex(earlyBoundary, [source], digest),
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
