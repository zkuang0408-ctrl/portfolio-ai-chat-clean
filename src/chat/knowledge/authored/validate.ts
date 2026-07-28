import { assertPrivacySafe, stableSerialize } from "../build-index";
import type {
  AuthoredProjectDossier,
  ClaimEvidence,
  ClaimProvenance,
  CommonQuestion,
  KnowledgeClaim,
  KnowledgeIntent,
  PageInformationDensity,
  PageKnowledge,
} from "./types";

export interface DossierValidationOptions {
  readonly expectedProjectId: string;
  readonly expectedPageCount: number;
}

const intents = [
  "overview", "problem", "research", "solution", "architecture", "interaction",
  "technology", "form", "value", "comparison", "contribution",
] as const satisfies readonly KnowledgeIntent[];
const provenances = [
  "document_fact", "document_synthesis", "owner_statement", "candidate_contribution",
] as const satisfies readonly ClaimProvenance[];
const densities = ["low", "medium", "high"] as const satisfies readonly PageInformationDensity[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`Invalid ${label} keys`);
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Invalid ${label}`);
  return value;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`Invalid ${label}`);
  return value;
}

function requireStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}`);
  const result: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    result.push(requireNonEmptyString(value[index], `${label} ${index + 1}`));
  }
  return result;
}

