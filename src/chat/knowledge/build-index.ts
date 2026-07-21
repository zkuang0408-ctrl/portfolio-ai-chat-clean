import { createHash } from "node:crypto";

import type {
  ExtractedPage,
  GeneratedKnowledgeIndex,
  KnowledgeChunk,
  KnowledgeSource,
} from "./types";

export const DEFAULT_CHUNK_CHARACTERS = 1_200;
export const DEFAULT_OVERLAP_CHARACTERS = 150;
export const APPROVED_PUBLIC_EMAIL = "zkuang0408@gmail.com";

export interface ChunkingOptions {
  readonly chunkCharacters?: number;
  readonly overlapCharacters?: number;
}

export interface LoadedPdfSource<Document> {
  readonly document: Document;
  readonly digest: string;
  destroy(): Promise<unknown>;
}

export interface SharedOcrRun<OcrPageFunction> {
  readonly ocrPage: OcrPageFunction;
  terminate(): Promise<unknown>;
}

export interface SharedPdfExtractionOptions<OcrPageFunction> {
  readonly expectedPageCount?: number;
  readonly visualPages?: readonly number[];
  readonly ocrPage: OcrPageFunction;
}

export interface SharedPdfExtractionDependencies<
  Document,
  OcrPageFunction,
> {
  createRun(): Promise<SharedOcrRun<OcrPageFunction>>;
  loadSource(source: KnowledgeSource): Promise<LoadedPdfSource<Document>>;
  extractPages(
    document: Document,
    options: SharedPdfExtractionOptions<OcrPageFunction>,
  ): Promise<readonly ExtractedPage[]>;
  onSource?(source: KnowledgeSource): void;
}

export interface SharedPdfExtractionResult {
  readonly pagesBySource: ReadonlyMap<string, readonly ExtractedPage[]>;
  readonly sourceDigests: Readonly<Record<string, string>>;
}

export async function extractPdfSourcesWithSharedOcr<
  Document,
  OcrPageFunction,
>(
  sources: readonly KnowledgeSource[],
  dependencies: SharedPdfExtractionDependencies<Document, OcrPageFunction>,
): Promise<SharedPdfExtractionResult> {
  const run = await dependencies.createRun();
  const pagesBySource = new Map<string, readonly ExtractedPage[]>();
  const sourceDigests: Record<string, string> = {};
  let extractionError: unknown;

  try {
    for (const source of sources) {
      if (source.kind === "profile") {
        throw new Error("Structured profile sources cannot use PDF extraction");
      }
      dependencies.onSource?.(source);
      const loaded = await dependencies.loadSource(source);
      try {
        const pages = await dependencies.extractPages(loaded.document, {
          expectedPageCount: source.pageCount,
          visualPages: source.visualPages,
          ocrPage: run.ocrPage,
        });
        pagesBySource.set(source.id, pages);
        sourceDigests[source.id] = loaded.digest;
      } finally {
        await loaded.destroy();
      }
    }
  } catch (error: unknown) {
    extractionError = error;
  }

  try {
    await run.terminate();
  } catch (terminationError: unknown) {
    if (extractionError === undefined) throw terminationError;
  }
  if (extractionError !== undefined) throw extractionError;

  return { pagesBySource, sourceDigests };
}

export interface AtomicPublishDependencies {
  readonly processId: number;
  writeFile(path: string, content: string): Promise<unknown>;
  rename(source: string, destination: string): Promise<unknown>;
  removeFile(path: string): Promise<unknown>;
}

export async function publishAtomically(
  destination: string,
  content: string,
  dependencies: AtomicPublishDependencies,
): Promise<void> {
  const temporaryPath = `${destination}.tmp-${dependencies.processId}`;
  let publishError: unknown;
  try {
    await dependencies.writeFile(temporaryPath, content);
    await dependencies.rename(temporaryPath, destination);
  } catch (error: unknown) {
    publishError = error;
  }

  try {
    await dependencies.removeFile(temporaryPath);
  } catch (cleanupError: unknown) {
    if (publishError === undefined) throw cleanupError;
  }
  if (publishError !== undefined) throw publishError;
}

export type KnowledgeIndexMode = "generate" | "verify";

