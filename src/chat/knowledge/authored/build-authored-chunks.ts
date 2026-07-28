import {
  assertPrivacySafe,
  stableSerialize,
} from "../build-index.js";
import { knowledgeSources } from "../manifest.js";
import { buildTerms } from "../terms.js";
import type {
  AuthoredClaimKnowledgeChunk,
  DocumentAuthoredClaimKnowledgeChunk,
  KnowledgeSource,
  OwnerAuthoredClaimKnowledgeChunk,
} from "../types.js";
import type {
  AuthoredProjectDossier,
  KnowledgeClaim,
  PageKnowledge,
} from "./types.js";

interface ValidatedProjectSource extends KnowledgeSource {
  readonly kind: "project-pdf";
  readonly projectId: string;
  readonly pageCount: number;
  readonly publicHref: string;
}

function cleanText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function normalizedUniqueKey(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, "");
}

function deepFreeze<T>(value: T): T {
  if (
    typeof value !== "object"
    || value === null
    || Object.isFrozen(value)
  ) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function resolveManifestSource(
  projectId: string,
  sources: readonly KnowledgeSource[],
): ValidatedProjectSource {
  const matches = sources.filter(
    (source) => source.kind === "project-pdf" && source.id === projectId,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Project ${projectId} manifest: expected 1 project-pdf match, found ${matches.length}`,
    );
  }

  const source = matches[0]!;
  if (source.projectId !== projectId) {
    throw new Error(`Project ${projectId} manifest has an invalid project ID`);
  }
  if (
    typeof source.publicHref !== "string"
    || source.publicHref.trim().length === 0
  ) {
    throw new Error(
      `Project ${projectId} manifest has an invalid public viewer target`,
    );
  }
  const pageCount = source.pageCount;
  if (
    typeof pageCount !== "number"
    || !Number.isInteger(pageCount)
    || pageCount < 1
  ) {
    throw new Error(
      `Project ${projectId} manifest has an invalid page count`,
    );
  }

  const normalizedTags = new Set<string>();
  for (const tag of source.tags) {
    const key = normalizedUniqueKey(tag);
    if (key.length === 0 || normalizedTags.has(key)) {
      throw new Error(`Project ${projectId} manifest has invalid tags`);
    }
    normalizedTags.add(key);
  }
  return {
    ...source,
    kind: "project-pdf",
    projectId,
    pageCount,
    publicHref: source.publicHref,
  };
}

function buildQuestionAliases(
  dossier: AuthoredProjectDossier,
  claimId: string,
): readonly string[] {
  const aliases: string[] = [];
  const seen = new Set<string>();
  for (const commonQuestion of dossier.commonQuestions) {
    if (!commonQuestion.preferredClaimIds.includes(claimId)) continue;
    const question = cleanText(commonQuestion.question);
    const key = normalizedUniqueKey(question);
    if (key.length === 0) {
      throw new Error(`Claim ${claimId} has an invalid question alias`);
    }
    if (seen.has(key)) continue;
    seen.add(key);
    aliases.push(question);
  }
  return aliases;
}

function resolveEvidencePages(
  dossier: AuthoredProjectDossier,
  claim: KnowledgeClaim,
  maximumPage: number,
): {
  readonly evidencePages: readonly number[];
  readonly anchor: PageKnowledge;
} {
  if (claim.evidence.length === 0) {
    throw new Error(`Claim ${claim.id} requires evidence`);
  }

  const evidencePages = [...new Set(claim.evidence.map((item) => {
    if (item.sourceId !== dossier.projectId) {
      throw new Error(`Claim ${claim.id} has an invalid evidence source`);
    }
    if (
      !Number.isInteger(item.page)
      || item.page < 1
      || item.page > maximumPage
    ) {
      throw new Error(`Claim ${claim.id} has an invalid evidence page`);
    }
    return item.page;
  }))].sort((left, right) => left - right);

  let anchor: PageKnowledge | undefined;
  for (const evidencePage of evidencePages) {
    const matches = dossier.pages.filter(({ page }) => page === evidencePage);
    if (matches.length !== 1) {
      throw new Error(
        `Claim ${claim.id} evidence page ${evidencePage} has no unique authored page`,
      );
    }
    const page = matches[0]!;
    if (!page.claimIds.includes(claim.id)) {
      throw new Error(
        `Claim ${claim.id} evidence page ${evidencePage} has no claim backlink`,
      );
    }
    anchor ??= page;
  }

  return { evidencePages, anchor: anchor! };
}

function buildTermsForClaim(
  dossier: AuthoredProjectDossier,
  claim: KnowledgeClaim,
  text: string,
  questionAliases: readonly string[],
): readonly string[] {
  return buildTerms([
    ...claim.topics,
    ...claim.intents,
    ...dossier.aliases,
    dossier.title,
    text,
    ...questionAliases,
  ].join(" "));
}

function buildClaimChunk(
  dossier: AuthoredProjectDossier,
  source: ValidatedProjectSource,
  claim: KnowledgeClaim,
): AuthoredClaimKnowledgeChunk {
  const text = cleanText(claim.text);
  if (text.length === 0) {
    throw new Error(`Claim ${claim.id} has no searchable text`);
  }
  const questionAliases = buildQuestionAliases(dossier, claim.id);
  const common = {
    id: `${dossier.projectId}:claim:${claim.id}`,
    sourceId: dossier.projectId,
    projectId: dossier.projectId,
    title: dossier.title,
    text,
    terms: [...buildTermsForClaim(dossier, claim, text, questionAliases)],
    aliases: [...dossier.aliases],
    tags: [...source.tags],
    publicHref: source.publicHref,
    knowledgeKind: "authored-claim",
    intents: [...claim.intents],
    informationDensity: "high",
    questionAliases: [...questionAliases],
  } as const;

  if (claim.provenance === "owner_statement") {
    if (claim.evidence.length > 0) {
      throw new Error(
        `Claim ${claim.id} owner statement cannot have evidence`,
      );
    }
    return {
      ...common,
      citationLabel: `${dossier.title} · Owner-confirmed`,
      provenance: "owner_statement",
      pageRole: "owner-confirmed",
      evidencePages: [],
    } satisfies OwnerAuthoredClaimKnowledgeChunk;
  }

  if (
    claim.provenance !== "document_fact"
    && claim.provenance !== "document_synthesis"
  ) {
    throw new Error(`Claim ${claim.id} has invalid public provenance`);
  }

  const { evidencePages, anchor } = resolveEvidencePages(
    dossier,
    claim,
    source.pageCount,
  );
  return {
    ...common,
    page: anchor.page,
    citationLabel: `${dossier.title} · p. ${anchor.page}`,
    provenance: claim.provenance,
    pageRole: anchor.role,
    evidencePages: [...evidencePages],
  } satisfies DocumentAuthoredClaimKnowledgeChunk;
}

export function buildAuthoredChunks(
  dossiers: readonly AuthoredProjectDossier[],
  sources: readonly KnowledgeSource[] = knowledgeSources,
): readonly AuthoredClaimKnowledgeChunk[] {
  const chunks: AuthoredClaimKnowledgeChunk[] = [];
  const stableIds = new Set<string>();

  for (const dossier of dossiers) {
    const source = resolveManifestSource(dossier.projectId, sources);
    if (dossier.pageCount !== source.pageCount) {
      throw new Error(
        `Project ${dossier.projectId} page count mismatch: expected ${source.pageCount}, actual ${dossier.pageCount}`,
      );
    }
    for (const claim of dossier.claims) {
      if (!claim.public || claim.provenance === "candidate_contribution") {
        continue;
      }
      const chunk = buildClaimChunk(dossier, source, claim);
      if (stableIds.has(chunk.id)) {
        throw new Error(`Duplicate authored knowledge chunk ID: ${chunk.id}`);
      }
      stableIds.add(chunk.id);
      assertPrivacySafe(stableSerialize(chunk));
      chunks.push(deepFreeze(chunk));
    }
  }

  return Object.freeze(chunks);
}
