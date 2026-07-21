export type KnowledgeSourceKind = "profile" | "resume" | "project-pdf";

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
  readonly visualPages?: readonly ExtractedPage[];
}

export interface KnowledgeChunk {
  readonly id: string;
  readonly sourceId: string;
  readonly projectId?: string;
  readonly page?: number;
  readonly title: string;
  readonly text: string;
  readonly terms: readonly string[];
  readonly aliases: readonly string[];
  readonly tags: readonly string[];
  readonly citationLabel: string;
  readonly publicHref?: string;
}

export interface GeneratedKnowledgeIndex {
  readonly version: 1;
  readonly sourceDigests: Readonly<Record<string, string>>;
  readonly chunks: readonly KnowledgeChunk[];
}
