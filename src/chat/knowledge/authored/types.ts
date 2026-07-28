export type KnowledgeIntent =
  | "overview"
  | "problem"
  | "research"
  | "solution"
  | "architecture"
  | "interaction"
  | "technology"
  | "form"
  | "value"
  | "comparison"
  | "contribution";

export type ClaimProvenance =
  | "document_fact"
  | "document_synthesis"
  | "owner_statement"
  | "candidate_contribution";

export type PageInformationDensity = "low" | "medium" | "high";

export interface ClaimEvidence {
  readonly sourceId: string;
  readonly page: number;
}

export interface KnowledgeClaim {
  readonly id: string;
  readonly text: string;
  readonly provenance: ClaimProvenance;
  readonly evidence: readonly ClaimEvidence[];
  readonly intents: readonly KnowledgeIntent[];
  readonly topics: readonly string[];
  readonly public: boolean;
}

export interface PageKnowledge {
  readonly page: number;
  readonly role: string;
  readonly informationDensity: PageInformationDensity;
  readonly visualSummary: string;
  readonly entities: readonly string[];
  readonly relationships: readonly string[];
  readonly claimIds: readonly string[];
}

export interface CommonQuestion {
  readonly question: string;
  readonly locale: "zh" | "en";
  readonly intents: readonly KnowledgeIntent[];
  readonly preferredClaimIds: readonly string[];
}

export interface AuthoredProjectDossier {
  readonly projectId: string;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly oneLine: string;
  readonly pageCount: number;
  readonly claims: readonly KnowledgeClaim[];
  readonly sectionClaims: Readonly<Record<KnowledgeIntent, readonly string[]>>;
  readonly pages: readonly PageKnowledge[];
  readonly commonQuestions: readonly CommonQuestion[];
}

export interface AuthoredGlossaryEntry {
  readonly canonical: string;
  readonly aliases: readonly string[];
  readonly intents: readonly KnowledgeIntent[];
}

export interface AuthoredGlossary {
  readonly version: 1;
  readonly entries: readonly AuthoredGlossaryEntry[];
}
