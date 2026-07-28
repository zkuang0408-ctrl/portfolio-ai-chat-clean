# Portfolio Authored Knowledge Corpus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reviewed, page-grounded text knowledge corpus for all six portfolio PDFs without changing the public chat retrieval behavior yet.

**Architecture:** Add typed, human-readable project dossiers beside the existing extracted PDF index. Validate claim provenance and page evidence, then deterministically generate authored claim chunks into knowledge-index version 2 while retaining raw page excerpts for audit and fallback. Personal contribution candidates remain non-public until Zhao Shikuang confirms them.

**Tech Stack:** TypeScript 5.9, JSON modules, Vitest, existing PDF/OCR pipeline, deterministic JSON generation

---

## File Map

**Create**

- `src/chat/knowledge/authored/types.ts` — dossier, page annotation, claim, provenance, and intent contracts.
- `src/chat/knowledge/authored/validate.ts` — strict runtime validation and cross-reference checks.
- `src/chat/knowledge/authored/index.ts` — imports and exposes the six reviewed dossiers.
- `src/chat/knowledge/authored/projects/*.json` — one human-reviewed dossier per project.
- `src/chat/knowledge/authored/glossary.json` — bilingual aliases and intent vocabulary.
- `src/chat/knowledge/authored/validate.test.ts` — schema, provenance, evidence, and privacy tests.
- `src/chat/knowledge/authored/build-authored-chunks.ts` — deterministic conversion from public claims to retrieval chunks.
- `src/chat/knowledge/authored/build-authored-chunks.test.ts` — authored-chunk behavior tests.
- `docs/knowledge/portfolio-contribution-review.md` — candidate personal contributions for owner review.

**Modify**

- `src/chat/knowledge/types.ts` — knowledge-index version 2 and authored metadata.
- `src/chat/knowledge/build-index.ts` — append reviewed authored chunks and validate version 2.
- `src/chat/knowledge/build-index.test.ts` — version-2 generation and validation coverage.
- `scripts/build-knowledge-index.ts` — load dossiers during generate and verify.
- `src/chat/knowledge/generated-index.json` — deterministic generated output.
- `src/chat/retrieval/local-hybrid.test.ts` — keep legacy retriever fixtures compatible with version 2.
- `src/chat/server/prompt.test.ts` — keep prompt fixtures compatible with required chunk metadata.
- `src/chat/server/chat-handler.test.ts` — keep handler fixtures compatible with required chunk metadata.

## Canonical Page Maps

These page roles are the authoring checklist. Every page must appear exactly once.

| Project | Page roles |
|---|---|
| INKSeat | 1 overview; 2 contents; 3 cabin trend; 4 in-flight advertising; 5 contradiction analysis; 6 market gap; 7 e-paper feasibility; 8 system architecture; 9 explainable recommendation; 10 content library and personas; 11 backend and UI; 12–14 demonstration; 15 form and viewing relationship; 16 structure and CMF; 17 whole-flight journey; 18 closing |
| EMOVUE | 1 overview; 2 research; 3 positioning and persona; 4 journey; 5 mood board; 6 sketches; 7 AI form exploration; 8 product and functions; 9 details; 10 exploded view; 11 companion app; 12 app functions; 13 preview and emotional visualization; 14 wearing and charging; 15 technical prototype; 16 human factors; 17 packaging; 18 presentation; 19 closing |
| Fruit & Evolution | 1 overview; 2 process; 3 evolution inspiration; 4–5 morphology study; 6–7 concept logic; 8 process recap; 9–13 algorithm workflow; 14 process recap; 15–18 parametric modeling; 19 process recap; 20–24 physical food making and display; 25 closing |
| Atempo | 1 overview; 2 contents; 3 divider; 4 research problem; 5 divider; 6 competitor map and opportunity; 7 intervention window; 8 product definition; 9 divider; 10 scenario; 11 interaction flow; 12 biofeedback rationale; 13 data translation; 14 divider; 15 technical architecture; 16 divider; 17 journey; 18 form; 19 references; 20 closing |
| UroSense | 1 overview; 2 divider; 3–5 hospital research; 6–8 problem analysis; 9–10 design principle; 11 divider; 12 structure; 13 divider; 14–16 measurement flow; 17–20 product views; 21 installation; 22 divider; 23 future directions; 24–25 closing/product views |
| First Fly | 1 overview; 2 manifesto; 3 narrative premise; 4–9 future-mobility research; 10–11 concept definition; 12 requirements; 13 users; 14 journey; 15 form iteration; 16–20 form, comfort, material, and lightweight design; 21 smart motion concept; 22 product view; 23 AR experience; 24–25 dimensions; 26–27 renderings; 28 closing |

