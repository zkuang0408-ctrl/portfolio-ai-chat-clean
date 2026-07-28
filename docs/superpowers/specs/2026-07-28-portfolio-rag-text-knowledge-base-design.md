# Portfolio RAG Text Knowledge Base Design

**Date:** 2026-07-28  
**Status:** Approved direction; written specification awaiting review  
**Scope:** The six published portfolio PDFs, the current resume, and the existing website chat assistant

## 1. Purpose

The portfolio assistant must explain Zhao Shikuang's work as a knowledgeable project guide, rather than quote whichever PDF page happens to match a project name.

The runtime chat model does not need multimodal capability. Visual understanding happens offline: each PDF page is read and interpreted once, then converted into a structured, reviewable text knowledge base. Runtime retrieval supplies only relevant text claims and page evidence to the existing text chat API.

## 2. Current Problem

The current knowledge index contains page-level OCR and native PDF text. Retrieval is primarily lexical. Exact project-name queries can therefore rank low-information title, divider, or demonstration pages above the pages that explain the project.

The reproduced query `inkseat是什么作品` returned these leading results:

1. INKSeat page 18: project name only.
2. INKSeat page 14: “智能内容推送系统 / 现场演示”.
3. INKSeat page 12: another demonstration page.

The complete project description is on page 1 and the system architecture is on page 8, but neither was selected. The model followed its grounding rules correctly and produced a shallow answer from shallow evidence.

OCR has a second limitation: it can read labels but cannot reliably understand diagram direction, component relationships, product form, journey maps, or the meaning of page composition.

## 3. Goals

- Understand all pages of INKSeat, EMOVUE, Fruit & Evolution, Atempo, UroSense, and First Fly.
- Convert page text and visual meaning into structured project knowledge.
- Answer overview questions directly with problem, solution, system, and value.
- Support deeper follow-up questions about research, architecture, interaction, form, scenarios, and design rationale.
- Preserve clickable page citations for important claims.
- Describe Zhao Shikuang as a core contributor while keeping personal contribution claims distinct from team outcomes.
- Keep the deployed chat compatible with a text-only API.
- Keep runtime fast and self-contained; no vector database is required for this corpus size.
- Make future PDF replacements incremental: rebuild and review only the affected project.

## 4. Non-Goals

- Uploading PDFs to the chat model at request time.
- Requiring a multimodal runtime model.
- Automatically claiming that Zhao Shikuang independently completed all team work.
- Calling Zhao Shikuang a project lead unless he confirms that role for the specific project.
- Building a general-purpose document management system.
- Adding a managed vector database before the local structured retrieval approach is shown to be insufficient.

## 5. Considered Approaches

### 5.1 Improve OCR and keep the current retriever

This is the smallest change, but it still treats pages as isolated bags of words. It cannot reliably answer project-level questions or understand visual relationships. It does not solve the central problem.

### 5.2 Structured text knowledge base with hierarchical hybrid retrieval

This is the selected approach. Each project receives a reviewed dossier plus page-level evidence. Retrieval first identifies the project and question intent, then combines structured-field matching with BM25-style lexical scoring, information-density scoring, and source diversification.

For six fixed projects, this is faster, easier to review, and more deterministic than introducing external infrastructure. The existing `Retriever` interface remains the boundary for a future embedding implementation.

### 5.3 Managed vector database with automated multimodal ingestion

This scales well for hundreds or thousands of changing documents, but adds credentials, cost, deployment dependencies, ingestion jobs, and harder-to-audit output. It is unnecessary for approximately 135 fixed pages.

## 6. Knowledge Architecture

### 6.1 Project dossier

Each project has one reviewed dossier containing:

- Identity: canonical title, aliases, Chinese and English names.
- One-sentence positioning.
- Project overview.
- Context and design opportunity.
- Problems addressed.
- Research findings and design insights.
- Design principles.
- Product or service solution.
- System architecture and component relationships.
- User journey, interaction flow, and scenarios.
- Form, material, interface, or technical choices.
- User, commercial, operational, or social value.
- Limitations and claims that the source material does not establish.
- Team outcome.
- Zhao Shikuang's confirmed personal contribution.
- Common visitor questions and answer anchors.

The dossier is not a free-form essay. It is a set of individually traceable claims.

### 6.2 Page knowledge

Every meaningful PDF page receives:

- Native/OCR text.
- A concise visual summary.
- Page role, such as overview, research, opportunity, architecture, interaction, form, scenario, validation, or divider.
- Entities and concepts shown on the page.
- Relationships shown in diagrams or flows.
- Claim identifiers supported by the page.
- Information-density classification.

