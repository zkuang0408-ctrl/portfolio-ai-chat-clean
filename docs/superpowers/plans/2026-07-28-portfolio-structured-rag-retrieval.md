# Portfolio Structured RAG Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace shallow page-name matching with deterministic project routing, intent-aware retrieval, evidence diversification, and adaptive project-guide answers over the reviewed text corpus.

**Architecture:** A query router identifies explicit projects and visitor intent from the authored aliases and glossary. A structured hybrid retriever scores authored claims ahead of raw excerpts, applies information-density and page-role policies, and returns a diverse evidence packet through the existing `Retriever` interface. The prompt remains strictly grounded and the current Tencent text model, SSE protocol, rate limits, citations, and frontend remain compatible.

**Tech Stack:** TypeScript 5.9, Vitest, existing BM25 term builder, existing chat handler and Tencent provider, SCF packaging

---

## Prerequisite

Complete `docs/superpowers/plans/2026-07-28-portfolio-authored-knowledge-corpus.md`. The committed `generated-index.json` must use version 2 and contain reviewed authored claims.

## File Map

**Create**

- `src/chat/retrieval/query-routing.ts` — deterministic project and intent detection.
- `src/chat/retrieval/query-routing.test.ts` — Chinese/English routing tests.
- `src/chat/retrieval/structured-hybrid.ts` — routed, intent-aware retrieval.
- `src/chat/retrieval/structured-hybrid.test.ts` — ranking, density, diversity, and safety tests.
- `src/chat/retrieval/evaluation-cases.ts` — committed retrieval acceptance cases.
- `src/chat/retrieval/evaluation.test.ts` — runs every acceptance case against the real generated index.

**Modify**

- `src/chat/server/runtime.ts` — create the structured retriever.
- `src/chat/server/runtime.test.ts` — assert the version-2 index and factory boundary.
- `src/chat/server/prompt.ts` — adaptive project-guide instructions and structured evidence metadata.
- `src/chat/server/prompt.test.ts` — direct-answer, provenance, and evidence tests.
- `src/chat/server/chat-handler.test.ts` — end-to-end SSE answer and citation behavior.
- `scripts/build-scf-package.ts` and its tests only if bundle-size verification needs a version-2 threshold update.
- `docs/deployment/tencent-scf-chat.md` — package replacement and smoke-test instructions.

### Task 1: Route project aliases and question intent

**Files:**

- Create: `src/chat/retrieval/query-routing.ts`
- Create: `src/chat/retrieval/query-routing.test.ts`

- [ ] **Step 1: Write failing routing tests**

```ts
import { describe, expect, test } from "vitest";
import generatedIndexJson from "../knowledge/generated-index.json";
import type { GeneratedKnowledgeIndex } from "../knowledge/types";
import { createQueryRouter } from "./query-routing";

const router = createQueryRouter(
  generatedIndexJson as GeneratedKnowledgeIndex,
);

describe("portfolio query routing", () => {
  test.each([
    ["inkseat是什么作品", ["inkseat"], ["overview"]],
    ["INKSeat 的系统架构是什么", ["inkseat"], ["architecture"]],
    ["EMOVUE 如何感知情绪并拍摄", ["emovue"], ["technology", "interaction"]],
    ["UroSense解决了什么问题", ["urosense"], ["problem"]],
    ["What is First Fly?", ["first-fly"], ["overview"]],
    ["What did Zhao contribute to Atempo?", ["atempo"], ["contribution"]],
  ])("routes %s", (query, projectIds, intents) => {
    expect(router.route(query)).toMatchObject({ projectIds, intents });
  });

  test("keeps a cross-project systems question unrouted", () => {
    expect(router.route("哪个项目最能体现系统思考？")).toMatchObject({
      projectIds: [],
      intents: ["comparison"],
    });
  });
});
```

- [ ] **Step 2: Run the focused test**

```powershell
npx.cmd vitest run src/chat/retrieval/query-routing.test.ts
```

Expected: FAIL because the router does not exist.

- [ ] **Step 3: Implement the router**

Expose:

```ts
export interface QueryRoute {
  readonly normalizedQuery: string;
  readonly queryTerms: readonly string[];
  readonly projectIds: readonly string[];
  readonly intents: readonly KnowledgeIntent[];
}

export interface QueryRouter {
  route(query: string): QueryRoute;
}

export function createQueryRouter(
  index: GeneratedKnowledgeIndex,
): QueryRouter;
```