### Task 1: Add authored knowledge contracts

**Files:**

- Create: `src/chat/knowledge/authored/types.ts`
- Test: `src/chat/knowledge/authored/validate.test.ts`

- [ ] **Step 1: Write the failing contract test**

```ts
// src/chat/knowledge/authored/validate.test.ts
import { describe, expectTypeOf, test } from "vitest";
import type {
  AuthoredProjectDossier,
  KnowledgeClaim,
  KnowledgeIntent,
} from "./types";

describe("authored knowledge contracts", () => {
  test("keeps contribution candidates distinguishable from public evidence", () => {
    expectTypeOf<KnowledgeClaim["provenance"]>().toEqualTypeOf<
      | "document_fact"
      | "document_synthesis"
      | "owner_statement"
      | "candidate_contribution"
    >();
    expectTypeOf<KnowledgeClaim["public"]>().toEqualTypeOf<boolean>();
  });

  test("uses a closed intent vocabulary", () => {
    expectTypeOf<KnowledgeIntent>().toEqualTypeOf<
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
      | "contribution"
    >();
  });

  test("requires a page annotation for every dossier page", () => {
    expectTypeOf<AuthoredProjectDossier["pages"][number]["page"]>()
      .toEqualTypeOf<number>();
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run:

```powershell
npx.cmd vitest run src/chat/knowledge/authored/validate.test.ts
```

Expected: FAIL because `./types` does not exist.

- [ ] **Step 3: Add the complete contracts**

```ts
// src/chat/knowledge/authored/types.ts
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
```

- [ ] **Step 4: Run the contract test**

Run:

```powershell
npx.cmd vitest run src/chat/knowledge/authored/validate.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/chat/knowledge/authored/types.ts src/chat/knowledge/authored/validate.test.ts
git commit -m "feat: define authored portfolio knowledge contracts"
```

### Task 2: Validate dossiers and claim provenance

**Files:**

- Create: `src/chat/knowledge/authored/validate.ts`
- Modify: `src/chat/knowledge/authored/validate.test.ts`

- [ ] **Step 1: Add failing validator tests**

Add tests that construct a minimal one-page dossier and assert:

```ts
expect(() => validateProjectDossier(validDossier, {
  expectedProjectId: "inkseat",
  expectedPageCount: 1,
})).not.toThrow();

expect(() => validateProjectDossier({
  ...validDossier,
  claims: [{
    ...validDossier.claims[0]!,
    provenance: "candidate_contribution",
    public: true,
  }],
}, validationOptions)).toThrow("candidate contribution cannot be public");

expect(() => validateProjectDossier({
  ...validDossier,
  claims: [{
    ...validDossier.claims[0]!,
    evidence: [{ sourceId: "inkseat", page: 2 }],
  }],
}, validationOptions)).toThrow("invalid evidence page");

expect(() => validateProjectDossier({
  ...validDossier,
  pages: [],
}, validationOptions)).toThrow("must annotate every page");
```

- [ ] **Step 2: Run the focused test**

Run:

```powershell
npx.cmd vitest run src/chat/knowledge/authored/validate.test.ts
```

Expected: FAIL because `validateProjectDossier` is missing.

- [ ] **Step 3: Implement strict cross-reference validation**

`validateProjectDossier()` must:

```ts
export interface DossierValidationOptions {
  readonly expectedProjectId: string;
  readonly expectedPageCount: number;
}