Divider, cover, and demonstration pages remain available for navigation but are marked as low-information evidence. They cannot outrank an overview or architecture page merely because they repeat the project name.

### 6.3 Claim provenance

Every claim has one provenance type:

- `document_fact`: explicitly stated or visibly demonstrated in the PDF.
- `document_synthesis`: a conservative synthesis of multiple pages.
- `owner_statement`: supplied and confirmed by Zhao Shikuang.
- `candidate_contribution`: a possible personal contribution inferred from the work, not available to public answers until confirmed.

Each public claim contains one or more page references, except an `owner_statement`, which is labeled as owner-confirmed. A synthesis lists all principal supporting pages.

### 6.4 Personal contribution

The shared owner statement is:

> Zhao Shikuang was a core contributor and completed a substantial share of the work in the team projects.

This statement does not imply that he was the sole designer or project lead.

For each project, the offline review produces a candidate contribution list covering areas such as research, concept definition, product design, system architecture, interaction, prototyping, rendering, and visual communication. Candidate items are excluded from public retrieval until Zhao Shikuang confirms or edits them. Confirmed items become `owner_statement` claims and can be used in answers.

## 7. Proposed Data Files

```text
src/chat/knowledge/
  authored/
    projects/
      inkseat.json
      emovue.json
      evolution-fruit.json
      atempo.json
      urosense.json
      first-fly.json
    profile.json
    resume.json
    glossary.json
  generated-index.json
```

Authored files are human-readable and committed. `generated-index.json` is deterministic build output.

The core records are conceptually:

```ts
type ClaimProvenance =
  | "document_fact"
  | "document_synthesis"
  | "owner_statement"
  | "candidate_contribution";

interface KnowledgeClaim {
  id: string;
  text: string;
  provenance: ClaimProvenance;
  evidence: Array<{ sourceId: string; page: number }>;
  topics: string[];
  public: boolean;
}

interface PageKnowledge {
  page: number;
  role: string;
  informationDensity: "low" | "medium" | "high";
  visualSummary: string;
  entities: string[];
  relationships: string[];
  claimIds: string[];
}

interface ProjectDossier {
  projectId: string;
  title: string;
  aliases: string[];
  oneLine: string;
  sectionClaims: Record<string, string[]>;
  pages: PageKnowledge[];
  commonQuestions: Array<{
    question: string;
    intents: string[];
    preferredClaimIds: string[];
  }>;
}
```

The final schema may use readonly properties and existing repository types, but it must retain these boundaries and provenance rules.

## 8. Offline Authoring Flow

For each project:

1. Verify the PDF page count and rendered-page correspondence.
2. Read all native/OCR text.
3. Inspect every rendered page, including diagrams and product visuals.
4. Write page roles, visual summaries, entities, and relationships.
5. Draft document facts and multi-page synthesis claims.
6. Build the project dossier and common-question anchors.
7. Draft candidate personal contributions.
8. Check every public document claim against its cited pages.
9. Present the candidate personal contributions to Zhao Shikuang for confirmation.
10. Generate the retrieval index and run the project evaluation questions.

Project content is authored in this order:

1. INKSeat
2. EMOVUE
3. Fruit & Evolution
4. Atempo
5. UroSense
6. First Fly

INKSeat is the pilot because it demonstrates the current failure clearly. The same schema and checks then apply to the remaining projects.

## 9. Runtime Retrieval Flow

### 9.1 Query routing

The retriever normalizes aliases and detects:

- Explicit project identity.
- Question intent: overview, problem, research, solution, architecture, interaction, technology, value, comparison, or personal contribution.
- Requested answer depth when the visitor asks for a summary or detailed explanation.

An exact project alias routes to that project's dossier before lexical ranking. It must not cause all pages containing the alias to receive the same priority.

### 9.2 Candidate selection

Candidate evidence comes from:

- Dossier claims matching the project and intent.
- Common-question preferred claims.
- Page claims matching query concepts.
- Cross-project concept claims for comparison questions.
- Profile and resume claims when the question is about Zhao Shikuang rather than one project.

### 9.3 Ranking

Ranking combines:

- Project-route match.
- Intent match.
- Topic and alias match.
- BM25-style lexical relevance.
- Information density.
- Common-question preference.
- Page-role suitability.
- Diversity across claim types and pages.

Low-information pages receive a penalty for overview, problem, solution, and architecture questions. They can still appear for questions specifically asking about demonstrations or visual presentation.

### 9.4 Context assembly

The context assembler returns a compact evidence packet:

