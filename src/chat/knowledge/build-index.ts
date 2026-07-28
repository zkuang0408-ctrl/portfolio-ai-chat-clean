import { createHash } from "node:crypto";

import type {
  AuthoredClaimKnowledgeChunk,
  ExtractedPage,
  GeneratedKnowledgeIndex,
  KnowledgeChunk,
  KnowledgeSource,
  SourceExcerptKnowledgeChunk,
} from "./types.js";
import type {
  KnowledgeIntent,
  PageInformationDensity,
  PageKnowledge,
} from "./authored/types.js";
import { attachCleanupError, runWithCleanup } from "./cleanup-error.js";
import { buildTerms } from "./terms.js";

export { buildTerms } from "./terms.js";

export const DEFAULT_CHUNK_CHARACTERS = 1_200;
export const DEFAULT_OVERLAP_CHARACTERS = 150;
export const APPROVED_PUBLIC_EMAIL = "zkuang0408@gmail.com";
const KNOWLEDGE_INTENTS = [
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
const INFORMATION_DENSITIES = [
  "low",
  "medium",
  "high",
] as const satisfies readonly PageInformationDensity[];

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
      const pages = await runWithCleanup(
        () =>
          dependencies.extractPages(loaded.document, {
            expectedPageCount: source.pageCount,
            visualPages: source.visualPages,
            ocrPage: run.ocrPage,
          }),
        () => loaded.destroy(),
        "PDF document cleanup also failed",
      );
      pagesBySource.set(source.id, pages);
      sourceDigests[source.id] = loaded.digest;
    }
  } catch (error: unknown) {
    extractionError = error;
  }

  try {
    await run.terminate();
  } catch (terminationError: unknown) {
    if (extractionError === undefined) throw terminationError;
    extractionError = attachCleanupError(
      extractionError,
      terminationError,
      "OCR termination also failed",
    );
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
    publishError = attachCleanupError(
      publishError,
      cleanupError,
      "Temporary index cleanup also failed",
    );
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

function containsPhoneCandidate(text: string): boolean {
  if (/(?<!\d)1[3-9]\d{9}(?!\d)/u.test(text)) return true;

  for (const match of text.matchAll(
    /(?<![\p{L}\p{N}])\+(?:[\d(][\d() .-]{5,}\d)/gu,
  )) {
    const digits = match[0].replace(/\D/gu, "");
    if (digits.length >= 8 && digits.length <= 15) return true;
  }

  const nonPhoneContext =
    /(?:year(?:\s+range)?|timeline|dimensions?|page(?:\s+range)?|model|serial|product(?:\s+code)?|date|年份|日期|尺寸|页码|型号|序列号|产品(?:编号)?)\s*[:：#-]?\s*$/iu;
  for (const line of text.split(/\r?\n/u)) {
    for (const match of line.matchAll(
      /(?<![\p{L}\p{N}-])(?:\(\d{2,4}\)|\d{2,4})[ .-]+\d{3,4}[ .-]+\d{3,4}(?![\p{L}\p{N}-])/gu,
    )) {
      const digits = match[0].replace(/\D/gu, "");
      if (digits.length < 10 || digits.length > 11) continue;
      const prefix = line.slice(
        Math.max(0, (match.index ?? 0) - 40),
        match.index ?? 0,
      );
      if (!nonPhoneContext.test(prefix)) return true;
    }
  }
  return false;
}

function containsPrivateAddress(text: string): boolean {
  const technicalAddress =
    /\b(?:ip|memory|network|physical|virtual|return|base|web|email)\s+address\b|\baddress\s+(?:bus|space|width|register)\b/iu;
  const privateMarker = /\bPRIVATE_ADDRESS\b/iu;
  const contactLabel =
    /(?:\b(?:home|residential|mailing|contact)\s+address\b|家庭地址|联系地址|住址)\s*[:：]?\s*\S+/iu;
  const genericAddressLabel = /\baddress\s*[:：]\s*\S+/iu;
  const streetAddress =
    /(?:\b\d{1,6}\s+[\p{L}][\p{L} .'-]{0,60}\s+(?:street|st|avenue|ave|road|rd|lane|ln|boulevard|blvd|drive|dr)\b|(?:路|街|道|巷)\s*\d+\s*号)/iu;

  return text.split(/\r?\n/u).some((line) => {
    if (
      privateMarker.test(line) ||
      contactLabel.test(line) ||
      streetAddress.test(line)
    ) {
      return true;
    }
    if (technicalAddress.test(line)) return false;
    return genericAddressLabel.test(line);
  });
}

export function assertPrivacySafe(text: string): void {
  const normalized = text.normalize("NFKC");
  const emailTokens = normalized.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu,
  ) ?? [];
  const hasUnapprovedEmail = emailTokens.some(
    (email) => email.toLowerCase() !== APPROVED_PUBLIC_EMAIL.toLowerCase(),
  );
  const hasPrivateQq = /(?:qq|扣扣)\s*[:：]?\s*\d{5,12}/iu.test(normalized);

  if (
    hasUnapprovedEmail ||
    containsPhoneCandidate(normalized) ||
    containsLabeledPhone(normalized) ||
    containsPrivateAddress(normalized) ||
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

function resolveSourcePageKnowledge(
  source: KnowledgeSource,
  pageNumber: number,
  pageKnowledge: ReadonlyMap<string, PageKnowledge>,
): {
  readonly informationDensity: PageInformationDensity;
  readonly pageRole: string;
} {
  if (source.kind === "profile") {
    return { informationDensity: "medium", pageRole: "profile" };
  }
  if (source.kind === "resume") {
    return { informationDensity: "medium", pageRole: "resume" };
  }
  if (!source.projectId) {
    throw new Error(`Knowledge source ${source.id} has no project ID`);
  }
  const key = `${source.projectId}:p${pageNumber}`;
  const authoredPage = pageKnowledge.get(key);
  if (!authoredPage || authoredPage.page !== pageNumber) {
    throw new Error(`Knowledge source ${source.id} page ${pageNumber} has no authored page metadata`);
  }
  if (
    !INFORMATION_DENSITIES.includes(authoredPage.informationDensity)
    || typeof authoredPage.role !== "string"
    || authoredPage.role.length === 0
  ) {
    throw new Error(`Knowledge source ${source.id} page ${pageNumber} has invalid authored page metadata`);
  }
  return {
    informationDensity: authoredPage.informationDensity,
    pageRole: authoredPage.role,
  };
}

function chunkSourcePage(
  source: KnowledgeSource,
  extractedPage: ExtractedPage,
  pageKnowledge: ReadonlyMap<string, PageKnowledge>,
  options: Required<ChunkingOptions>,
): readonly SourceExcerptKnowledgeChunk[] {
  const normalized = normalizeKnowledgeText(extractedPage.text);
  if (!normalized) return [];
  const { informationDensity, pageRole } = resolveSourcePageKnowledge(
    source,
    extractedPage.page,
    pageKnowledge,
  );
  const characters = Array.from(normalized);
  const chunks: SourceExcerptKnowledgeChunk[] = [];
  let chunkIndex = 0;
  let start = 0;

  while (start < characters.length) {
    let end = Math.min(start + options.chunkCharacters, characters.length);
    if (end < characters.length) {
      while (
        end > start + options.overlapCharacters
        && (
          characters[end - 1] === " "
          || (
            options.overlapCharacters > 0
            && characters[end - options.overlapCharacters] === " "
          )
        )
      ) {
        end -= 1;
      }
      if (end <= start + options.overlapCharacters) {
        throw new Error("Unable to create normalized knowledge chunk overlap");
      }
    }
    const text = characters.slice(start, end).join("");
    const pageNumber = extractedPage.page;
    chunks.push({
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
      publicHref: source.publicHref!,
      knowledgeKind: "source-excerpt",
      intents: [],
      informationDensity,
      pageRole,
      evidencePages: [pageNumber],
      questionAliases: [],
    });
    chunkIndex += 1;
    if (end >= characters.length) break;
    start = end - options.overlapCharacters;
  }
  return chunks;
}

export function chunkExtractedPages(
  source: KnowledgeSource,
  pages: readonly ExtractedPage[],
  pageKnowledge: ReadonlyMap<string, PageKnowledge>,
  options: ChunkingOptions = {},
): readonly SourceExcerptKnowledgeChunk[] {
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

  const chunks: SourceExcerptKnowledgeChunk[] = [];
  const sortedPages = [...pages].sort((left, right) => left.page - right.page);
  for (const extractedPage of sortedPages) {
    chunks.push(...chunkSourcePage(source, extractedPage, pageKnowledge, {
      chunkCharacters,
      overlapCharacters,
    }));
  }

  return chunks;
}

function validateIntentAliases(
  value: unknown,
): Readonly<Record<KnowledgeIntent, readonly string[]>> {
  if (!isRecord(value)) throw new Error("Invalid knowledge intent aliases");
  requireExactKeys(value, KNOWLEDGE_INTENTS, "knowledge intent aliases");
  const result = {} as Record<KnowledgeIntent, readonly string[]>;
  for (const intent of KNOWLEDGE_INTENTS) {
    result[intent] = requireStringArray(
      value[intent],
      `aliases for knowledge intent ${intent}`,
      true,
    );
  }
  return result;
}

export function buildKnowledgeIndex(
  sources: readonly KnowledgeSource[],
  pagesBySource: ReadonlyMap<string, readonly ExtractedPage[]>,
  sourceDigests: Readonly<Record<string, string>>,
  authoredChunks: readonly AuthoredClaimKnowledgeChunk[],
  pageKnowledge: ReadonlyMap<string, PageKnowledge>,
  intentAliases: Readonly<Record<KnowledgeIntent, readonly string[]>>,
  authoredDigest: string,
): GeneratedKnowledgeIndex {
  validateSourceManifest(sources);
  if (!/^[a-f0-9]{64}$/u.test(authoredDigest)) {
    throw new Error("Invalid authored digest");
  }
  const validatedIntentAliases = validateIntentAliases(intentAliases);
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
      pageKnowledge,
    );
    if (sourceChunks.length === 0) {
      throw new Error(`Knowledge source ${source.id} has no searchable content`);
    }
    chunks.push(...sourceChunks);
  }

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const seenChunkIds = new Set(chunks.map(({ id }) => id));
  for (const candidate of authoredChunks) {
    const chunk = validateAuthoredChunk(
      candidate,
      sourceById,
      pageKnowledge,
    );
    if (seenChunkIds.has(chunk.id)) {
      throw new Error(`Duplicate knowledge chunk ID: ${chunk.id}`);
    }
    seenChunkIds.add(chunk.id);
    chunks.push(chunk);
  }

  const index: GeneratedKnowledgeIndex = {
    version: 2,
    sourceDigests: digests,
    authoredDigest,
    intentAliases: validatedIntentAliases,
    chunks,
  };
  assertPrivacySafe(stableSerialize(index));
  return index;
}

function requireStringArray(
  value: unknown,
  description: string,
  allowEmpty = false,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    throw new Error(`Invalid ${description}`);
  }
  return value.map((item) => String(item));
}

function requireExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  description: string,
): void {
  const actualKeys = Object.keys(value).sort();
  const canonicalKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== canonicalKeys.length ||
    actualKeys.some((key, index) => key !== canonicalKeys[index])
  ) {
    throw new Error(`Invalid ${description} keys`);
  }
}

function requireString(value: unknown, description: string): string {
  if (typeof value !== "string") throw new Error(`Invalid ${description}`);
  return value;
}

function requireInteger(value: unknown, description: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Invalid ${description}`);
  }
  return value;
}

function arraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function requireIntentArray(
  value: unknown,
  description: string,
  allowEmpty: boolean,
): readonly KnowledgeIntent[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`Invalid ${description}`);
  }
  const result: KnowledgeIntent[] = [];
  for (const candidate of value) {
    if (
      typeof candidate !== "string"
      || !KNOWLEDGE_INTENTS.includes(candidate as KnowledgeIntent)
      || result.includes(candidate as KnowledgeIntent)
    ) {
      throw new Error(`Invalid ${description}`);
    }
    result.push(candidate as KnowledgeIntent);
  }
  return result;
}

function requireEvidencePages(
  value: unknown,
  description: string,
): readonly number[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${description}`);
  return value.map((candidate) => {
    if (typeof candidate !== "number" || !Number.isInteger(candidate)) {
      throw new Error(`Invalid ${description}`);
    }
    return candidate;
  });
}