export function validateProjectDossier(
  candidate: unknown,
  options: DossierValidationOptions,
): AuthoredProjectDossier;
```

Implement these exact invariants:

- project ID and page count equal the manifest.
- page numbers are exactly `1..pageCount`.
- claim IDs, aliases, and common-question strings are non-empty and unique.
- every `claimIds`, `sectionClaims`, and `preferredClaimIds` reference exists.
- every evidence source equals the dossier project ID and every evidence page exists.
- `document_fact` and `document_synthesis` claims have evidence.
- `owner_statement` may omit page evidence.
- `candidate_contribution` always has `public: false`.
- every intent has a `sectionClaims` array.
- `overview` has at least one public claim.
- privacy validation runs over the stable serialized dossier.

- [ ] **Step 4: Run validation tests**

Run:

```powershell
npx.cmd vitest run src/chat/knowledge/authored/validate.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/chat/knowledge/authored/validate.ts src/chat/knowledge/authored/validate.test.ts
git commit -m "feat: validate authored portfolio dossiers"
```

### Task 3: Author and verify the INKSeat pilot dossier

**Files:**

- Create: `src/chat/knowledge/authored/projects/inkseat.json`
- Modify: `src/chat/knowledge/authored/validate.test.ts`

- [ ] **Step 1: Add a failing INKSeat dossier test**

Import the JSON and verify:

```ts
expect(() => validateProjectDossier(inkseatJson, {
  expectedProjectId: "inkseat",
  expectedPageCount: 18,
})).not.toThrow();

const inkseat = validateProjectDossier(inkseatJson, {
  expectedProjectId: "inkseat",
  expectedPageCount: 18,
});
expect(inkseat.pages).toHaveLength(18);
expect(inkseat.pages.find(({ page }) => page === 1)).toMatchObject({
  role: "overview",
  informationDensity: "high",
});
expect(inkseat.pages.find(({ page }) => page === 8)).toMatchObject({
  role: "system-architecture",
  informationDensity: "high",
});
expect(inkseat.pages.find(({ page }) => page === 14)).toMatchObject({
  role: "demonstration",
  informationDensity: "low",
});
expect(inkseat.sectionClaims.overview).toContain("inkseat.overview");
expect(inkseat.sectionClaims.architecture).toContain("inkseat.architecture");
```

- [ ] **Step 2: Run the test**

Expected: FAIL because `inkseat.json` is missing.

- [ ] **Step 3: Author the dossier from all 18 rendered pages**

Use the canonical page map above. The public claim set must include these IDs and meanings:

```text
inkseat.overview              p1  e-paper display system for narrow-body economy cabins
inkseat.problem               p3–6 loss of a dynamic, targetable, measurable seat-level touchpoint
inkseat.solution              p1,7 lightweight low-power low-disturbance information layer
inkseat.feasibility           p7 color e-paper medium choice and trade-off
inkseat.architecture          p8 passenger → smart-push backend → airline platform → display/purchase
inkseat.explainability        p9 explainable recommendation inputs and excluded sensitive features
inkseat.content-system        p10–11 content library, profiles, backend, and fixed flight stages
inkseat.form                  p15–16 viewing relationship, PED support, structure, and CMF
inkseat.journey               p17 whole-flight scenarios and conversion path
inkseat.core-contributor      owner statement confirmed in this conversation
```

Add candidate, non-public contribution claims derived from the current site role string: system analysis, information architecture, recommendation logic, terminal design, and interface expression. Do not make these public yet.

Tag `inkseat.architecture` with both `architecture` and `comparison` so cross-project system-thinking questions have explicit evidence.

- [ ] **Step 4: Verify the dossier**

Run:

```powershell
npx.cmd vitest run src/chat/knowledge/authored/validate.test.ts
```

Expected: PASS with 18 annotated pages and no public candidate contributions.

- [ ] **Step 5: Commit**

```powershell
git add src/chat/knowledge/authored/projects/inkseat.json src/chat/knowledge/authored/validate.test.ts
git commit -m "content: author INKSeat knowledge dossier"
```

### Task 4: Author EMOVUE and Fruit & Evolution

**Files:**

- Create: `src/chat/knowledge/authored/projects/emovue.json`
- Create: `src/chat/knowledge/authored/projects/evolution-fruit.json`
- Modify: `src/chat/knowledge/authored/validate.test.ts`

- [ ] **Step 1: Add failing page-count and anchor tests**

```ts
function validate(
  projectId: string,
  value: unknown,
  pageCount: number,
): AuthoredProjectDossier {
  return validateProjectDossier(value, {
    expectedProjectId: projectId,
    expectedPageCount: pageCount,
  });
}

