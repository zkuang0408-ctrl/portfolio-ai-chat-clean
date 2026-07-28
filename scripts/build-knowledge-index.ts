import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  assertPrivacySafe,
  buildKnowledgeIndex,
  chunkExtractedPages,
  extractPdfSourcesWithSharedOcr,
  parseKnowledgeIndexMode,
  publishAtomically,
  sha256,
  stableSerialize,
  validateGeneratedIndex,
} from "../src/chat/knowledge/build-index";
import { buildAuthoredChunks } from "../src/chat/knowledge/authored/build-authored-chunks";
import {
  authoredGlossary,
  authoredProjects,
  buildIntentAliases,
  buildPageKnowledgeMap,
} from "../src/chat/knowledge/authored";
import { knowledgeSources } from "../src/chat/knowledge/manifest";
import { createPdfOcrRun } from "../src/chat/knowledge/ocr";
import { extractPdfPages } from "../src/chat/knowledge/pdf-extractor";

import type {
  ExtractedPage,
  GeneratedKnowledgeIndex,
  KnowledgeSource,
} from "../src/chat/knowledge/types";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_PATH = resolve(
  REPOSITORY_ROOT,
  "src/chat/knowledge/generated-index.json",
);
const HELP =
  "Usage: npm run knowledge:generate | npm run knowledge:verify\n" +
  "The underlying CLI accepts exactly one of --generate or --verify.";
const pageKnowledge = buildPageKnowledgeMap(authoredProjects);
const intentAliases = buildIntentAliases(authoredGlossary);
const authoredChunks = buildAuthoredChunks(authoredProjects);
const authoredDigest = sha256(stableSerialize({
  projects: authoredProjects,
  glossary: authoredGlossary,
}));

async function readSourceFile(source: KnowledgeSource): Promise<Buffer> {
  if (!source.filePath) {
    throw new Error(`Knowledge source ${source.id} has no file path`);
  }
  return readFile(resolve(REPOSITORY_ROOT, source.filePath));
}

async function digestSource(source: KnowledgeSource): Promise<string> {
  if (source.kind === "profile") {
    if (!source.structuredText) {
      throw new Error(`Knowledge source ${source.id} has no structured content`);
    }
    assertPrivacySafe(source.structuredText);
    return sha256(source.structuredText);
  }
  return sha256(await readSourceFile(source));
}

async function loadPdfSource(source: KnowledgeSource) {
  const bytes = await readSourceFile(source);
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
  });
  try {
    const document = await loadingTask.promise;
    return {
      document,
      digest: sha256(bytes),
      destroy: () => loadingTask.destroy(),
    };
  } catch (error: unknown) {
    await loadingTask.destroy();
    throw error;
  }
}

async function generate(): Promise<void> {
  const pagesBySource = new Map<string, readonly ExtractedPage[]>();
  const sourceDigests: Record<string, string> = {};
  const profileSources = knowledgeSources.filter(
    (source) => source.kind === "profile",
  );
  for (const source of profileSources) {
    console.log(`Extracting knowledge source: ${source.id}`);
    if (!source.structuredText) {
      throw new Error(`Knowledge source ${source.id} has no structured content`);
    }
    pagesBySource.set(source.id, [
      { page: 1, text: source.structuredText, method: "structured" },
    ]);
    sourceDigests[source.id] = sha256(source.structuredText);
  }

  const pdfSources = knowledgeSources.filter(
    (source) => source.kind !== "profile",
  );
  const pdfExtraction = await extractPdfSourcesWithSharedOcr(pdfSources, {
    createRun: createPdfOcrRun,
    loadSource: loadPdfSource,
    extractPages: extractPdfPages,
    onSource: (source) =>
      console.log(`Extracting knowledge source: ${source.id}`),
  });
  for (const source of pdfSources) {
    const pages = pdfExtraction.pagesBySource.get(source.id);
    if (!pages) {
      throw new Error(`Knowledge source ${source.id} has no extracted pages`);
    }
    pages.forEach(({ text }) => assertPrivacySafe(text));
    pagesBySource.set(source.id, pages);
    sourceDigests[source.id] = pdfExtraction.sourceDigests[source.id]!;
  }

  const index = buildKnowledgeIndex(
    knowledgeSources,
    pagesBySource,
    sourceDigests,
    authoredChunks,
    pageKnowledge,
    intentAliases,
    authoredDigest,
  );
  const serialized = stableSerialize(index);
  assertPrivacySafe(serialized);
  await publishAtomically(INDEX_PATH, serialized, {
    processId: process.pid,
    writeFile: (path, content) => writeFile(path, content, "utf8"),
    rename,
    removeFile: (path) => rm(path, { force: true }),
  });

  for (const source of knowledgeSources) {
    const pages = pagesBySource.get(source.id) ?? [];
    const chunks = chunkExtractedPages(source, pages, pageKnowledge);
    const nativePages = pages.filter(({ method }) => method === "pdf-text").length;
    const ocrPages = pages.filter(({ method }) => method === "ocr").length;
    const structuredPages = pages.filter(
      ({ method }) => method === "structured",
    ).length;
    const emptyVisualPages = pages.filter(
      ({ page, text }) =>
        (source.visualPages ?? []).includes(page) && text.trim().length === 0,
    ).length;
    console.log(
      `Generated ${source.id}: pages=${pages.length} chunks=${chunks.length} native=${nativePages} ocr=${ocrPages} structured=${structuredPages} emptyVisual=${emptyVisualPages}`,
    );
  }
  console.log(
    `Generated knowledge index: sources=${knowledgeSources.length} raw=${index.chunks.length - authoredChunks.length} authored=${authoredChunks.length} chunks=${index.chunks.length}`,
  );
}

async function currentSourceDigests(): Promise<Record<string, string>> {
  const digests: Record<string, string> = {};
  for (const source of knowledgeSources) {
    digests[source.id] = await digestSource(source);
  }
  return digests;
}

async function verify(): Promise<void> {
  const serialized = await readFile(INDEX_PATH, "utf8");
  assertPrivacySafe(serialized);
  let candidate: unknown;
  try {
    candidate = JSON.parse(serialized) as unknown;
  } catch {
    throw new Error("Generated knowledge index is not valid JSON");
  }
  const index: GeneratedKnowledgeIndex = validateGeneratedIndex(
    candidate,
    knowledgeSources,
    await currentSourceDigests(),
    authoredChunks,
    pageKnowledge,
    intentAliases,
    authoredDigest,
  );
  if (stableSerialize(index) !== serialized) {
    throw new Error("Generated knowledge index is not deterministically serialized");
  }
  console.log(
    `Verified knowledge index: sources=${knowledgeSources.length} raw=${index.chunks.length - authoredChunks.length} authored=${authoredChunks.length} chunks=${index.chunks.length}`,
  );
}

async function main(): Promise<void> {
  let mode: ReturnType<typeof parseKnowledgeIndexMode>;
  try {
    mode = parseKnowledgeIndexMode(process.argv.slice(2));
  } catch {
    console.error(HELP);
    process.exitCode = 1;
    return;
  }

  try {
    if (mode === "generate") await generate();
    else await verify();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown failure";
    console.error(`Knowledge index ${mode} failed: ${message}`);
    process.exitCode = 1;
  }
}

await main();