function requireDensity(
  value: unknown,
  description: string,
): PageInformationDensity {
  if (
    typeof value !== "string"
    || !INFORMATION_DENSITIES.includes(value as PageInformationDensity)
  ) {
    throw new Error(`Invalid ${description}`);
  }
  return value as PageInformationDensity;
}

function validateRawChunk(
  value: Record<string, unknown>,
  source: KnowledgeSource,
  pageKnowledge: ReadonlyMap<string, PageKnowledge>,
): SourceExcerptKnowledgeChunk {
  const id = requireString(value.id, "knowledge chunk ID");
  requireExactKeys(
    value,
    [
      "id",
      "sourceId",
      ...(source.projectId === undefined ? [] : ["projectId"]),
      "page",
      "title",
      "text",
      "terms",
      "aliases",
      "tags",
      "citationLabel",
      "publicHref",
      "knowledgeKind",
      "intents",
      "informationDensity",
      "pageRole",
      "evidencePages",
      "questionAliases",
    ],
    `knowledge chunk ${id}`,
  );
  if (value.knowledgeKind !== "source-excerpt") {
    throw new Error(`Invalid knowledge kind for knowledge chunk ${id}`);
  }
  const sourceId = requireString(
    value.sourceId,
    `source for knowledge chunk ${id}`,
  );
  if (sourceId !== source.id) {
    throw new Error(`Invalid source for knowledge chunk ${id}`);
  }
  const pageNumber = requireInteger(value.page, `page for knowledge chunk ${id}`);
  const maximumPage = source.kind === "profile" ? 1 : source.pageCount!;
  if (pageNumber < 1 || pageNumber > maximumPage) {
    throw new Error(`Invalid page for knowledge chunk ${id}`);
  }
  if (value.projectId !== source.projectId) {
    throw new Error(`Invalid project for knowledge chunk ${id}`);
  }
  if (value.title !== source.title) {
    throw new Error(`Invalid title for knowledge chunk ${id}`);
  }
  const expectedCitation =
    source.kind === "profile"
      ? source.title
      : `${source.title} · p. ${pageNumber}`;
  if (value.publicHref !== source.publicHref) {
    throw new Error(`Invalid public viewer target for knowledge chunk ${id}`);
  }
  if (value.citationLabel !== expectedCitation) {
    throw new Error(`Invalid citation label for knowledge chunk ${id}`);
  }
  const text = requireString(value.text, `text for knowledge chunk ${id}`);
  if (!text || text !== normalizeKnowledgeText(text)) {
    throw new Error(`Invalid normalized text for knowledge chunk ${id}`);
  }
  if (Array.from(text).length > DEFAULT_CHUNK_CHARACTERS) {
    throw new Error(`Knowledge chunk exceeds maximum length: ${id}`);
  }
  let aliases: readonly string[];
  let tags: readonly string[];
  try {
    aliases = requireStringArray(
      value.aliases,
      `aliases for knowledge chunk ${id}`,
      true,
    );
    tags = requireStringArray(
      value.tags,
      `tags for knowledge chunk ${id}`,
      true,
    );
  } catch {
    throw new Error(`Invalid metadata for knowledge chunk ${id}`);
  }
  if (!arraysEqual(aliases, source.aliases) || !arraysEqual(tags, source.tags)) {
    throw new Error(`Invalid metadata for knowledge chunk ${id}`);
  }
  const terms = requireStringArray(
    value.terms,
    `terms for knowledge chunk ${id}`,
  );
  const expectedTerms = buildTerms(
    [source.title, ...source.aliases, ...source.tags, text].join(" "),
  );
  if (!arraysEqual(terms, expectedTerms)) {
    throw new Error(`Invalid terms for knowledge chunk ${id}`);
  }
  const intents = requireIntentArray(
    value.intents,
    `intents for knowledge chunk ${id}`,
    true,
  );
  if (intents.length !== 0) {
    throw new Error(`Invalid intents for source excerpt ${id}`);
  }
  const evidencePages = requireEvidencePages(
    value.evidencePages,
    `evidence pages for knowledge chunk ${id}`,
  );
  if (evidencePages.length !== 1 || evidencePages[0] !== pageNumber) {
    throw new Error(`Invalid evidence pages for source excerpt ${id}`);
  }
  const questionAliases = requireStringArray(
    value.questionAliases,
    `question aliases for knowledge chunk ${id}`,
    true,
  );
  if (questionAliases.length !== 0) {
    throw new Error(`Invalid question aliases for source excerpt ${id}`);
  }
  const expectedPageKnowledge = resolveSourcePageKnowledge(
    source,
    pageNumber,
    pageKnowledge,
  );
  if (
    requireDensity(
      value.informationDensity,
      `information density for knowledge chunk ${id}`,
    ) !== expectedPageKnowledge.informationDensity
    || requireString(value.pageRole, `page role for knowledge chunk ${id}`)
      !== expectedPageKnowledge.pageRole
  ) {
    throw new Error(`Invalid page metadata for knowledge chunk ${id}`);
  }

  const chunk: SourceExcerptKnowledgeChunk = {
    id,
    sourceId,
    ...(source.projectId === undefined ? {} : { projectId: source.projectId }),
    page: pageNumber,
    title: source.title,
    text,
    terms: [...terms],
    aliases: [...aliases],
    tags: [...tags],
    citationLabel: expectedCitation,
    publicHref: source.publicHref!,
    knowledgeKind: "source-excerpt",
    intents: [],
    informationDensity: expectedPageKnowledge.informationDensity,
    pageRole: expectedPageKnowledge.pageRole,
    evidencePages: [pageNumber],
    questionAliases: [],
  };
  assertPrivacySafe(stableSerialize(chunk));
  return chunk;
}