function findClaim(
  value: unknown,
  claimId: string,
): KnowledgeClaim {
  const dossier = validateProjectDossier(value, {
    expectedProjectId: String((value as { projectId?: unknown }).projectId),
    expectedPageCount: Number((value as { pageCount?: unknown }).pageCount),
  });
  const claim = dossier.claims.find(({ id }) => id === claimId);
  if (!claim) throw new Error(`Missing test claim: ${claimId}`);
  return claim;
}

expect(validate("emovue", emovueJson, 19).pages).toHaveLength(19);
expect(validate("evolution-fruit", fruitJson, 25).pages).toHaveLength(25);
expect(findClaim(emovueJson, "emovue.product").evidence)
  .toContainEqual({ sourceId: "emovue", page: 8 });
expect(findClaim(emovueJson, "emovue.technical-prototype").evidence)
  .toContainEqual({ sourceId: "emovue", page: 15 });
expect(findClaim(fruitJson, "evolution-fruit.algorithm").evidence)
  .toContainEqual({ sourceId: "evolution-fruit", page: 10 });
expect(findClaim(fruitJson, "evolution-fruit.parametric-model").evidence)
  .toContainEqual({ sourceId: "evolution-fruit", page: 16 });
```

- [ ] **Step 2: Run the focused tests**

Expected: FAIL because both JSON files are missing.

- [ ] **Step 3: Author EMOVUE**

Required public claims:

```text
emovue.overview               p1,p8 emotion-sensing wearable camera
emovue.problem                p2–4 manual recording interrupts authentic moments
emovue.positioning            p3 wearable, functional, creator-oriented positioning
emovue.product                p8 heart-rate/EDA-triggered capture, AI organization, 3D/VR direction
emovue.app                    p11–13 archive, emotional trajectory, editing, replay, sharing
emovue.wearing                p14 modular neck-worn and Type-C charging interaction
emovue.technical-prototype    p15 Arduino, sensors, camera, threshold trigger
emovue.human-factors          p16 fit, comfort, adjustability, fashion and social attributes
emovue.packaging              p17 modular product set
emovue.core-contributor       confirmed shared owner statement
```

Candidate contributions remain non-public and use the current site role string.

- [ ] **Step 4: Author Fruit & Evolution**

Required public claims:

```text
evolution-fruit.overview          p1–2 generative food design based on fruit evolution
evolution-fruit.inspiration       p3–6 natural, artificial, and gene-editing selection logic
evolution-fruit.system            p6–13 fruit/environment input → knowledge → morphology/flavor output
evolution-fruit.algorithm         p9–13 Coze/Doubao workflow and climate knowledge
evolution-fruit.parametric-model  p15–18 morphology parameters and generational form path
evolution-fruit.physical-making   p20–24 molds, materials, jelly and taro prototypes
evolution-fruit.value             p2,p18 connects algorithmic evolution to edible physical outcomes
evolution-fruit.core-contributor  confirmed shared owner statement
```

Candidate contributions remain non-public and use the current site role string.

Tag `evolution-fruit.system` with both `architecture` and `comparison`.

- [ ] **Step 5: Run validation and commit**

```powershell
npx.cmd vitest run src/chat/knowledge/authored/validate.test.ts
git add src/chat/knowledge/authored/projects/emovue.json src/chat/knowledge/authored/projects/evolution-fruit.json src/chat/knowledge/authored/validate.test.ts
git commit -m "content: author EMOVUE and Fruit Evolution dossiers"
```

Expected: PASS.

### Task 5: Author Atempo, UroSense, and First Fly

**Files:**

- Create: `src/chat/knowledge/authored/projects/atempo.json`
- Create: `src/chat/knowledge/authored/projects/urosense.json`
- Create: `src/chat/knowledge/authored/projects/first-fly.json`
- Modify: `src/chat/knowledge/authored/validate.test.ts`

- [ ] **Step 1: Add failing anchor tests**

```ts
expect(validate("atempo", atempoJson, 20).pages).toHaveLength(20);
expect(validate("urosense", urosenseJson, 25).pages).toHaveLength(25);
expect(validate("first-fly", firstFlyJson, 28).pages).toHaveLength(28);
expect(findClaim(atempoJson, "atempo.data-translation").evidence)
  .toContainEqual({ sourceId: "atempo", page: 13 });