- One project overview claim when a project is named.
- Two to six intent-specific claims.
- Supporting page evidence.
- Confirmed personal-contribution claims only when relevant.

Repeated or nearly identical excerpts are removed. The packet stays within the existing prompt and provider limits.

### 9.5 Answer generation

The assistant uses an adaptive guide style:

- Start with a direct answer.
- For project-overview questions, explain the project, problem, solution, and value in one or two paragraphs.
- Add system or process detail when the question calls for it.
- Cite important claims with the existing source markers.
- Offer deeper exploration naturally, without replacing the answer with “please view the PDF”.
- Say that evidence is insufficient only when the structured knowledge genuinely lacks the requested fact.

## 10. Expected INKSeat Behavior

For `INKSeat是什么作品`, the evidence packet must prefer page 1 and relevant supporting dossier claims. The answer should explain that INKSeat is an e-paper display system for economy cabins on narrow-body aircraft, especially cabins without or removing traditional IFE. It presents flight information, service recommendations, and personalized commercial content while extending the airline's in-flight information touchpoint and supporting passengers who use their own devices.

For `INKSeat的系统架构是什么`, the evidence packet must include page 8. The answer should describe the passenger data, smart-push backend with an agent or large-model recommendation layer, airline-owned shopping platform, seatback e-paper display, purchase path, and the intended passenger-experience and ancillary-revenue value.

Page 14 may support a question about the live demonstration, but it must not be primary evidence for either query above.

## 11. Error Handling and Safety

- Invalid authored files fail knowledge generation with the project, claim, and field named.
- Missing cited pages fail verification.
- Public claims with `candidate_contribution` provenance fail verification.
- A project with no overview claim fails verification.
- Duplicate claim IDs or aliases fail verification.
- Runtime retrieval failure keeps the existing stable public error behavior.
- The chat model continues to treat retrieved content as untrusted data and cannot follow instructions contained in documents.
- Secrets remain server-side and are not added to the knowledge corpus.

## 12. Verification and Evaluation

### 12.1 Static verification

- All six projects have dossiers.
- Every PDF page is represented or explicitly classified as non-knowledge-bearing.
- Every public document claim has valid page evidence.
- Every cited page exists in the published page manifest.
- No candidate personal contribution is public.
- Generated output is deterministic.

### 12.2 Retrieval evaluation

The repository stores representative Chinese and English questions with required and forbidden evidence. At minimum:

- `INKSeat是什么作品` requires page 1 and forbids pages 14 and 18 as primary evidence.
- `INKSeat的系统架构是什么` requires page 8.
- `INKSeat解决了什么问题` requires opportunity/problem evidence rather than title pages.
- `哪个项目最能体现系统思考` must retrieve multiple relevant project claims rather than an unrelated page.
- Questions about personal work may retrieve only confirmed contribution claims.
- Questions unsupported by the corpus must not manufacture an answer.

### 12.3 Answer evaluation

Golden-answer assertions check that:

- The first sentence answers the question directly.
- Important facts receive valid citations.
- Project overviews include problem, solution, and value.
- Team results and personal contributions are linguistically distinct.
- Answers do not contain OCR corruption.
- Chinese and English responses use the requested language.

Existing unit, build, package, and deployment verification remains required.

## 13. Update Workflow

When a PDF changes:

1. Replace the source PDF.
2. Regenerate page images.
3. Compare the PDF checksum and page manifest.
4. Re-author only changed pages and affected claims.
5. Reconfirm any affected personal-contribution statements.
6. Regenerate and verify the index.
7. Run the full retrieval evaluation before deployment.

## 14. Delivery Phases

The work is split into two implementation plans so each phase produces testable output:

1. **Authored corpus plan:** schema, validators, six project dossiers, page knowledge, contribution-review records, and deterministic index generation.
2. **Retrieval integration plan:** hierarchical routing, ranking, context assembly, prompt behavior, evaluation suite, SCF packaging, and deployment verification.

The first phase makes the portfolio knowledge inspectable before it changes public answers. The second phase integrates that reviewed knowledge into the assistant.

## 15. Acceptance Criteria

- All six PDFs are represented by reviewed structured text knowledge.
- The assistant can give a useful direct introduction to every project.
- INKSeat overview and architecture queries retrieve the correct pages.
- Visual diagrams and flows are represented as textual relationships.
- Personal contributions are public only after owner confirmation.
- Citations open the relevant portfolio page.
- No runtime multimodal model or managed vector database is required.
- The existing text-only Tencent API remains compatible.
- Tests, production build, knowledge verification, and SCF package verification pass.