function validateAuthoredChunk(
  candidate: unknown,
  sourceById: ReadonlyMap<string, KnowledgeSource>,
  pageKnowledge: ReadonlyMap<string, PageKnowledge>,
): AuthoredClaimKnowledgeChunk {
  if (!isRecord(candidate)) {
    throw new Error("Invalid authored knowledge chunk schema");
  }
  const id = requireString(candidate.id, "authored knowledge chunk ID");
  if (candidate.provenance === "candidate_contribution") {
    throw new Error(`Candidate contribution cannot be published: ${id}`);
  }
  if (candidate.knowledgeKind !== "authored-claim") {
    throw new Error(`Invalid knowledge kind for authored chunk ${id}`);
  }
  const sourceId = requireString(
    candidate.sourceId,
    `source for authored chunk ${id}`,
  );
  const source = sourceById.get(sourceId);
  if (!source || source.kind !== "project-pdf" || !source.projectId) {
    throw new Error(`Invalid source for authored chunk ${id}`);
  }
  const provenance = candidate.provenance;
  const isOwner = provenance === "owner_statement";
  if (
    !isOwner
    && provenance !== "document_fact"
    && provenance !== "document_synthesis"
  ) {
    throw new Error(`Invalid provenance for authored chunk ${id}`);
  }
  requireExactKeys(
    candidate,
    [
      "id",
      "sourceId",
      "projectId",
      ...(isOwner ? [] : ["page"]),
      "title",
      "text",
      "terms",
      "aliases",
      "tags",
      "citationLabel",
      "publicHref",
      "knowledgeKind",
      "intents",
      "informationDensity",
      "pageRole",
      "provenance",
      "evidencePages",
      "questionAliases",
    ],
    `authored knowledge chunk ${id}`,
  );
  if (candidate.projectId !== source.projectId) {
    throw new Error(`Invalid project for authored chunk ${id}`);
  }
  const title = requireString(candidate.title, `title for authored chunk ${id}`);
  if (title.length === 0) {
    throw new Error(`Invalid title for authored chunk ${id}`);
  }
  if (candidate.publicHref !== source.publicHref) {
    throw new Error(`Invalid public viewer target for authored chunk ${id}`);
  }
  const text = requireString(candidate.text, `text for authored chunk ${id}`);
  if (!text || text !== normalizeKnowledgeText(text)) {
    throw new Error(`Invalid normalized text for authored chunk ${id}`);
  }
  const terms = requireStringArray(candidate.terms, `terms for authored chunk ${id}`);
  const aliases = requireStringArray(
    candidate.aliases,
    `aliases for authored chunk ${id}`,
    true,
  );
  const tags = requireStringArray(
    candidate.tags,
    `tags for authored chunk ${id}`,
    true,
  );
  if (!arraysEqual(tags, source.tags)) {
    throw new Error(`Invalid metadata for authored chunk ${id}`);
  }
  const intents = requireIntentArray(
    candidate.intents,
    `intents for authored chunk ${id}`,
    false,
  );
  if (
    requireDensity(
      candidate.informationDensity,
      `information density for authored chunk ${id}`,
    ) !== "high"
  ) {
    throw new Error(`Invalid information density for authored chunk ${id}`);
  }
  const questionAliases = requireStringArray(
    candidate.questionAliases,
    `question aliases for authored chunk ${id}`,
    true,
  );
  const evidencePages = requireEvidencePages(
    candidate.evidencePages,
    `evidence pages for authored chunk ${id}`,
  );

  let chunk: AuthoredClaimKnowledgeChunk;
  if (isOwner) {
    if (
      candidate.pageRole !== "owner-confirmed"
      || evidencePages.length !== 0
      || candidate.citationLabel !== `${title} · Owner-confirmed`
    ) {
      throw new Error(`Invalid owner-confirmed authored chunk ${id}`);
    }
    chunk = {
      id,
      sourceId,
      projectId: source.projectId,
      title,
      text,
      terms: [...terms],
      aliases: [...aliases],
      tags: [...tags],
      citationLabel: `${title} · Owner-confirmed`,
      publicHref: source.publicHref!,
      knowledgeKind: "authored-claim",
      intents: [...intents],
      informationDensity: "high",
      pageRole: "owner-confirmed",
      provenance: "owner_statement",
      evidencePages: [],
      questionAliases: [...questionAliases],
    };
  } else {
    const pageNumber = requireInteger(
      candidate.page,
      `page for authored chunk ${id}`,
    );
    if (
      pageNumber < 1
      || pageNumber > source.pageCount!
      || evidencePages.length === 0
      || evidencePages[0] !== pageNumber
      || evidencePages.some(
        (page, index) =>
          page < 1
          || page > source.pageCount!
          || (index > 0 && page <= evidencePages[index - 1]!),
      )
    ) {
      throw new Error(`Invalid page or evidence for authored chunk ${id}`);
    }
    const pageMetadata = resolveSourcePageKnowledge(
      source,
      pageNumber,
      pageKnowledge,
    );
    if (
      candidate.pageRole !== pageMetadata.pageRole
      || candidate.citationLabel !== `${title} · p. ${pageNumber}`
    ) {
      throw new Error(`Invalid page metadata for authored chunk ${id}`);
    }
    chunk = {
      id,
      sourceId,
      projectId: source.projectId,
      page: pageNumber,
      title,
      text,
      terms: [...terms],
      aliases: [...aliases],
      tags: [...tags],
      citationLabel: `${title} · p. ${pageNumber}`,
      publicHref: source.publicHref!,
      knowledgeKind: "authored-claim",
      intents: [...intents],
      informationDensity: "high",
      pageRole: pageMetadata.pageRole,
      provenance,
      evidencePages: [...evidencePages],
      questionAliases: [...questionAliases],
    };
  }
  assertPrivacySafe(stableSerialize(chunk));
  return chunk;
}