Implementation rules:

- derive the project alias map from project chunks, not a second hard-coded list.
- normalize with NFKC, lowercase, and punctuation removal.
- match complete aliases before individual terms.
- derive intent phrases from `index.intentAliases`; use `questionAliases` only for exact common-question preference.
- return stable manifest order.
- do not infer a project from generic terms such as “系统” or “设计”.
- return `overview` for explicit project-name questions containing “是什么 / 介绍 / what is / introduce”.
- return no intent for an unrelated query.

- [ ] **Step 4: Run routing tests**

```powershell
npx.cmd vitest run src/chat/retrieval/query-routing.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/chat/retrieval/query-routing.ts src/chat/retrieval/query-routing.test.ts
git commit -m "feat: route portfolio projects and question intents"
```

### Task 2: Implement structured hybrid scoring

**Files:**

- Create: `src/chat/retrieval/structured-hybrid.ts`
- Create: `src/chat/retrieval/structured-hybrid.test.ts`

- [ ] **Step 1: Write failing overview and architecture tests**

```ts
import generatedIndexJson from "../knowledge/generated-index.json";
import type { GeneratedKnowledgeIndex } from "../knowledge/types";

const realIndex = generatedIndexJson as GeneratedKnowledgeIndex;
const retriever = createStructuredHybridRetriever(realIndex);

const overview = await retriever.search("inkseat是什么作品", {
  locale: "zh",
  limit: 8,
});
expect(overview[0]?.chunk.id).toBe("inkseat:claim:inkseat.overview");
expect(overview.slice(0, 3).map(({ chunk }) => chunk.id)).not.toContain(
  "inkseat:p14:c0",
);
expect(overview.slice(0, 3).map(({ chunk }) => chunk.id)).not.toContain(
  "inkseat:p18:c0",
);

const architecture = await retriever.search("INKSeat的系统架构是什么", {
  locale: "zh",
  limit: 8,
});
expect(architecture[0]?.chunk.id).toBe(
  "inkseat:claim:inkseat.architecture",
);
expect(architecture[0]?.chunk.evidencePages).toContain(8);
```

- [ ] **Step 2: Run the focused test**

Expected: FAIL because the structured retriever does not exist.

- [ ] **Step 3: Implement scoring with explicit constants**

Use the existing binary-body BM25 implementation and add:

```ts
const SCORE = {
  routedProject: 20,
  excludedProject: -20,
  authoredClaim: 12,
  intentMatch: 8,
  exactQuestionAlias: 12,
  questionAliasTerms: 3,
  highDensity: 4,
  mediumDensity: 0,
  lowDensity: -8,
  overviewRoleForOverview: 8,
  architectureRoleForArchitecture: 8,
  contributionForOtherIntent: -10,
} as const;
```

Rules:

- an explicit project route excludes other project PDFs, but profile/resume may remain for contribution questions.
- authored claims outrank raw excerpts when both match.
- every matching intent adds `intentMatch`.
- exact normalized common questions add `exactQuestionAlias`.
- low-density pages are penalized, not deleted.
- an overview query boosts `overview`; an architecture query boosts `system-architecture`.
- a contribution query can return only public owner statements and public resume/profile evidence.
- a non-contribution query penalizes contribution claims.
- a candidate contribution can never exist in the index; fail closed if encountered.
- preserve the configured minimum score, requested-limit validation, and finite-score checks from `local-hybrid.ts`.

- [ ] **Step 4: Run focused tests**

```powershell
npx.cmd vitest run src/chat/retrieval/structured-hybrid.test.ts
```

Expected: PASS for overview, architecture, low-density penalty, and unrelated-query rejection.

- [ ] **Step 5: Commit**

```powershell
git add src/chat/retrieval/structured-hybrid.ts src/chat/retrieval/structured-hybrid.test.ts
git commit -m "feat: rank authored portfolio evidence"
```

### Task 3: Diversify the evidence packet

**Files:**

- Modify: `src/chat/retrieval/structured-hybrid.ts`
- Modify: `src/chat/retrieval/structured-hybrid.test.ts`

- [ ] **Step 1: Add failing diversity tests**