expect(findClaim(urosenseJson, "urosense.measurement-flow").evidence)
  .toContainEqual({ sourceId: "urosense", page: 14 });
expect(findClaim(firstFlyJson, "first-fly.concept").evidence)
  .toContainEqual({ sourceId: "first-fly", page: 10 });
```

- [ ] **Step 2: Run the focused tests**

Expected: FAIL because the three JSON files are missing.

- [ ] **Step 3: Author Atempo**

Required public claims:

```text
atempo.overview            p1,p8 desktop rhythm interaction system
atempo.problem             p4 task completion does not automatically start recovery
atempo.opportunity         p6–7 use desktop charging as a low-threshold transition window
atempo.scenario            p10 charging → breathing visualization → arc convergence → recovery
atempo.interaction         p11 four-stage interaction flow
atempo.biofeedback         p12 breathing and 0.1 Hz rationale
atempo.data-translation    p13 signal → target distance → phase gap → stable feedback
atempo.technology          p15 radar, filtering/state machine, phase model, ESP32-S3, light engine
atempo.form                p17–18 journey and desktop form
atempo.core-contributor    confirmed shared owner statement
```

Tag `atempo.data-translation` with both `architecture` and `comparison`.

- [ ] **Step 4: Author UroSense**

Required public claims:

```text
urosense.overview           p1,p9–10 privacy-preserving autonomous urine measurement attachment
urosense.research           p3–5 cardiology-ward field research and 24-hour urine importance
urosense.problem            p6–8 missed measurement, manual transfer burden, varied mobility
urosense.principles         p9 privacy, autonomy, minimal disruption
urosense.structure          p12 identity handle, funnel, flow meter, load plate, removable cleaning
urosense.measurement-flow   p14,p16 identify → urinate → measure → compute → upload
urosense.installation       p21 attachment to existing ward/toilet infrastructure
urosense.future             p23 broader excretion/biomarker/platform possibilities
urosense.core-contributor   confirmed shared owner statement
```

Tag `urosense.measurement-flow` with both `architecture` and `comparison`.

- [ ] **Step 5: Author First Fly**

Required public claims:

```text
first-fly.overview          p1,p10–11 2035 short-haul immersive flight experience
first-fly.premise           p3 emotional meaning of the sensation of flight
first-fly.research          p4–9 future mobility, cabin constraints, body scale, AR
first-fly.concept           p10–11 prone first-person embodied flight with AR scenery
first-fly.users             p12–13 retirees, young adults, and teenagers
first-fly.journey           p14 setup, safety, transition, takeoff effect, recommendation
first-fly.form              p15–20 space, comfort, privacy, lightweight materials
first-fly.motion            p21 seat motion feedback
first-fly.ar                p23 lightweight AR interaction and interpretation
first-fly.core-contributor  confirmed shared owner statement
```

- [ ] **Step 6: Run validation and commit**

```powershell
npx.cmd vitest run src/chat/knowledge/authored/validate.test.ts
git add src/chat/knowledge/authored/projects/atempo.json src/chat/knowledge/authored/projects/urosense.json src/chat/knowledge/authored/projects/first-fly.json src/chat/knowledge/authored/validate.test.ts
git commit -m "content: author Atempo UroSense and First Fly dossiers"
```

Expected: PASS.

### Task 6: Load the six dossiers and bilingual glossary

**Files:**

- Create: `src/chat/knowledge/authored/glossary.json`
- Create: `src/chat/knowledge/authored/index.ts`
- Modify: `src/chat/knowledge/authored/validate.test.ts`

- [ ] **Step 1: Add failing loader tests**

```ts
expect(authoredProjects.map(({ projectId }) => projectId)).toEqual([
  "inkseat",
  "emovue",
  "evolution-fruit",
  "atempo",
  "urosense",
  "first-fly",
]);
expect(authoredProjects.reduce((total, item) => total + item.pages.length, 0))
  .toBe(135);
