import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  assertPrivacySafe,
  buildKnowledgeIndex,
  chunkExtractedPages,
  parseKnowledgeIndexMode,
  sha256,
  stableSerialize,
  validateGeneratedIndex,
} from "../src/chat/knowledge/build-index";
import { knowledgeSources } from "../src/chat/knowledge/manifest";
import { createPdfOcrRun } from "../src/chat/knowledge/ocr";

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

interface SourceExtraction {
  readonly pages: readonly ExtractedPage[];
  readonly digest: string;
}

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

async function extractSource(
  source: KnowledgeSource,
): Promise<SourceExtraction> {
  if (source.kind === "profile") {
    if (!source.structuredText) {
      throw new Error(`Knowledge source ${source.id} has no structured content`);
    }
    const pages: readonly ExtractedPage[] = [
      { page: 1, text: source.structuredText, method: "structured" },
    ];
    return { pages, digest: sha256(source.structuredText) };
  }

  const bytes = await readSourceFile(source);
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
  });
  const document = await loadingTask.promise;
  let run: Awaited<ReturnType<typeof createPdfOcrRun>> | undefined;
  try {
    run = await createPdfOcrRun();
    const pages = await run.extract(document, {
      expectedPageCount: source.pageCount,
      visualPages: source.visualPages,
    });
    pages.forEach(({ text }) => assertPrivacySafe(text));
    return { pages, digest: sha256(bytes) };
  } finally {
    await run?.terminate();
    await loadingTask.destroy();
  }
}

async function writeAtomically(path: string, content: string): Promise<void> {
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, content, "utf8");
  try {
    await rename(temporaryPath, path);
  } catch (error: unknown) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      (error.code !== "EEXIST" && error.code !== "EPERM")
    ) {
      throw error;
    }
    await rm(path, { force: true });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function generate(): Promise<void> {
  const pagesBySource = new Map<string, readonly ExtractedPage[]>();
  const sourceDigests: Record<string, string> = {};
  for (const source of knowledgeSources) {
    console.log(`Extracting knowledge source: ${source.id}`);
    const extraction = await extractSource(source);
    pagesBySource.set(source.id, extraction.pages);
    sourceDigests[source.id] = extraction.digest;
  }

  const index = buildKnowledgeIndex(
    knowledgeSources,
    pagesBySource,
    sourceDigests,
  );
  const serialized = stableSerialize(index);
  assertPrivacySafe(serialized);
  await writeAtomically(INDEX_PATH, serialized);

  for (const source of knowledgeSources) {
    const pages = pagesBySource.get(source.id) ?? [];
    const chunks = chunkExtractedPages(source, pages);
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
    `Generated knowledge index: sources=${knowledgeSources.length} chunks=${index.chunks.length}`,
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
  );
  if (stableSerialize(index) !== serialized) {
    throw new Error("Generated knowledge index is not deterministically serialized");
  }
  console.log(
    `Verified knowledge index: sources=${knowledgeSources.length} chunks=${index.chunks.length}`,
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