```ts
const results = await retriever.search(
  "哪个项目最能体现系统思考？",
  { locale: "zh", limit: 8 },
);
expect(new Set(results.map(({ chunk }) => chunk.sourceId)).size)
  .toBeGreaterThanOrEqual(2);
expect(results.every(({ chunk }) => chunk.knowledgeKind === "authored-claim"))
  .toBe(true);

const inkseat = await retriever.search("详细介绍INKSeat", {
  locale: "zh",
  limit: 8,
});
expect(new Set(inkseat.map(({ chunk }) => chunk.intents[0])).size)
  .toBeGreaterThanOrEqual(3);
```

- [ ] **Step 2: Run and observe the over-concentrated result**

Expected: FAIL because initial sorted results can repeat one intent or project.

- [ ] **Step 3: Add deterministic selection**

After scoring:

- for an explicitly routed project, select the best overview claim first when present.
- prefer at most two results with the same first intent.
- for a comparison query, select at most two results per source before filling remaining slots.
- deduplicate identical normalized claim text.
- prefer distinct primary evidence pages.
- use chunk ID as the final stable tie-breaker.
- retain the caller limit and maximum-result ceiling.

- [ ] **Step 4: Run tests and commit**

```powershell
npx.cmd vitest run src/chat/retrieval/structured-hybrid.test.ts
git add src/chat/retrieval/structured-hybrid.ts src/chat/retrieval/structured-hybrid.test.ts
git commit -m "feat: diversify portfolio evidence packets"
```

Expected: PASS.

### Task 4: Commit retrieval acceptance cases

**Files:**

- Create: `src/chat/retrieval/evaluation-cases.ts`
- Create: `src/chat/retrieval/evaluation.test.ts`

- [ ] **Step 1: Define the evaluation contract and cases**

```ts
export interface RetrievalEvaluationCase {
  readonly name: string;
  readonly query: string;
  readonly locale: "zh" | "en";
  readonly requiredChunkIds?: readonly string[];
  readonly requiredSourceIds?: readonly string[];
  readonly forbiddenPrimaryChunkIds?: readonly string[];
  readonly minimumDistinctSources?: number;
  readonly expectNoResults?: boolean;
}

export const retrievalEvaluationCases: readonly RetrievalEvaluationCase[] = [
  {
    name: "INKSeat Chinese overview",
    query: "inkseat是什么作品",
    locale: "zh",
    requiredChunkIds: ["inkseat:claim:inkseat.overview"],
    forbiddenPrimaryChunkIds: ["inkseat:p14:c0", "inkseat:p18:c0"],
  },
  {
    name: "INKSeat architecture",
    query: "INKSeat的系统架构是什么",
    locale: "zh",
    requiredChunkIds: ["inkseat:claim:inkseat.architecture"],
  },
  {
    name: "INKSeat problem",
    query: "INKSeat解决了什么问题",
    locale: "zh",
    requiredChunkIds: ["inkseat:claim:inkseat.problem"],
  },
  {
    name: "EMOVUE technology",
    query: "EMOVUE如何自动捕捉情绪瞬间",
    locale: "zh",
    requiredChunkIds: ["emovue:claim:emovue.technical-prototype"],
  },
  {
    name: "Fruit algorithm",
    query: "Fruit & Evolution如何生成果实形态",
    locale: "zh",
    requiredChunkIds: [
      "evolution-fruit:claim:evolution-fruit.algorithm",
      "evolution-fruit:claim:evolution-fruit.parametric-model",
    ],
  },
  {
    name: "Atempo data translation",
    query: "Atempo如何把呼吸转化为反馈",
    locale: "zh",
    requiredChunkIds: ["atempo:claim:atempo.data-translation"],
  },
  {
    name: "UroSense measurement",
    query: "UroSense如何完成尿量测量",
    locale: "zh",
    requiredChunkIds: ["urosense:claim:urosense.measurement-flow"],
  },
  {
    name: "First Fly English overview",
    query: "What is First Fly?",
    locale: "en",
    requiredChunkIds: ["first-fly:claim:first-fly.overview"],
  },
  {
    name: "Cross-project systems thinking",
    query: "哪个项目最能体现系统思考？",
    locale: "zh",
    minimumDistinctSources: 2,
  },
  {
    name: "Unrelated private scheduling",
    query: "赵实旷周末几点有空？",
    locale: "zh",
    expectNoResults: true,
  },
];
```

- [ ] **Step 2: Write the parameterized test**

For each case, run the real version-2 index with limit 8. Required chunks must occur in the results; forbidden primary chunks cannot be result 0; required sources and distinct-source counts must match; no-result cases must return `[]`.

