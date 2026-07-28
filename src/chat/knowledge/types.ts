import type {
  ClaimProvenance,
  KnowledgeIntent,
  PageInformationDensity,
} from "./authored/types.js";

export type KnowledgeSourceKind = "profile" | "resume" | "project-pdf";
export type KnowledgeKind = "source-excerpt" | "authored-claim";
export type PublishedClaimProvenance = Exclude<
  ClaimProvenance,
  "candidate_contribution"
>;

export interface ExtractedPage {
  readonly page: number;
  readonly text: string;
  readonly method: "structured" | "pdf-text" | "ocr";
}

export interface KnowledgeSource {
  readonly id: string;
  readonly kind: KnowledgeSourceKind;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly tags: readonly string[];
  readonly filePath?: string;
  readonly publicHref?: string;
  readonly projectId?: string;
  readonly pageCount?: number;
  readonly structuredText?: string;
  readonly visualPages?: readonly number[];
}

interface KnowledgeChunkBase {
  readonly id: string;
  readonly sourceId: string;
  readonly projectId?: string;
  readonly title: string;
  readonly text: string;
  readonly terms: readonly string[];
  readonly aliases: readonly string[];
  readonly tags: readonly string[];
  readonly citationLabel: string;
  readonly publicHref: string;
  readonly knowledgeKind: KnowledgeKind;
  readonly intents: readonly KnowledgeIntent[];
  readonly informationDensity: PageInformationDensity;
  readonly pageRole: string;
  readonly evidencePages: readonly number[];
  readonly questionAliases: readonly string[];
}

export interface SourceExcerptKnowledgeChunk extends KnowledgeChunkBase {
  readonly page: number;
  readonly knowledgeKind: "source-excerpt";
  readonly intents: readonly [];
  readonly provenance?: never;
  readonly evidencePages: readonly [number];
  readonly questionAliases: readonly [];
}

interface AuthoredClaimKnowledgeChunkBase {
  readonly id: string;
  readonly sourceId: string;
  readonly projectId: string;
  readonly title: string;
  readonly text: string;
  readonly terms: readonly string[];
  readonly aliases: readonly string[];
  readonly tags: readonly string[];
  readonly citationLabel: string;
  readonly publicHref: string;
  readonly knowledgeKind: "authored-claim";
  readonly intents: readonly KnowledgeIntent[];
  readonly informationDensity: "high";
  readonly pageRole: string;
  readonly provenance: PublishedClaimProvenance;
  readonly evidencePages: readonly number[];
  readonly questionAliases: readonly string[];
}

export interface DocumentAuthoredClaimKnowledgeChunk
  extends AuthoredClaimKnowledgeChunkBase {
  readonly page: number;
  readonly provenance: "document_fact" | "document_synthesis";
}

export interface OwnerAuthoredClaimKnowledgeChunk
  extends AuthoredClaimKnowledgeChunkBase {
  readonly page?: never;
  readonly provenance: "owner_statement";
  readonly pageRole: "owner-confirmed";
  readonly evidencePages: readonly [];
}

export type AuthoredClaimKnowledgeChunk =
  | DocumentAuthoredClaimKnowledgeChunk
  | OwnerAuthoredClaimKnowledgeChunk;

export type KnowledgeChunk =
  | SourceExcerptKnowledgeChunk
  | AuthoredClaimKnowledgeChunk;

export interface GeneratedKnowledgeIndex {
  readonly version: 2;
  readonly sourceDigests: Readonly<Record<string, string>>;
  readonly authoredDigest: string;
  readonly intentAliases: Readonly<
    Record<KnowledgeIntent, readonly string[]>
  >;
  readonly chunks: readonly KnowledgeChunk[];
}