export function parseKnowledgeIndexMode(
  arguments_: readonly string[],
): KnowledgeIndexMode {
  if (
    arguments_.length !== 1 ||
    (arguments_[0] !== "--generate" && arguments_[0] !== "--verify")
  ) {
    throw new Error("Choose exactly one knowledge index mode");
  }
  return arguments_[0] === "--generate" ? "generate" : "verify";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeKnowledgeText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function sha256(content: string | Uint8Array): string {
  const hash = createHash("sha256");
  if (typeof content === "string") hash.update(content, "utf8");
  else hash.update(content);
  return hash.digest("hex");
}

export function buildTerms(text: string): readonly string[] {
  const normalized = text.normalize("NFKC").toLowerCase();
  const matches = normalized.matchAll(
    /(?<cjk>\p{Script=Han}+)|(?<english>[a-z0-9]+(?:['-][a-z0-9]+)*)/gu,
  );
  const terms: string[] = [];
  const seen = new Set<string>();
  const add = (term: string): void => {
    if (term && !seen.has(term)) {
      seen.add(term);
      terms.push(term);
    }
  };

  for (const match of matches) {
    const cjk = match.groups?.cjk;
    if (cjk) {
      const characters = Array.from(cjk);
      if (characters.length === 1) add(characters[0]!);
      else {
        for (let index = 0; index < characters.length - 1; index += 1) {
          add(`${characters[index]}${characters[index + 1]}`);
        }
      }
      continue;
    }
    add(match.groups?.english ?? "");
  }

  return terms;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) result[key] = stableValue(child);
  }
  return result;
}

export function stableSerialize(value: unknown): string {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function containsLabeledPhone(text: string): boolean {
  const matches = text.matchAll(
    /(?:phone|mobile|tel(?:ephone)?|联系电话|联系手机|手机号|手机|电话)\s*[:：]?\s*([+()\d][+()\d .-]{5,}\d)/giu,
  );
  for (const match of matches) {
    const digits = (match[1] ?? "").replace(/\D/gu, "");
    if (digits.length >= 7) return true;
  }
  return false;
}

export function assertPrivacySafe(text: string): void {
  const normalized = text.normalize("NFKC");
  const withoutApprovedEmail = normalized.replaceAll(
    new RegExp(APPROVED_PUBLIC_EMAIL.replace(".", "\\."), "giu"),
    "[APPROVED_PUBLIC_EMAIL]",
  );
  const hasUnapprovedEmail =
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(
      withoutApprovedEmail,
    );
  const hasChineseMobile = /(?<!\d)1[3-9]\d{9}(?!\d)/u.test(normalized);
  const hasPrivateAddress =
    /\bPRIVATE_ADDRESS\b/iu.test(normalized) ||
    /(?:address|home address|住址|家庭地址|联系地址)\s*[:：]\s*\S+/iu.test(
      normalized,
    );
  const hasPrivateQq = /(?:qq|扣扣)\s*[:：]?\s*\d{5,12}/iu.test(normalized);

  if (
    hasUnapprovedEmail ||
    hasChineseMobile ||
    containsLabeledPhone(normalized) ||
    hasPrivateAddress ||
    hasPrivateQq
  ) {
    throw new Error("Private contact data detected");
  }
}

function validateSourceManifest(sources: readonly KnowledgeSource[]): void {
  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (!source.id || sourceIds.has(source.id)) {
      throw new Error(`Duplicate knowledge source ID: ${source.id}`);
    }
    sourceIds.add(source.id);
    if (!source.title || !source.publicHref) {
      throw new Error(`Knowledge source ${source.id} has no public viewer target`);
    }

    if (source.kind === "profile") {
      if (!source.structuredText) {
        throw new Error(`Knowledge source ${source.id} has no structured content`);
      }
    } else {
      if (!source.filePath) {
        throw new Error(`Knowledge source ${source.id} has no file path`);
      }
      if (
        !Number.isInteger(source.pageCount) ||
        (source.pageCount ?? 0) < 1
      ) {
        throw new Error(`Knowledge source ${source.id} has an invalid page count`);
      }
      const visualPages = new Set<number>();
      for (const pageNumber of source.visualPages ?? []) {
        if (
          visualPages.has(pageNumber) ||
          !Number.isInteger(pageNumber) ||
          pageNumber < 1 ||
          pageNumber > source.pageCount!
        ) {
          throw new Error(
            `Knowledge source ${source.id} has an invalid visual page`,
          );
        }
        visualPages.add(pageNumber);
      }
    }
    assertPrivacySafe(stableSerialize(source));
  }
}

function validateExtractedPages(
  source: KnowledgeSource,
  pages: readonly ExtractedPage[],
): readonly ExtractedPage[] {
  const sortedPages = [...pages].sort((left, right) => left.page - right.page);
  const expectedPageCount = source.kind === "profile" ? 1 : source.pageCount!;
  if (sortedPages.length !== expectedPageCount) {
    throw new Error(
      `Knowledge source ${source.id} page count mismatch: expected ${expectedPageCount}, received ${sortedPages.length}`,
    );
  }

  const visualPages = new Set(source.visualPages ?? []);
  sortedPages.forEach((extractedPage, index) => {
    const expectedPage = index + 1;
    if (extractedPage.page !== expectedPage) {
      throw new Error(
        `Knowledge source ${source.id} has invalid extracted page ${extractedPage.page}`,
      );
    }
    assertPrivacySafe(extractedPage.text);
    if (
      !visualPages.has(extractedPage.page) &&
      normalizeKnowledgeText(extractedPage.text).length === 0
    ) {
      throw new Error(
        `Knowledge source ${source.id} page ${extractedPage.page} has no searchable content`,
      );
    }
  });
  return sortedPages;
}

export function chunkExtractedPages(
  source: KnowledgeSource,
  pages: readonly ExtractedPage[],
  options: ChunkingOptions = {},
): readonly KnowledgeChunk[] {
  const chunkCharacters =
    options.chunkCharacters ?? DEFAULT_CHUNK_CHARACTERS;
  const overlapCharacters =
    options.overlapCharacters ?? DEFAULT_OVERLAP_CHARACTERS;
  if (
    !Number.isInteger(chunkCharacters) ||
    chunkCharacters < 1 ||
    !Number.isInteger(overlapCharacters) ||
    overlapCharacters < 0 ||
    overlapCharacters >= chunkCharacters
  ) {
    throw new Error("Invalid knowledge chunking configuration");
  }
  if (!source.publicHref) {
    throw new Error(`Knowledge source ${source.id} has no public viewer target`);
  }

  const chunks: KnowledgeChunk[] = [];
  const sortedPages = [...pages].sort((left, right) => left.page - right.page);
  for (const extractedPage of sortedPages) {
    const normalized = normalizeKnowledgeText(extractedPage.text);
    if (!normalized) continue;
    const characters = Array.from(normalized);
    const step = chunkCharacters - overlapCharacters;
    let chunkIndex = 0;

    for (let start = 0; start < characters.length; start += step) {
      const text = characters.slice(start, start + chunkCharacters).join("");
      const pageNumber = extractedPage.page;
      const base = {
        id: `${source.id}:p${pageNumber}:c${chunkIndex}`,
        sourceId: source.id,
        ...(source.projectId ? { projectId: source.projectId } : {}),
        page: pageNumber,
        title: source.title,
        text,
        terms: buildTerms(
          [source.title, ...source.aliases, ...source.tags, text].join(" "),
        ),
        aliases: [...source.aliases],
        tags: [...source.tags],
        citationLabel:
          source.kind === "profile"
            ? source.title
            : `${source.title} · p. ${pageNumber}`,
        publicHref: source.publicHref,
      } satisfies KnowledgeChunk;
      chunks.push(base);
      chunkIndex += 1;
      if (start + chunkCharacters >= characters.length) break;
    }
  }

  return chunks;
}

export function buildKnowledgeIndex(
  sources: readonly KnowledgeSource[],
  pagesBySource: ReadonlyMap<string, readonly ExtractedPage[]>,
  sourceDigests: Readonly<Record<string, string>>,
): GeneratedKnowledgeIndex {
  validateSourceManifest(sources);
  const expectedSourceIds = new Set(sources.map(({ id }) => id));
  for (const sourceId of Object.keys(sourceDigests)) {
    if (!expectedSourceIds.has(sourceId)) {
      throw new Error(`Unexpected knowledge source digest: ${sourceId}`);
    }
  }

  const digests: Record<string, string> = {};
  const chunks: KnowledgeChunk[] = [];
  for (const source of sources) {
    const digest = sourceDigests[source.id];
    if (!digest || !/^[a-f0-9]{64}$/u.test(digest)) {
      throw new Error(`Knowledge source ${source.id} has an invalid digest`);
    }
    digests[source.id] = digest;

    const pages = pagesBySource.get(source.id);
    if (!pages) {
      throw new Error(`Knowledge source ${source.id} has no extracted pages`);
    }
    const sourceChunks = chunkExtractedPages(
      source,
      validateExtractedPages(source, pages),
    );
    if (sourceChunks.length === 0) {
      throw new Error(`Knowledge source ${source.id} has no searchable content`);
    }
    chunks.push(...sourceChunks);
  }

  const index: GeneratedKnowledgeIndex = {
    version: 1,
    sourceDigests: digests,
    chunks,
  };
  assertPrivacySafe(stableSerialize(index));
  return index;
}

function requireStringArray(
  value: unknown,
  description: string,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    throw new Error(`Invalid ${description}`);
  }
  return value as string[];
}

export function validateGeneratedIndex(
  candidate: unknown,
  sources: readonly KnowledgeSource[],
  currentDigests: Readonly<Record<string, string>>,
): GeneratedKnowledgeIndex {
  validateSourceManifest(sources);
  if (!isRecord(candidate) || candidate.version !== 1) {
    throw new Error("Invalid generated knowledge index version");
  }
  if (!isRecord(candidate.sourceDigests) || !Array.isArray(candidate.chunks)) {
    throw new Error("Invalid generated knowledge index schema");
  }

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const digestIds = Object.keys(candidate.sourceDigests);
  if (
    digestIds.length !== sources.length ||
    digestIds.some((sourceId) => !sourceById.has(sourceId))
  ) {
    throw new Error("Generated knowledge source IDs do not match the manifest");
  }
  for (const source of sources) {
    const indexedDigest = candidate.sourceDigests[source.id];
    const currentDigest = currentDigests[source.id];
    if (
      typeof indexedDigest !== "string" ||
      !/^[a-f0-9]{64}$/u.test(indexedDigest)
    ) {
      throw new Error(`Invalid digest for knowledge source ${source.id}`);
    }
    if (indexedDigest !== currentDigest) {
      throw new Error(`Knowledge source digest mismatch: ${source.id}`);
    }
  }

  const seenChunkIds = new Set<string>();
  const sourceChunkCounts = new Map<string, number>();
  const pageChunkCounts = new Map<string, number>();
  const chunks: KnowledgeChunk[] = [];
  for (const value of candidate.chunks) {
    if (!isRecord(value) || typeof value.id !== "string") {
      throw new Error("Invalid generated knowledge chunk schema");
    }
    if (seenChunkIds.has(value.id)) {
      throw new Error(`Duplicate knowledge chunk ID: ${value.id}`);
    }
    seenChunkIds.add(value.id);

    if (typeof value.sourceId !== "string") {
      throw new Error(`Invalid source for knowledge chunk ${value.id}`);
    }
    const source = sourceById.get(value.sourceId);
    if (!source) {
      throw new Error(`Invalid source for knowledge chunk ${value.id}`);
    }
    if (!Number.isInteger(value.page)) {
      throw new Error(`Invalid page for knowledge chunk ${value.id}`);
    }
    const pageNumber = value.page as number;
    const maximumPage = source.kind === "profile" ? 1 : source.pageCount!;
    if (pageNumber < 1 || pageNumber > maximumPage) {
      throw new Error(`Invalid page for knowledge chunk ${value.id}`);
    }

    const pageKey = `${source.id}:${pageNumber}`;
    const expectedChunkIndex = pageChunkCounts.get(pageKey) ?? 0;
    const expectedId = `${source.id}:p${pageNumber}:c${expectedChunkIndex}`;
    if (value.id !== expectedId) {
      throw new Error(`Invalid stable knowledge chunk ID: ${value.id}`);
    }
    pageChunkCounts.set(pageKey, expectedChunkIndex + 1);

    const expectedCitation =
      source.kind === "profile"
        ? source.title
        : `${source.title} · p. ${pageNumber}`;
    if (value.publicHref !== source.publicHref) {
      throw new Error(
        `Invalid public viewer target for knowledge chunk ${value.id}`,
      );
    }
    if (value.citationLabel !== expectedCitation) {
      throw new Error(`Invalid citation label for knowledge chunk ${value.id}`);
    }
    if (value.projectId !== source.projectId) {
      throw new Error(`Invalid project for knowledge chunk ${value.id}`);
    }
    if (value.title !== source.title) {
      throw new Error(`Invalid title for knowledge chunk ${value.id}`);
    }
    if (typeof value.text !== "string" || !normalizeKnowledgeText(value.text)) {
      throw new Error(`Empty knowledge chunk ${value.id}`);
    }
    requireStringArray(value.terms, `terms for knowledge chunk ${value.id}`);
    if (
      !Array.isArray(value.aliases) ||
      value.aliases.some((item) => typeof item !== "string") ||
      !Array.isArray(value.tags) ||
      value.tags.some((item) => typeof item !== "string")
    ) {
      throw new Error(`Invalid metadata for knowledge chunk ${value.id}`);
    }
    assertPrivacySafe(stableSerialize(value));
    sourceChunkCounts.set(
      source.id,
      (sourceChunkCounts.get(source.id) ?? 0) + 1,
    );
    chunks.push(value as unknown as KnowledgeChunk);
  }

  for (const source of sources) {
    if (!sourceChunkCounts.has(source.id)) {
      throw new Error(`Knowledge source ${source.id} has no searchable content`);
    }
  }

  const index = candidate as unknown as GeneratedKnowledgeIndex;
  assertPrivacySafe(stableSerialize(index));
  return index;
}