expect(authoredGlossary.entries).toEqual(expect.arrayContaining([
  expect.objectContaining({ canonical: "INKSeat" }),
  expect.objectContaining({ canonical: "系统架构" }),
  expect.objectContaining({ canonical: "核心贡献" }),
]));
```

- [ ] **Step 2: Run the focused test**

Expected: FAIL because the loader and glossary are missing.

- [ ] **Step 3: Author the glossary**

Include bilingual aliases for all six project names and these intent concepts:

```text
overview: 是什么, 介绍, 项目概览, what is, introduce, overview
problem: 问题, 痛点, 设计机会, problem, pain point, opportunity
research: 调研, 洞察, 研究, research, insight
solution: 方案, 产品定义, solution, concept
architecture: 系统, 架构, 工作原理, architecture, system, how it works
interaction: 交互, 流程, 旅程, interaction, flow, journey
technology: 技术, 原型, 传感器, technology, prototype, sensor
form: 造型, 结构, 材料, form, structure, material
value: 价值, 意义, 商业模式, value, impact, business model
comparison: 对比, 哪个项目, 系统思考, compare, which project, system thinking
contribution: 负责, 贡献, 做了什么, role, contribution
```

- [ ] **Step 4: Implement the loader**

Import each JSON module, validate it against the matching `projects` manifest entry, validate the glossary, freeze the resulting arrays, and export:

```ts
export const authoredProjects: readonly AuthoredProjectDossier[];
export const authoredGlossary: AuthoredGlossary;
export function buildPageKnowledgeMap(
  dossiers: readonly AuthoredProjectDossier[],
): ReadonlyMap<string, PageKnowledge>;
export function buildIntentAliases(
  glossary: AuthoredGlossary,
): Readonly<Record<KnowledgeIntent, readonly string[]>>;
```

`buildPageKnowledgeMap()` uses the stable key `${projectId}:p${page}`. `buildIntentAliases()` groups each glossary entry's canonical phrase and aliases under every listed intent, removes normalized duplicates, and returns all eleven intent keys in contract order.

- [ ] **Step 5: Run tests and commit**

```powershell
npx.cmd vitest run src/chat/knowledge/authored/validate.test.ts
git add src/chat/knowledge/authored
git commit -m "feat: load reviewed portfolio dossiers"
```

Expected: PASS with 6 projects and 135 annotated pages.

### Task 7: Generate authored claim chunks

**Files:**

- Create: `src/chat/knowledge/authored/build-authored-chunks.ts`
- Create: `src/chat/knowledge/authored/build-authored-chunks.test.ts`
- Modify: `src/chat/knowledge/types.ts`

- [ ] **Step 1: Add failing authored-chunk tests**

```ts
const chunks = buildAuthoredChunks([inkseatDossier]);
expect(chunks.find(({ id }) => id === "inkseat:claim:inkseat.overview"))
  .toMatchObject({
    sourceId: "inkseat",
    projectId: "inkseat",
    page: 1,
    knowledgeKind: "authored-claim",
    provenance: "document_fact",
    intents: ["overview"],
    informationDensity: "high",
  });
expect(chunks.some(({ provenance }) => provenance === "candidate_contribution"))
  .toBe(false);
expect(chunks.find(({ id }) => id === "inkseat:claim:inkseat.architecture")
  ?.evidencePages).toContain(8);
```

- [ ] **Step 2: Run the test**

Expected: FAIL because authored chunks and version-2 fields do not exist.

- [ ] **Step 3: Extend generated chunk contracts**

Add:

```ts
export type KnowledgeKind = "source-excerpt" | "authored-claim";