function validatePageChunkShape(
  source: KnowledgeSource,
  pageNumber: number,
  chunks: readonly SourceExcerptKnowledgeChunk[],
  pageKnowledge: ReadonlyMap<string, PageKnowledge>,
): void {
  chunks.forEach((chunk, chunkIndex) => {
    const expectedId = `${source.id}:p${pageNumber}:c${chunkIndex}`;
    if (chunk.id !== expectedId) {
      throw new Error(`Invalid stable knowledge chunk ID: ${chunk.id}`);
    }
  });

  if (chunks.length < 2) return;
  for (let index = 0; index < chunks.length; index += 1) {
    const characters = Array.from(chunks[index]!.text);
    const isFinal = index === chunks.length - 1;
    if (isFinal && characters.length <= DEFAULT_OVERLAP_CHARACTERS) {
      throw new Error(`Invalid final chunk length: ${chunks[index]!.id}`);
    }
    if (index > 0) {
      const previous = Array.from(chunks[index - 1]!.text);
      const overlap = characters.slice(0, DEFAULT_OVERLAP_CHARACTERS).join("");
      const expectedOverlap = previous
        .slice(-DEFAULT_OVERLAP_CHARACTERS)
        .join("");
      if (overlap !== expectedOverlap) {
        throw new Error(`Invalid knowledge chunk overlap: ${chunks[index]!.id}`);
      }
    }
  }

  const reconstructedText = chunks
    .map((chunk, index) =>
      index === 0
        ? chunk.text
        : Array.from(chunk.text).slice(DEFAULT_OVERLAP_CHARACTERS).join(""),
    )
    .join("");
  const canonicalChunks = chunkExtractedPages(source, [
    {
      page: pageNumber,
      text: reconstructedText,
      method: source.kind === "profile" ? "structured" : "pdf-text",
    },
  ], pageKnowledge);
  if (
    canonicalChunks.length !== chunks.length ||
    canonicalChunks.some(
      (chunk, index) =>
        chunk.id !== chunks[index]?.id || chunk.text !== chunks[index]?.text,
    )
  ) {
    throw new Error(
      `Invalid canonical chunk progression: ${source.id}:p${pageNumber}`,
    );
  }
}