- [ ] **Step 3: Run and fix only retrieval defects**

```powershell
npx.cmd vitest run src/chat/retrieval/evaluation.test.ts
```

Expected: all cases PASS. Do not weaken an acceptance case to accommodate a bad ranking.

- [ ] **Step 4: Commit**

```powershell
git add src/chat/retrieval/evaluation-cases.ts src/chat/retrieval/evaluation.test.ts
git commit -m "test: add portfolio retrieval acceptance suite"
```

### Task 5: Send structured evidence to the text model

**Files:**

- Modify: `src/chat/server/prompt.ts`
- Modify: `src/chat/server/prompt.test.ts`

- [ ] **Step 1: Add failing prompt tests**

```ts
expect(prompt.system).toContain("先直接回答访客的问题");
expect(prompt.system).toContain("问题、方案与价值");
expect(prompt.system).toContain('"knowledgeKind":"authored-claim"');
expect(prompt.system).toContain('"provenance":"document_fact"');
expect(prompt.system).toContain('"evidencePages":[1,8]');
expect(prompt.system).toContain('"intents":["overview"]');
expect(prompt.system).toContain('"pageRole":"overview"');
```

Add a contribution test asserting that the prompt explicitly distinguishes team outcomes from owner-confirmed personal contributions.

- [ ] **Step 2: Run the focused test**

```powershell
npx.cmd vitest run src/chat/server/prompt.test.ts
```

Expected: FAIL against the existing excerpt-only evidence.

- [ ] **Step 3: Extend evidence serialization**

For each retrieved chunk add these untrusted-data fields:

```ts
{
  source: "S1",
  sourceId: chunk.sourceId,
  title: chunk.title,
  page: chunk.page,
  evidencePages: chunk.evidencePages,
  knowledgeKind: chunk.knowledgeKind,
  provenance: chunk.provenance,
  intents: chunk.intents,
  pageRole: chunk.pageRole,
  excerpt: chunk.text,
}
```

Add answer rules:

- answer the question in the first sentence.
- a project overview normally covers project, problem, solution, and value in one or two paragraphs.
- synthesize complementary claims instead of describing sources one by one.
- do not say “资料未提供更多信息” when retrieved authored claims do provide it.
- distinguish documented team outcomes from owner-confirmed personal contribution.
- continue to cite every verifiable important fact and never cite a source ID absent from the packet.
- retain all existing prompt-injection, privacy, secret, and system-prompt protections.

- [ ] **Step 4: Run prompt tests and commit**

```powershell
npx.cmd vitest run src/chat/server/prompt.test.ts
git add src/chat/server/prompt.ts src/chat/server/prompt.test.ts
git commit -m "feat: prompt the assistant as a grounded project guide"
```

Expected: PASS.

### Task 6: Switch the shared runtime to structured retrieval

**Files:**

- Modify: `src/chat/server/runtime.ts`
- Modify: `src/chat/server/runtime.test.ts`

- [ ] **Step 1: Add a failing runtime factory test**

Keep the injectable factory boundary, then assert the default runtime source imports `createStructuredHybridRetriever` and no longer imports `createLocalHybridRetriever`.

Update the committed-index assertion:

```ts
expect(captures.index?.version).toBe(2);
expect(captures.index?.chunks.some(
  ({ knowledgeKind }) => knowledgeKind === "authored-claim",
)).toBe(true);
```

- [ ] **Step 2: Run the focused test**

```powershell
npx.cmd vitest run src/chat/server/runtime.test.ts
```

Expected: FAIL until the default factory changes.

- [ ] **Step 3: Change only the default retriever**

```ts
import { createStructuredHybridRetriever } from "../retrieval/structured-hybrid.js";

function defaultFactories(): RuntimeFactories {
  return {
    createRetriever: (index) => createStructuredHybridRetriever(index),
    createProvider: (options) => new DeepSeekProvider(options),
    createRateLimitStore: (options) => createUpstashRateLimitStore(options),
  };
}
```

Do not change provider, limits, environment variables, endpoint, SSE, or CORS.

- [ ] **Step 4: Run runtime and handler tests**

```powershell
npx.cmd vitest run src/chat/server/runtime.test.ts src/chat/server/chat-handler.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/chat/server/runtime.ts src/chat/server/runtime.test.ts
git commit -m "feat: use structured portfolio rag at runtime"
```

### Task 7: Verify streamed answers and citations

**Files:**