export interface KnowledgeChunk {
  // existing fields stay unchanged
  readonly knowledgeKind: KnowledgeKind;
  readonly intents: readonly KnowledgeIntent[];
  readonly informationDensity: PageInformationDensity;
  readonly pageRole: string;
  readonly provenance?: Exclude<ClaimProvenance, "candidate_contribution">;
  readonly evidencePages: readonly number[];
  readonly questionAliases: readonly string[];
}

export interface GeneratedKnowledgeIndex {
  readonly version: 2;
  readonly sourceDigests: Readonly<Record<string, string>>;
  readonly authoredDigest: string;
  readonly intentAliases: Readonly<Record<KnowledgeIntent, readonly string[]>>;
  readonly chunks: readonly KnowledgeChunk[];
}
```

- [ ] **Step 4: Implement authored chunk generation**

For every public claim:

- for document claims, use the first evidence page as the clickable primary `page`.
- for an owner statement without page evidence, omit `page`, use an empty `evidencePages` array, and label the citation `${title} · Owner-confirmed`.
- keep every evidence page in sorted unique `evidencePages`.
- inherit project title, aliases, tags, PDF href, and page citation label.
- use the claim text as clean retrieval text.
- index claim topics, intents, aliases, title, and text in `terms`.
- attach every common-question string that lists the claim as preferred in `questionAliases`, and index those strings in `terms`.
- exclude all non-public claims.
- use stable ID `${projectId}:claim:${claim.id}`.
- use `informationDensity: "high"` for authored claims.
- use the first evidence page's authored page role as `pageRole`.

- [ ] **Step 5: Run tests and commit**

```powershell
npx.cmd vitest run src/chat/knowledge/authored/build-authored-chunks.test.ts
git add src/chat/knowledge/types.ts src/chat/knowledge/authored/build-authored-chunks.ts src/chat/knowledge/authored/build-authored-chunks.test.ts
git commit -m "feat: generate grounded authored claim chunks"
```

Expected: PASS.

### Task 8: Publish deterministic knowledge-index version 2

**Files:**

- Modify: `src/chat/knowledge/build-index.ts`
- Modify: `src/chat/knowledge/build-index.test.ts`
- Modify: `scripts/build-knowledge-index.ts`
- Modify: `src/chat/knowledge/generated-index.json`

- [ ] **Step 1: Add failing version-2 generation tests**

Assert that raw chunks receive:

```ts
{
  knowledgeKind: "source-excerpt",
  intents: [],
  informationDensity: authoredPage.informationDensity,
  pageRole: authoredPage.role,
  evidencePages: [pageNumber],
  questionAliases: []
}
```

Assert that `buildKnowledgeIndex()` accepts authored chunks and `authoredDigest`, publishes version 2, rejects duplicate raw/authored IDs, and rejects candidate contributions.

- [ ] **Step 2: Run focused tests**

```powershell
npx.cmd vitest run src/chat/knowledge/build-index.test.ts
```

Expected: FAIL against version 1.

- [ ] **Step 3: Implement version-2 generation and validation**

Change the build signature to:

```ts
export function buildKnowledgeIndex(
  sources: readonly KnowledgeSource[],
  pagesBySource: ReadonlyMap<string, readonly ExtractedPage[]>,
  sourceDigests: Readonly<Record<string, string>>,
  authoredChunks: readonly KnowledgeChunk[],
  pageKnowledge: ReadonlyMap<string, PageKnowledge>,
  intentAliases: Readonly<Record<KnowledgeIntent, readonly string[]>>,
  authoredDigest: string,
): GeneratedKnowledgeIndex;
```

Update `validateGeneratedIndex()` to require the exact version-2 keys and validate every new field. Keep privacy checks and deterministic serialization.

- [ ] **Step 4: Wire the CLI**

In generate and verify modes:

```ts
const authoredChunks = buildAuthoredChunks(authoredProjects);
const pageKnowledge = buildPageKnowledgeMap(authoredProjects);
const intentAliases = buildIntentAliases(authoredGlossary);
const authoredDigest = sha256(stableSerialize({
  projects: authoredProjects,
  glossary: authoredGlossary,
}));
```

Pass the authored chunks, page-knowledge map, intent aliases, and digest into generation/verification. Profile and resume excerpts use `informationDensity: "medium"` and `pageRole: "profile"` or `"resume"`. Version-2 validation requires an alias array for every intent. Verification must fail if an authored JSON file changes without regenerating the index.

- [ ] **Step 5: Generate and verify**

```powershell
npm.cmd run knowledge:generate
npm.cmd run knowledge:verify
```

Expected: generation reports eight sources plus authored claims; verification reports version 2 and exits 0.

- [ ] **Step 6: Update existing test fixtures for the version-2 contract**

Add this metadata to synthetic raw chunks in `local-hybrid.test.ts`, `prompt.test.ts`, and `chat-handler.test.ts`:

```ts
knowledgeKind: "source-excerpt",
intents: [],
informationDensity: "medium",
pageRole: "test",
evidencePages: [page],
questionAliases: [],
```

Change synthetic indexes to version 2 and supply:

```ts
authoredDigest: "a".repeat(64),
intentAliases: {
  overview: [],
  problem: [],
  research: [],
  solution: [],
  architecture: [],
  interaction: [],
  technology: [],
  form: [],
  value: [],
  comparison: [],
  contribution: [],
},
```

- [ ] **Step 7: Commit**

```powershell
git add src/chat/knowledge/build-index.ts src/chat/knowledge/build-index.test.ts scripts/build-knowledge-index.ts src/chat/knowledge/generated-index.json src/chat/retrieval/local-hybrid.test.ts src/chat/server/prompt.test.ts src/chat/server/chat-handler.test.ts
git commit -m "feat: publish authored portfolio knowledge index"
```

### Task 9: Produce the owner contribution review

**Files:**

- Create: `docs/knowledge/portfolio-contribution-review.md`
- Modify: `src/chat/knowledge/authored/validate.test.ts`

- [ ] **Step 1: Generate a review table**

The document must list, for each project:

- the confirmed shared statement: core contributor who completed a substantial share of the work.
- every candidate contribution from the dossier.
- supporting pages that demonstrate the work area.
- one of `待确认 / 已确认 / 修改后确认 / 不公开`.

The initial state for detailed contributions is `待确认`; the shared core-contributor statement is `已确认`.

- [ ] **Step 2: Add a test that detailed contribution candidates remain private**

```ts
for (const dossier of authoredProjects) {
  expect(
    dossier.claims
      .filter(({ provenance }) => provenance === "candidate_contribution")
      .every(({ public: isPublic }) => isPublic === false),
  ).toBe(true);
}
```

- [ ] **Step 3: Run validation and commit**

```powershell
npx.cmd vitest run src/chat/knowledge/authored/validate.test.ts
git add docs/knowledge/portfolio-contribution-review.md src/chat/knowledge/authored/validate.test.ts
git commit -m "docs: prepare portfolio contribution review"
```

Expected: PASS.

### Task 10: Verify the complete authored corpus

**Files:**

- No new files.

- [ ] **Step 1: Run authored and index tests**

```powershell
npx.cmd vitest run src/chat/knowledge
npm.cmd run knowledge:verify
```

Expected: all tests PASS; 6 dossiers and 135 pages validate.

- [ ] **Step 2: Run the full test suite and build**

```powershell
npm.cmd test
npm.cmd run build
```

Expected: all tests PASS and Vite production build exits 0.

- [ ] **Step 3: Inspect repository state**

```powershell
git status --short
git log --oneline -10
```

Expected: no uncommitted generated-index drift; task commits are visible.

- [ ] **Step 4: Review checkpoint**

Open `docs/knowledge/portfolio-contribution-review.md` with Zhao Shikuang. Apply only the contribution confirmations he explicitly provides, regenerate the index, rerun Task 10, and commit with:

```powershell
git commit -m "content: confirm portfolio contribution claims"
```

Do not block retrieval integration on unconfirmed detailed contributions; they remain private.