export function validateGeneratedIndex(
  candidate: unknown,
  sources: readonly KnowledgeSource[],
  currentDigests: Readonly<Record<string, string>>,
  authoredChunks: readonly AuthoredClaimKnowledgeChunk[],
  pageKnowledge: ReadonlyMap<string, PageKnowledge>,
  currentIntentAliases: Readonly<Record<KnowledgeIntent, readonly string[]>>,
  currentAuthoredDigest: string,
): GeneratedKnowledgeIndex {
  validateSourceManifest(sources);
  if (!isRecord(candidate)) {
    throw new Error("Invalid generated knowledge index schema");
  }
  requireExactKeys(
    candidate,
    [
      "version",
      "sourceDigests",
      "authoredDigest",
      "intentAliases",
      "chunks",
    ],
    "generated knowledge index",
  );
  if (candidate.version !== 2) {
    throw new Error("Invalid generated knowledge index version");
  }
  if (!isRecord(candidate.sourceDigests) || !Array.isArray(candidate.chunks)) {
    throw new Error("Invalid generated knowledge index schema");
  }
  if (
    typeof candidate.authoredDigest !== "string"
    || !/^[a-f0-9]{64}$/u.test(candidate.authoredDigest)
  ) {
    throw new Error("Invalid authored digest");
  }
  if (!/^[a-f0-9]{64}$/u.test(currentAuthoredDigest)) {
    throw new Error("Invalid current authored digest");
  }
  if (candidate.authoredDigest !== currentAuthoredDigest) {
    throw new Error("Authored digest mismatch");
  }
  const validatedIntentAliases = validateIntentAliases(candidate.intentAliases);
  const expectedIntentAliases = validateIntentAliases(currentIntentAliases);
  if (
    stableSerialize(validatedIntentAliases)
    !== stableSerialize(expectedIntentAliases)
  ) {
    throw new Error("Knowledge intent aliases mismatch");
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

  const digests: Record<string, string> = {};
  for (const source of sources) {
    digests[source.id] = requireString(
      candidate.sourceDigests[source.id],
      `digest for knowledge source ${source.id}`,
    );
  }

  const seenChunkIds = new Set<string>();
  for (const value of candidate.chunks) {
    if (!isRecord(value) || typeof value.id !== "string") continue;
    if (seenChunkIds.has(value.id)) {
      throw new Error(`Duplicate knowledge chunk ID: ${value.id}`);
    }
    seenChunkIds.add(value.id);
  }
  const parsedRawChunks: SourceExcerptKnowledgeChunk[] = [];
  const parsedAuthoredChunks: AuthoredClaimKnowledgeChunk[] = [];
  let authoredStarted = false;
  for (const value of candidate.chunks) {
    if (!isRecord(value)) {
      throw new Error("Invalid generated knowledge chunk schema");
    }
    const id = requireString(value.id, "knowledge chunk ID");
    const sourceId = requireString(value.sourceId, `source for knowledge chunk ${id}`);
    const source = sourceById.get(sourceId);
    if (!source) {
      throw new Error(`Invalid source for knowledge chunk ${id}`);
    }
    if (value.knowledgeKind === "source-excerpt") {
      if (authoredStarted) {
        throw new Error("Generated knowledge chunks are not in canonical order");
      }
      parsedRawChunks.push(validateRawChunk(value, source, pageKnowledge));
    } else {
      authoredStarted = true;
      parsedAuthoredChunks.push(
        validateAuthoredChunk(value, sourceById, pageKnowledge),
      );
    }
  }

  const chunks: KnowledgeChunk[] = [];
  let cursor = 0;
  for (const source of sources) {
    const sourceStart = cursor;
    const maximumPage = source.kind === "profile" ? 1 : source.pageCount!;
    const visualPages = new Set(source.visualPages ?? []);
    for (let pageNumber = 1; pageNumber <= maximumPage; pageNumber += 1) {
      const pageChunks: KnowledgeChunk[] = [];
      while (
        parsedRawChunks[cursor]?.sourceId === source.id &&
        parsedRawChunks[cursor]?.page === pageNumber
      ) {
        pageChunks.push(parsedRawChunks[cursor]!);
        cursor += 1;
      }
      if (pageChunks.length === 0 && !visualPages.has(pageNumber)) {
        throw new Error(
          `Knowledge source ${source.id} page ${pageNumber} has no searchable content`,
        );
      }
      validatePageChunkShape(
        source,
        pageNumber,
        pageChunks as readonly SourceExcerptKnowledgeChunk[],
        pageKnowledge,
      );
      chunks.push(...pageChunks);
    }
    if (cursor === sourceStart) {
      throw new Error(`Knowledge source ${source.id} has no searchable content`);
    }
  }
  if (cursor !== parsedRawChunks.length) {
    throw new Error("Generated knowledge chunks are not in canonical order");
  }
  if (parsedAuthoredChunks.length !== authoredChunks.length) {
    throw new Error("Generated authored knowledge chunks do not match authored data");
  }
  for (let index = 0; index < authoredChunks.length; index += 1) {
    const expected = validateAuthoredChunk(
      authoredChunks[index],
      sourceById,
      pageKnowledge,
    );
    const actual = parsedAuthoredChunks[index]!;
    if (stableSerialize(actual) !== stableSerialize(expected)) {
      throw new Error(
        `Generated authored knowledge chunks are not in canonical order: ${actual.id}`,
      );
    }
    chunks.push(actual);
  }

  const index: GeneratedKnowledgeIndex = {
    version: 2,
    sourceDigests: digests,
    authoredDigest: currentAuthoredDigest,
    intentAliases: validatedIntentAliases,
    chunks,
  };
  assertPrivacySafe(stableSerialize(index));
  return index;
}