- Modify: `src/chat/server/chat-handler.test.ts`

- [ ] **Step 1: Add an INKSeat SSE integration test**

Use a fake provider that asserts its system prompt contains the INKSeat overview and architecture claims, then streams:

```text
INKSeat 是面向窄体机经济舱的电子纸显示系统，主要服务于无 IFE 或去 IFE 的客舱。[[S1]]
```

Assert:

- response status is 200.
- SSE order remains `start → delta → sources → done`.
- the public source is INKSeat page 1.
- page 14 and page 18 are not returned as fallback sources.
- citation markers are removed from visible text by the existing parser.

- [ ] **Step 2: Add a contribution safety test**

Ask “赵实旷在 INKSeat 中做了什么？” and assert the evidence packet contains the shared public core-contributor owner statement but no candidate contribution text.

- [ ] **Step 3: Run handler tests**

```powershell
npx.cmd vitest run src/chat/server/chat-handler.test.ts
```

Expected: PASS without changing the SSE protocol.

- [ ] **Step 4: Commit**

```powershell
git add src/chat/server/chat-handler.test.ts
git commit -m "test: verify grounded portfolio chat answers"
```

### Task 8: Run regression, build, and package verification

**Files:**

- Modify: `docs/deployment/tencent-scf-chat.md`
- Regenerate: `output/portfolio-chat-scf.zip`

- [ ] **Step 1: Run knowledge and retrieval verification**

```powershell
npm.cmd run knowledge:verify
npx.cmd vitest run src/chat/knowledge src/chat/retrieval src/chat/server
```

Expected: all tests PASS, including every committed retrieval case.

- [ ] **Step 2: Run the full suite and production build**

```powershell
npm.cmd test
npm.cmd run build
```

Expected: all tests PASS; TypeScript and Vite build exit 0; no secret appears in the client bundle.

- [ ] **Step 3: Build and verify the SCF artifact**

```powershell
npm.cmd run scf:build
npm.cmd run scf:verify
Get-FileHash -Algorithm SHA256 output/portfolio-chat-scf.zip
```

Expected: package verification exits 0 and prints a SHA-256 hash for the new archive.

- [ ] **Step 4: Update deployment documentation**

Document:

1. Upload the new `output/portfolio-chat-scf.zip` to the existing `portfolio-ai-chat` function.
2. Keep all current environment variables unchanged.
3. Publish a new function version.
4. Run an OPTIONS request from `https://portfolio-ai-chat-clean.pages.dev`.
5. Ask the five smoke-test questions below on the production site.
6. Check SCF logs only for failures; knowledge text and secrets must not be logged.

Smoke questions:

```text
INKSeat是什么作品？
INKSeat的系统架构是什么？
EMOVUE如何自动捕捉情绪瞬间？
UroSense解决了什么问题？
哪个项目最能体现赵实旷的系统思考？
```

- [ ] **Step 5: Commit**

```powershell
git add docs/deployment/tencent-scf-chat.md output/portfolio-chat-scf.zip
git commit -m "build: package structured portfolio rag runtime"
```

### Task 9: Production smoke test and handoff

**Files:**

- No source changes unless a verified defect is found.

- [ ] **Step 1: Test the function directly**

Send a POST request with:

```json
{
  "message": "INKSeat是什么作品",
  "history": [],
  "sessionId": "rag_smoke_20260728",
  "locale": "zh"
}
```

Expected: HTTP 200 SSE; the answer directly identifies the project; sources include INKSeat page 1.

- [ ] **Step 2: Test the live website**

Open `https://portfolio-ai-chat-clean.pages.dev`, hard refresh, and ask all five smoke questions. Confirm:

- direct project explanations replace the former generic response.
- citations open the correct PDF page.
- the chat panel position and scrolling remain unchanged.
- no CORS, rate-limit, or upstream errors appear.

- [ ] **Step 3: Record the release evidence**

Record the Git commit, SCF package SHA-256, function version, test time, and five outcomes in the deployment log section of `docs/deployment/tencent-scf-chat.md`.

- [ ] **Step 4: Final commit if the deployment log changed**

```powershell
git add docs/deployment/tencent-scf-chat.md
git commit -m "docs: record structured rag deployment"
```

- [ ] **Step 5: Confirm a clean handoff**

```powershell
git status --short
git log --oneline -12
```

Expected: clean worktree and visible corpus, retrieval, package, and deployment commits.