function requireIntentArray(value: unknown, label: string): readonly KnowledgeIntent[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}`);
  const result: KnowledgeIntent[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (typeof item !== "string" || !intents.includes(item as KnowledgeIntent)) {
      throw new Error(`Invalid ${label}`);
    }
    result.push(item as KnowledgeIntent);
  }
  return result;
}

function normalizedKey(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]/gu, "");
}

function requireNormalizedUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    const key = normalizedKey(value);
    if (key.length === 0) throw new Error(`Invalid ${label}`);
    if (seen.has(key)) throw new Error(`Duplicate ${label}`);
    seen.add(key);
  }
}

function parseClaim(value: unknown, projectId: string, pageCount: number): KnowledgeClaim {
  const record = requireRecord(value, "claim");
  requireKeys(record, ["id", "text", "provenance", "evidence", "intents", "topics", "public"], "claim");
  const id = requireNonEmptyString(record.id, "claim ID");
  const text = requireNonEmptyString(record.text, `claim ${id} text`);
  if (typeof record.provenance !== "string" || !provenances.includes(record.provenance as ClaimProvenance)) {
    throw new Error(`Invalid provenance for claim ${id}`);
  }
  const provenance = record.provenance as ClaimProvenance;
  if (typeof record.public !== "boolean") throw new Error(`Invalid public flag for claim ${id}`);
  if (provenance === "candidate_contribution" && record.public) {
    throw new Error(`Claim ${id}: candidate contribution cannot be public`);
  }
  if (!Array.isArray(record.evidence)) throw new Error(`Invalid evidence for claim ${id}`);
  const evidence: ClaimEvidence[] = [];
  for (let index = 0; index < record.evidence.length; index += 1) {
    const item = record.evidence[index];
    const evidenceRecord = requireRecord(item, `evidence for claim ${id}`);
    requireKeys(evidenceRecord, ["sourceId", "page"], `evidence for claim ${id}`);
    const sourceId = requireNonEmptyString(evidenceRecord.sourceId, `evidence source for claim ${id}`);
    if (sourceId !== projectId) throw new Error(`Invalid evidence source for claim ${id}`);
    if (typeof evidenceRecord.page !== "number" || !Number.isInteger(evidenceRecord.page) || evidenceRecord.page < 1 || evidenceRecord.page > pageCount) {
      throw new Error(`Claim ${id}: invalid evidence page`);
    }
    evidence.push({ sourceId, page: evidenceRecord.page });
  }
  if ((provenance === "document_fact" || provenance === "document_synthesis") && evidence.length === 0) {
    throw new Error(`Claim ${id} requires evidence`);
  }
  return { id, text, provenance, evidence, intents: requireIntentArray(record.intents, `intents for claim ${id}`), topics: requireStringArray(record.topics, `topics for claim ${id}`), public: record.public };
}

function requireClaimReferences(value: unknown, label: string, claimIds: ReadonlySet<string>): readonly string[] {
  const references = requireStringArray(value, label);
  for (const id of references) if (!claimIds.has(id)) throw new Error(`Unknown claim reference ${id} in ${label}`);
  return references;
}

export function validateProjectDossier(candidate: unknown, options: DossierValidationOptions): AuthoredProjectDossier {
  const dossier = requireRecord(candidate, "project dossier");
  requireKeys(dossier, ["projectId", "title", "aliases", "oneLine", "pageCount", "claims", "sectionClaims", "pages", "commonQuestions"], "project dossier");
  const projectId = requireNonEmptyString(dossier.projectId, "project ID");
  if (projectId !== options.expectedProjectId) throw new Error(`Invalid project ID: ${projectId}`);
  if (typeof dossier.pageCount !== "number" || !Number.isInteger(dossier.pageCount) || dossier.pageCount < 1 || dossier.pageCount !== options.expectedPageCount) {
    throw new Error(`Invalid page count for project ${projectId}`);
  }
  const pageCount = dossier.pageCount;
  const title = requireNonEmptyString(dossier.title, "title");
  const aliases = requireStringArray(dossier.aliases, "aliases");
  requireNormalizedUnique(aliases, "aliases");
  const oneLine = requireNonEmptyString(dossier.oneLine, "one-line summary");
  if (!Array.isArray(dossier.claims)) throw new Error("Invalid claims");
  const claims: KnowledgeClaim[] = [];
  for (let index = 0; index < dossier.claims.length; index += 1) {
    claims.push(parseClaim(dossier.claims[index], projectId, pageCount));
  }
  const claimIds = new Set<string>();
  for (const claim of claims) {
    if (claimIds.has(claim.id)) throw new Error(`Duplicate claim ID: ${claim.id}`);
    claimIds.add(claim.id);
  }

  const sectionRecord = requireRecord(dossier.sectionClaims, "section claims");
  requireKeys(sectionRecord, intents, "section claims");
  const sectionClaims = Object.fromEntries(intents.map((intent) => [intent, requireClaimReferences(sectionRecord[intent], `section ${intent}`, claimIds)])) as AuthoredProjectDossier["sectionClaims"];

  if (!Array.isArray(dossier.pages)) throw new Error("Project must annotate every page");
  const pages: PageKnowledge[] = [];
  for (let index = 0; index < dossier.pages.length; index += 1) {
    const value = dossier.pages[index];
    const page = requireRecord(value, "page annotation");
    requireKeys(page, ["page", "role", "informationDensity", "visualSummary", "entities", "relationships", "claimIds"], "page annotation");
    if (typeof page.page !== "number" || !Number.isInteger(page.page)) {
      throw new Error(`Project ${projectId} must annotate every page in order`);
    }
    if (typeof page.informationDensity !== "string" || !densities.includes(page.informationDensity as PageInformationDensity)) throw new Error(`Invalid information density for page ${page.page}`);
    pages.push({ page: page.page, role: requireNonEmptyString(page.role, `role for page ${page.page}`), informationDensity: page.informationDensity as PageInformationDensity, visualSummary: requireNonEmptyString(page.visualSummary, `visual summary for page ${page.page}`), entities: requireStringArray(page.entities, `entities for page ${page.page}`), relationships: requireStringArray(page.relationships, `relationships for page ${page.page}`), claimIds: requireClaimReferences(page.claimIds, `page ${page.page}`, claimIds) });
  }
  if (pages.length !== pageCount || pages.some((page, index) => page.page !== index + 1)) {
    throw new Error(`Project ${projectId} must annotate every page in order`);
  }

  if (!Array.isArray(dossier.commonQuestions)) throw new Error("Invalid common questions");
  const commonQuestions: CommonQuestion[] = [];
  for (let index = 0; index < dossier.commonQuestions.length; index += 1) {
    const value = dossier.commonQuestions[index];
    const question = requireRecord(value, "common question");
    requireKeys(question, ["question", "locale", "intents", "preferredClaimIds"], "common question");
    const text = requireNonEmptyString(question.question, "common question");
    if (question.locale !== "zh" && question.locale !== "en") throw new Error(`Invalid locale for question ${text}`);
    const preferredClaimIds = requireClaimReferences(question.preferredClaimIds, `question ${text}`, claimIds);
    for (const claimId of preferredClaimIds) {
      if (!claims.find((claim) => claim.id === claimId)?.public) {
        throw new Error(`Common question ${text} cannot reference private claim ${claimId}`);
      }
    }
    commonQuestions.push({ question: text, locale: question.locale, intents: requireIntentArray(question.intents, `intents for question ${text}`), preferredClaimIds });
  }
  requireNormalizedUnique(commonQuestions.map(({ question }) => question), "common questions");

  const referenced = new Set<string>([...Object.values(sectionClaims).flat(), ...pages.flatMap((page) => page.claimIds), ...commonQuestions.flatMap((question) => question.preferredClaimIds)]);
  for (const claim of claims) if (claim.public && !referenced.has(claim.id)) throw new Error(`Public claim ${claim.id} is orphaned`);
  if (!sectionClaims.overview.some((id) => claims.find((claim) => claim.id === id)?.public)) throw new Error("Overview must reference a public claim");

  const result: AuthoredProjectDossier = { projectId, title, aliases, oneLine, pageCount, claims, sectionClaims, pages, commonQuestions };
  assertPrivacySafe(stableSerialize(result));
  return result;
}
