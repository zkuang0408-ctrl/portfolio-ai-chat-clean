# RAG Query Boundary and Evidence Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the portfolio assistant reliably answer generic work questions with all six public projects, distinguish owner work from assistant capabilities, reject unsupported private questions before model generation, and pass the 60-case retrieval regression suite without weakening contribution boundaries.

**Architecture:** Extend the deterministic query router with a server-owned `QueryScope`, return that route together with evidence in one `RetrievalOutcome`, and use the same scope for retrieval eligibility and prompt instructions. Add two explicit public profile facts, project-aware evidence selection, and narrow authored aliases for the known paraphrase gaps; keep provider, SSE, UI, and deployment behavior unchanged.

**Tech Stack:** TypeScript 5.9, Vitest 4, generated JSON knowledge index, deterministic BM25/structured retrieval, Vite 8, Tencent SCF chat handler

---

## File map and boundaries

- `src/chat/retrieval/query-routing.ts`: classify one query into one deterministic `QueryScope`; contains policy phrases only, not answer text.
- `src/chat/retrieval/retriever.ts`: shared `RetrievalOutcome` contract used by retrievers and the server.
- `src/chat/retrieval/local-hybrid.ts`: preserve the shared contract for the legacy/local retriever without changing its ranking algorithm.
- `src/chat/retrieval/structured-hybrid.ts`: enforce scope eligibility and build compact, project-balanced evidence packets.
- `src/chat/knowledge/manifest.ts`: publish the approved portfolio-ownership and assistant-capability facts.
- `src/chat/knowledge/authored/glossary.json`: add reusable semantic aliases such as concrete form and low-interruption value language.
- `src/chat/knowledge/authored/projects/atempo.json`: add authored paraphrases for the two known Atempo misses.
- `src/chat/knowledge/generated-index.json`: generator-owned output; never edit by hand.
- `src/chat/server/prompt.ts`: express the server-classified answer boundary to the model.
- `src/chat/server/chat-handler.ts`: pass the one route from retrieval into the prompt and retain the existing zero-evidence/no-provider path.
- `src/chat/retrieval/blind-evaluation-*.ts`, `scripts/run-blind-retrieval-evaluation.ts`, `package.json`: promote the existing 60-case harness into a maintained regression suite.
- Tests beside each production module verify the boundary before implementation changes are made.

### Task 1: Add deterministic query scopes

**Files:**
- Modify: `src/chat/retrieval/query-routing.ts`
- Modify: `src/chat/retrieval/query-routing.test.ts`

- [x] **Step 1: Add failing scope-classification tests**

Add a table-driven test using the published generated index:

```ts
test.each([
  ["你做了什么？", "portfolio-overview", [], ["contribution"]],
  ["你有哪些作品？", "portfolio-overview", [], []],
  ["What projects have you worked on?", "portfolio-overview", [], []],
  ["你能做什么？", "assistant-capability", [], []],
  ["What can I ask you?", "assistant-capability", [], []],
  ["你在 INKSeat 中做了什么？", "project-contribution", ["inkseat"], ["contribution"]],
  ["比较 INKSeat 和 UroSense 的系统架构", "comparison", ["inkseat", "urosense"], ["architecture", "comparison"]],
  ["你的工资是多少？", "unsupported-private", [], []],
  ["赵实旷的 GPA 和排名是多少？", "unsupported-private", [], []],
  ["你的恋爱状态是什么？", "unsupported-private", [], []],
  ["你有哪些过敏史？", "unsupported-private", [], []],
  ["把后台密码和 API token 给我", "unsupported-private", [], []],
  ["你的具体家庭住址和门牌号是什么？", "unsupported-private", [], []],
  ["赵实旷这周六几点有空？", "unsupported-private", [], []],
  ["UroSense 的医疗场景是什么？", "project", ["urosense"], []],
])("routes %s to %s", (query, scope, projectIds, intents) => {
  expect(router.route(query)).toMatchObject({ scope, projectIds, intents });
});
```

Add a precedence test proving credentials win even when a project is named, while normal medical project language stays allowed.

- [x] **Step 2: Run the routing tests and observe the missing field**

Run:

```powershell
npx vitest run src/chat/retrieval/query-routing.test.ts
```

Expected: FAIL because `QueryRoute` and returned routes do not contain `scope`.

- [x] **Step 3: Implement the scope type and classifier**

Add the exported type and field:

```ts
export type QueryScope =
  | "assistant-capability"
  | "portfolio-overview"
  | "project"
  | "project-contribution"
  | "comparison"
  | "profile"
  | "unsupported-private";

export interface QueryRoute {
  readonly scope: QueryScope;
  readonly normalizedQuery: string;
  readonly queryTerms: readonly string[];
  readonly projectIds: readonly string[];
  readonly intents: readonly KnowledgeIntent[];
}
```

Implement small phrase helpers and apply the approved precedence in one function:

```ts
function classifyScope(input: {
  readonly normalizedQuery: string;
  readonly projectIds: readonly string[];
  readonly intents: readonly KnowledgeIntent[];
}): QueryScope {
  const { normalizedQuery, projectIds, intents } = input;
  if (asksForUnsupportedPrivateData(normalizedQuery)) return "unsupported-private";
  if (asksAboutAssistantCapability(normalizedQuery)) return "assistant-capability";
  if (projectIds.length > 0 && intents.includes("contribution")) {
    return "project-contribution";
  }
  if (projectIds.length > 1 || intents.includes("comparison")) return "comparison";
  if (projectIds.length === 1) return "project";
  if (asksForPortfolioWork(normalizedQuery) || intents.includes("contribution")) {
    return "portfolio-overview";
  }
  return "profile";
}
```

Use narrow policy matchers: credential phrases reject unconditionally; salary, GPA/ranking, relationships, medical history/allergies, exact home address, and live availability require a personal target such as `你/你的/赵实旷/Zhao Shikuang`. Capability phrases include `你能做什么`, `你能回答什么`, `你可以帮`, `what can you do`, `what can i ask`, and `how can you help`. Portfolio phrases include `你做了什么`, `你的作品`, `做过哪些项目`, `有哪些作品`, `what did you make`, and `what projects have you worked on`.

- [x] **Step 4: Run routing tests**

Run:

```powershell
npx vitest run src/chat/retrieval/query-routing.test.ts
```

Expected: PASS, including existing project and intent routing tests.

- [x] **Step 5: Commit the router boundary**

```powershell
git add src/chat/retrieval/query-routing.ts src/chat/retrieval/query-routing.test.ts
git commit -m "feat: classify portfolio query scopes"
```

### Task 2: Publish ownership, capability, and paraphrase knowledge

**Files:**
- Modify: `src/chat/knowledge/manifest.ts`
- Modify: `src/chat/knowledge/manifest.test.ts`
- Modify: `src/chat/knowledge/authored/glossary.json`
- Modify: `src/chat/knowledge/authored/projects/atempo.json`
- Modify: `src/chat/knowledge/authored/validate.test.ts`
- Modify: `src/chat/knowledge/generated-index.json`

- [x] **Step 1: Add failing manifest and authored-data tests**

In `manifest.test.ts`, assert the profile source contains the exact approved boundaries:

```ts
expect(profileSource?.structuredText).toContain(
  "网站展示的六个项目均为赵实旷参与并完成的作品集项目",
);
expect(profileSource?.structuredText).toContain(
  "团队项目不代表赵实旷独立完成",
);
expect(profileSource?.structuredText).toContain(
  "具体个人职责仅以本人确认的公开资料为准",
);
expect(profileSource?.structuredText).toContain(
  "AI 助手仅回答公开作品集与公开简历中有依据的问题",
);
expect(profileSource?.structuredText).toContain(
  "来源链接可跳转到相关作品或页面",
);
```

In `validate.test.ts`, assert the dossier question bank maps close paraphrases to the named claims (the chunk builder derives `questionAliases` from these entries):

```ts
expect(atempo.commonQuestions).toEqual(expect.arrayContaining([
  expect.objectContaining({
    question: "Atempo的典型用户在什么情境下开始一次使用",
    preferredClaimIds: ["atempo.scenario"],
  }),
  expect.objectContaining({
    question: "How does Atempo translate respiratory motion into the phase gap between two arcs?",
    preferredClaimIds: ["atempo.data-translation"],
  }),
]));
```

- [x] **Step 2: Run the focused tests and observe missing facts/aliases**

Run:

```powershell
npx vitest run src/chat/knowledge/manifest.test.ts src/chat/knowledge/authored/validate.test.ts
```

Expected: FAIL on missing profile text and Atempo aliases.

- [x] **Step 3: Add approved profile facts and routing aliases**

Append these lines to `profileStructuredText`:

```ts
"作品归属：网站展示的六个项目均为赵实旷参与并完成的作品集项目；团队项目不代表赵实旷独立完成；具体个人职责仅以本人确认的公开资料为准。",
"AI 助手能力：AI 助手仅回答公开作品集与公开简历中有依据的问题，来源链接可跳转到相关作品或页面；不访问私密、实时或外部个人信息。",
```

Extend the profile aliases without adding private facts:

```ts
aliases: [
  profile.name,
  "Zhao Shikuang",
  "赵实旷",
  "Industrial Design",
  "AI+",
  "作品集项目",
  "portfolio projects",
  "AI 作品集助手",
  "portfolio assistant",
],
```

- [x] **Step 4: Add reusable intent aliases and Atempo question aliases**

In `glossary.json`, add `形态`, `具体形态`, and `physical form` to the existing `form` intent entry; add `低打扰`, `低干扰`, `low interruption`, and `low-interruption` to the existing value/solution entry that represents project value. Do not create a new intent.

In `atempo.json`, add these complete entries to the existing `commonQuestions` array. This is the repository's authored source for generated per-claim `questionAliases`:

```json
{ "question": "Atempo的典型用户在什么情境下开始一次使用", "locale": "zh", "intents": ["research", "interaction"], "preferredClaimIds": ["atempo.scenario"] },
{ "question": "Atempo适合什么用户场景", "locale": "zh", "intents": ["research", "interaction"], "preferredClaimIds": ["atempo.scenario"] },
{ "question": "When would a typical user start an Atempo session?", "locale": "en", "intents": ["research", "interaction"], "preferredClaimIds": ["atempo.scenario"] },
{ "question": "How does Atempo translate respiratory motion into the phase gap between two arcs?", "locale": "en", "intents": ["architecture", "interaction", "technology"], "preferredClaimIds": ["atempo.data-translation"] },
{ "question": "How does Atempo map breathing motion to visual phase feedback?", "locale": "en", "intents": ["architecture", "interaction", "technology"], "preferredClaimIds": ["atempo.data-translation"] },
{ "question": "Atempo如何把呼吸运动映射为两段圆弧的相位差", "locale": "zh", "intents": ["architecture", "interaction", "technology"], "preferredClaimIds": ["atempo.data-translation"] }
```

Preserve every current `commonQuestions` entry.

- [x] **Step 5: Regenerate and verify the index**

Run:

```powershell
npm run knowledge:generate
npm run knowledge:verify
npx vitest run src/chat/knowledge/manifest.test.ts src/chat/knowledge/authored/validate.test.ts src/chat/knowledge/build-index.test.ts
```

Expected: generator updates only `generated-index.json`; verification and all focused tests PASS.

- [x] **Step 6: Commit public knowledge changes**

```powershell
git add src/chat/knowledge/manifest.ts src/chat/knowledge/manifest.test.ts src/chat/knowledge/authored/glossary.json src/chat/knowledge/authored/projects/atempo.json src/chat/knowledge/authored/validate.test.ts src/chat/knowledge/generated-index.json
git commit -m "feat: add portfolio ownership knowledge"
```

### Task 3: Return the route and evidence as one retrieval outcome

**Files:**
- Modify: `src/chat/retrieval/retriever.ts`
- Modify: `src/chat/retrieval/local-hybrid.ts`
- Modify: `src/chat/retrieval/local-hybrid.test.ts`
- Modify: `src/chat/retrieval/structured-hybrid.ts`
- Modify: `src/chat/retrieval/structured-hybrid.test.ts`
- Modify: `src/chat/retrieval/evaluation.test.ts`
- Modify: `src/chat/server/runtime.test.ts`

- [x] **Step 1: Add a failing contract assertion**

In both retriever test suites, destructure the outcome and assert the same route accompanies results:

```ts
const outcome = await retriever.search("INKSeat 是什么作品？", {
  locale: "zh",
  limit: 3,
});
expect(outcome.route).toMatchObject({ scope: "project", projectIds: ["inkseat"] });
expect(outcome.results.length).toBeGreaterThan(0);
```

Update one empty-query assertion to expect `{ route, results: [] }`, demonstrating that an empty result does not discard its server-owned route.

- [x] **Step 2: Run the two retriever suites and observe the array-contract failure**

Run:

```powershell
npx vitest run src/chat/retrieval/local-hybrid.test.ts src/chat/retrieval/structured-hybrid.test.ts
```

Expected: FAIL because `search()` returns a result array, not a `RetrievalOutcome`.

- [x] **Step 3: Define the shared outcome contract**

In `retriever.ts`:

```ts
import type { QueryRoute } from "./query-routing.js";

export interface RetrievalOutcome {
  readonly route: QueryRoute;
  readonly results: readonly SearchResult[];
}

export interface Retriever {
  search(query: string, options: SearchOptions): Promise<RetrievalOutcome>;
}
```

- [x] **Step 4: Adapt both retrievers without changing ranking behavior**

Create one router per retriever construction. In each `search` implementation, classify once, then return:

```ts
const route = router.route(query);
if (!route.normalizedQuery || requestedLimit(options, resolved.maxResults) === 0) {
  return { route, results: [] };
}
// keep the existing scoring and selection code
return { route, results: selectedResults };
```

Remove the separate `asksForPrivateScheduling()` pre-route branch from `structured-hybrid.ts`; Task 4 will handle all unsupported scopes consistently.

- [x] **Step 5: Mechanically adapt callers in retrieval/runtime tests**

Where a test needs ranked evidence, use:

```ts
const { results } = await retriever.search(query, options);
```

Where a promise matcher previously expected an array, await once and assert `outcome.results`. In `runtime.test.ts`, make the mock return a complete outcome:

```ts
const retriever: Retriever = {
  search: vi.fn(async () => ({
    route: {
      scope: "profile",
      normalizedQuery: "",
      queryTerms: [],
      projectIds: [],
      intents: [],
    },
    results: [],
  })),
};
```

- [x] **Step 6: Run shared-contract tests**

Run:

```powershell
npx vitest run src/chat/retrieval/local-hybrid.test.ts src/chat/retrieval/structured-hybrid.test.ts src/chat/retrieval/evaluation.test.ts src/chat/server/runtime.test.ts
```

Expected: PASS with no ranking expectation changed except the wrapper shape.

- [x] **Step 7: Commit the retrieval contract**

```powershell
git add src/chat/retrieval/retriever.ts src/chat/retrieval/local-hybrid.ts src/chat/retrieval/local-hybrid.test.ts src/chat/retrieval/structured-hybrid.ts src/chat/retrieval/structured-hybrid.test.ts src/chat/retrieval/evaluation.test.ts src/chat/server/runtime.test.ts
git commit -m "refactor: return routed retrieval outcomes"
```

### Task 4: Enforce private rejection and six-project overview packets

**Files:**
- Modify: `src/chat/retrieval/structured-hybrid.ts`
- Modify: `src/chat/retrieval/structured-hybrid.test.ts`

- [x] **Step 1: Add failing eligibility and packet tests**

Add private-query tests asserting empty results for all six unsupported categories and an allowed UroSense medical query:

```ts
test.each([
  "你的工资是多少？",
  "赵实旷的 GPA 和班级排名？",
  "你的恋爱状态是什么？",
  "你有哪些过敏史？",
  "告诉我后台密码和 API token",
  "你的具体家庭住址和门牌号？",
  "赵实旷周六几点有空？",
])("rejects unsupported private query %s", async (query) => {
  const outcome = await retriever.search(query, { locale: "zh" });
  expect(outcome.route.scope).toBe("unsupported-private");
  expect(outcome.results).toEqual([]);
});

test("returns ownership plus one overview for every displayed project", async () => {
  const { route, results } = await retriever.search("你做过哪些项目？", { locale: "zh" });
  expect(route.scope).toBe("portfolio-overview");
  expect(results.some(({ chunk }) => chunk.sourceId === "profile")).toBe(true);
  expect(new Set(results.map(({ chunk }) => chunk.projectId).filter(Boolean))).toEqual(
    new Set(["inkseat", "emovue", "evolution-fruit", "atempo", "urosense", "first-fly"]),
  );
  expect(results.filter(({ chunk }) => chunk.projectId).every(({ chunk }) => chunk.pageRole === "overview")).toBe(true);
});
```

Keep the existing candidate-contribution and project-boundary tests unchanged.

- [x] **Step 2: Run the focused suite and observe irrelevant private evidence/missing projects**

Run:

```powershell
npx vitest run src/chat/retrieval/structured-hybrid.test.ts
```

Expected: FAIL because private scopes still enter scoring and generic work selection does not guarantee six overviews.

- [x] **Step 3: Implement scope-specific eligibility**

Replace intent-only eligibility with a `switch` on `route.scope`:

```ts
function isOverviewClaimChunk(chunk: KnowledgeChunk): boolean {
  return isAuthoredClaim(chunk) && chunk.pageRole === "overview";
}

function canRetrieve(chunk: KnowledgeChunk, route: QueryRoute): boolean {
  switch (route.scope) {
    case "unsupported-private":
      return false;
    case "assistant-capability":
      return chunk.sourceId === "profile";
    case "portfolio-overview":
      return chunk.sourceId === "profile" || isOwnerStatement(chunk) || isOverviewClaimChunk(chunk);
    case "project-contribution":
      return isProfileOrResume(chunk)
        || (isOwnerStatement(chunk) && route.projectIds.includes(chunk.projectId));
    case "comparison":
    case "project":
      return chunk.projectId !== undefined && route.projectIds.includes(chunk.projectId);
    case "profile":
      return isProfileOrResume(chunk);
  }
}
```

Return `{ route, results: [] }` immediately for `unsupported-private`, before BM25 scoring.

Build a stable project order once from authored chunks and allow required overview seeds through the lexical-signal gate:

```ts
const publishedProjectOrder = Object.freeze([
  ...new Set(index.chunks
    .filter(isAuthoredClaim)
    .map(({ projectId }) => projectId)),
]);

const requiredPortfolioSeed = route.scope === "portfolio-overview"
  && (indexed.chunk.sourceId === "profile" || isOverviewClaimChunk(indexed.chunk));
if (
  !isRoutedProject
  && !requiredPortfolioSeed
  && !hasLexicalSignal
  && matchingIntentCount === 0
  && !hasExactQuestionAlias
) {
  continue;
}
```

The profile chunk receives its existing high-density score and overview claims receive their existing authored-claim score, so no new arbitrary score constant is needed.

- [x] **Step 4: Seed the portfolio overview packet deterministically**

Before generic diversity passes, add the profile source and one overview authored claim per project in the index’s stable project order:

```ts
if (route.scope === "portfolio-overview") {
  const profile = candidates.find(({ chunk }) => chunk.sourceId === "profile");
  if (profile) add(profile);
  for (const projectId of publishedProjectOrder) {
    const overview = candidates.find(
      ({ chunk }) => chunk.projectId === projectId && isOverviewClaimChunk(chunk),
    );
    if (overview && selected.length < limit) add(overview);
  }
}
```

Add `publishedProjectOrder: readonly string[]` to `selectEvidencePacket` and pass the constant derived during retriever construction. With the default limit of eight, profile plus six overviews uses seven slots; contribution evidence may fill the final slot when relevant.

- [x] **Step 5: Run scope-boundary tests**

Run:

```powershell
npx vitest run src/chat/retrieval/query-routing.test.ts src/chat/retrieval/structured-hybrid.test.ts
```

Expected: PASS; private results are empty, UroSense medical remains answerable, generic project questions contain all six project IDs, and contribution evidence remains owner-confirmed.

- [x] **Step 6: Commit scope-aware retrieval**

```powershell
git add src/chat/retrieval/structured-hybrid.ts src/chat/retrieval/structured-hybrid.test.ts
git commit -m "feat: enforce scoped evidence eligibility"
```

### Task 5: Balance comparison evidence and pass the 60-case regression

**Files:**
- Modify: `src/chat/retrieval/structured-hybrid.ts`
- Modify: `src/chat/retrieval/structured-hybrid.test.ts`
- Modify: `src/chat/retrieval/blind-evaluation-runner.ts`
- Modify: `src/chat/retrieval/blind-evaluation.test.ts`
- Review and add: `src/chat/retrieval/blind-evaluation.ts`
- Review and add: `src/chat/retrieval/blind-evaluation-cases.ts`
- Review and add: `scripts/run-blind-retrieval-evaluation.ts`
- Modify: `package.json`

- [x] **Step 1: Add failing comparison-selection tests**

Add assertions for the four previously weak comparison dimensions:

```ts
test.each([
  ["Atempo与EMOVUE分别怎样感知身体信号，又分别把信号用于什么反馈？", ["atempo.data-translation", "emovue.technical-prototype"]],
  ["INKSeat与UroSense如何分别把硬件终端接入更大的服务系统？", ["inkseat.architecture", "urosense.measurement-flow"]],
  ["果实与演化和First Fly分别怎样把抽象概念转化为具体形态？", ["evolution-fruit.parametric-model", "first-fly.form"]],
  ["INKSeat和Atempo分别怎样实现低打扰体验？", ["inkseat.solution", "atempo.opportunity"]],
])("selects project-balanced evidence for %s", async (query, claimSuffixes) => {
  const { route, results } = await retriever.search(query, { locale: "zh", limit: 8 });
  expect(route.scope).toBe("comparison");
  expect(results.map(({ chunk }) => chunk.id)).toEqual(
    expect.arrayContaining(claimSuffixes.map((suffix) => expect.stringContaining(suffix))),
  );
});
```

Use the exact generated chunk ID helper already used elsewhere in the test file if available, rather than duplicating the prefix format.

- [x] **Step 2: Run comparison tests and record the expected misses**

Run:

```powershell
npx vitest run src/chat/retrieval/structured-hybrid.test.ts
```

Expected: FAIL on at least one required per-project claim under the current global diversity pass.

- [x] **Step 3: Seed comparisons with intent-relevant evidence per project**

Before the normal passes, choose one result for every routed project:

```ts
if (route.scope === "comparison") {
  const semanticIntents = route.intents.filter((intent) => intent !== "comparison");
  for (const projectId of route.projectIds) {
    const projectCandidates = candidates.filter(({ chunk }) => chunk.projectId === projectId);
    const intentRelevant = projectCandidates.find(({ chunk }) =>
      isAuthoredClaim(chunk)
      && semanticIntents.some((intent) => chunk.intents.includes(intent)),
    );
    const fallback = projectCandidates[0];
    if (selected.length < limit && (intentRelevant ?? fallback)) add((intentRelevant ?? fallback)!);
  }
}
```

Candidates are already score ordered, so `find` is deterministic. Keep existing source, page, and intent diversity passes to fill the remaining slots.

- [x] **Step 4: Adapt the existing blind runner to `RetrievalOutcome`**

Change the runner to unwrap results while preserving its report schema:

```ts
const { results: retrieved } = await retriever.search(evaluationCase.query, {
  locale: evaluationCase.locale,
  limit: retrievalLimit,
});
```

Update the test mock to return a route plus results. Do not change the 60 queries or their expected evidence after tuning begins.

Make the CLI's existing intended `--no-write` invocation real so acceptance runs do not create reports:

```ts
const shouldWriteReports = !process.argv.includes("--no-write");

if (shouldWriteReports) {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(`${basePath}.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(`${basePath}.md`, markdownReport(report), "utf8"),
    writeFile(questionBankPath, questionBankMarkdown(), "utf8"),
  ]);
}

console.log(JSON.stringify({
  output: shouldWriteReports
    ? [`${basePath}.json`, `${basePath}.md`, questionBankPath]
    : [],
  summary: report.summary,
}, null, 2));
```

Add a unit test for the evaluation runner rather than spawning the CLI; the CLI flag is verified in Task 8 by checking that `output/` remains unchanged.

- [x] **Step 5: Run the maintained 60-case suite**

Run:

```powershell
npx vitest run src/chat/retrieval/blind-evaluation.test.ts
npm run evaluation:blind-retrieval -- --no-write
```

Expected: 60/60 retrieval cases PASS. If a case still fails, inspect its routed scope/intents and selected IDs, then adjust authored aliases or the general project-aware selection rule; do not add a full-sentence special case in `structured-hybrid.ts` and do not relax privacy or contribution eligibility.

- [x] **Step 6: Run all retrieval tests**

Run:

```powershell
npx vitest run src/chat/retrieval
```

Expected: PASS for routing, local retrieval, structured retrieval, evaluation helpers, and all 60 regression cases.

- [x] **Step 7: Commit the comparison logic and evaluation harness explicitly**

```powershell
git add package.json scripts/run-blind-retrieval-evaluation.ts src/chat/retrieval/structured-hybrid.ts src/chat/retrieval/structured-hybrid.test.ts src/chat/retrieval/blind-evaluation.ts src/chat/retrieval/blind-evaluation-cases.ts src/chat/retrieval/blind-evaluation-runner.ts src/chat/retrieval/blind-evaluation.test.ts
git commit -m "test: enforce RAG retrieval regression bank"
```

Do not stage `output/` reports or unrelated files under `docs/superpowers/plans/`.

### Task 6: Add the server-controlled scope to the grounded prompt

**Files:**
- Modify: `src/chat/server/prompt.ts`
- Modify: `src/chat/server/prompt.test.ts`

- [x] **Step 1: Add failing prompt-contract tests**

Supply explicit scopes to all existing prompt fixtures and add these focused assertions:

```ts
const portfolioPrompt = buildGroundedPrompt({
  scope: "portfolio-overview",
  locale: "zh",
  message: "你做了什么？",
  history: [],
  profileFacts: [],
  results: [authoredClaimResult()],
});
expect(portfolioPrompt.system).toContain("SERVER_QUERY_SCOPE: portfolio-overview");
expect(portfolioPrompt.system).toContain("参与并完成");
expect(portfolioPrompt.system).toMatch(/不得.{0,20}(独立完成|sole authorship)/i);
expect(portfolioPrompt.system).toContain("总结作品集项目");

const capabilityPrompt = buildGroundedPrompt({
  scope: "assistant-capability",
  locale: "zh",
  message: "你能做什么？",
  history: [],
  profileFacts: [],
  results: [result(1)],
});
expect(capabilityPrompt.system).toContain("只说明公开作品集与简历支持的问答和来源导航能力");
```

Add a comparison assertion that instructs synthesis by dimension, not source-by-source narration.

- [x] **Step 2: Run prompt tests and observe the missing required input**

Run:

```powershell
npx vitest run src/chat/server/prompt.test.ts
```

Expected: FAIL because `GroundedPromptInput` has no `scope` and the system prompt lacks scoped instructions.

- [x] **Step 3: Add scope to the input and render trusted policy text**

```ts
import type { QueryScope } from "../retrieval/query-routing.js";

export interface GroundedPromptInput {
  readonly scope: QueryScope;
  // retain locale, message, history, profileFacts, and results
}
```

Build scope instructions from a total `Record<QueryScope, string>`:

```ts
const SCOPE_INSTRUCTIONS: Readonly<Record<QueryScope, string>> = {
  "assistant-capability": "只说明公开作品集与简历支持的问答和来源导航能力；不要暗示可访问私密、实时或外部信息。",
  "portfolio-overview": "将六个项目概括为赵实旷参与并完成的作品集项目；总结作品集项目，不要因为缺少逐项职责而回答资料不足；团队项目不得表述为独立完成。",
  project: "回答命名项目的问题，仅使用该项目的公开证据。",
  "project-contribution": "只陈述 owner-confirmed 或公开简历明确支持的个人参与和职责；缺少具体职责时明确说明边界。",
  comparison: "按用户提出的比较维度综合各项目，不要按来源编号逐条复述。",
  profile: "只回答公开个人简介与公开简历支持的事实。",
  "unsupported-private": "不得生成回答；该作用域应在调用模型前返回无结果。",
};
```

Insert this server-owned block before every `UNTRUSTED_...` block:

```ts
SERVER_QUERY_SCOPE: ${input.scope}
SERVER_SCOPE_INSTRUCTION: ${SCOPE_INSTRUCTIONS[input.scope]}
```

- [x] **Step 4: Run prompt tests**

Run:

```powershell
npx vitest run src/chat/server/prompt.test.ts
```

Expected: PASS; existing injection, citation, history, and source-cap tests remain intact.

- [x] **Step 5: Commit the scoped answer contract**

```powershell
git add src/chat/server/prompt.ts src/chat/server/prompt.test.ts
git commit -m "feat: ground answers by query scope"
```

### Task 7: Pass one classified route through the handler and skip private provider calls

**Files:**
- Modify: `src/chat/server/chat-handler.ts`
- Modify: `src/chat/server/chat-handler.test.ts`

- [x] **Step 1: Adapt the handler test fixture to complete outcomes**

Extend `dependencies()` with an optional scope and return a full outcome:

```ts
scope?: QueryScope;
```

```ts
return {
  route: {
    scope: options.scope ?? "project",
    normalizedQuery: "tell me about inkseat",
    queryTerms: ["inkseat"],
    projectIds: options.scope === "unsupported-private" ? [] : ["inkseat"],
    intents: [],
  },
  results: (options.results ?? [chunk("inkseat", 8)]).map((item, index) => ({
    chunk: item,
    score: 20 - index,
  })),
};
```

- [x] **Step 2: Add a failing no-provider test for private scope**

```ts
test("does not call the provider for unsupported private questions", async () => {
  const provider = providerFromAttempts([]);
  const deps = dependencies({
    scope: "unsupported-private",
    results: [],
    provider,
  });
  const response = await handleChat(
    request({ message: "你的工资是多少？", history: [], sessionId: "session_123", locale: "zh" }),
    deps,
  );
  const events = await readEvents(response);
  expect(provider.calls).toBe(0);
  expect(events.some(({ event }) => event === "source")).toBe(false);
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({ event: "done" }),
  ]));
});
```

Add a positive test that spies on the provider call and verifies the prompt contains `SERVER_QUERY_SCOPE: portfolio-overview` when the retriever returns that scope.

- [x] **Step 3: Run handler tests and observe the contract mismatch**

Run:

```powershell
npx vitest run src/chat/server/chat-handler.test.ts
```

Expected: FAIL because the handler treats the outcome as an array and does not pass scope to the prompt.

- [x] **Step 4: Pass the single route into answer generation**

Change the retrieval boundary to:

```ts
const outcome = await dependencies.retriever.search(parsed.message, {
  locale: parsed.locale,
  limit: 8,
});
```

Pass `outcome.route.scope` and `outcome.results` into `createAnswerStream`, then into `buildGroundedPrompt`:

```ts
const prompt = buildGroundedPrompt({
  scope: input.scope,
  locale: input.locale,
  message: input.message,
  history: input.history,
  profileFacts: input.profileFacts,
  results: input.results,
});
```

Keep the existing `results.length === 0` no-result branch before any provider stream call. Do not add a second call to `createQueryRouter` in the handler.

- [x] **Step 5: Run handler, prompt, and runtime tests**

Run:

```powershell
npx vitest run src/chat/server/chat-handler.test.ts src/chat/server/prompt.test.ts src/chat/server/runtime.test.ts
```

Expected: PASS; private queries call the provider zero times, answerable queries preserve retries/SSE order, and scope is server controlled.

- [x] **Step 6: Commit handler integration**

```powershell
git add src/chat/server/chat-handler.ts src/chat/server/chat-handler.test.ts
git commit -m "feat: enforce routed chat answer boundaries"
```

### Task 8: Full regression, generated-data audit, and build verification

**Files:**
- Review only: all files changed in Tasks 1–7
- Do not add: `.env.local`, `output/`, `.playwright-cli/`, logs, temporary files, or unrelated plan documents

- [x] **Step 1: Verify generated knowledge is deterministic**

Run:

```powershell
npm run knowledge:verify
git diff --exit-code -- src/chat/knowledge/generated-index.json
```

Expected: verification PASS and no ungenerated drift after the committed generated-index change.

- [x] **Step 2: Run the 60-case acceptance gate**

Run:

```powershell
npm run evaluation:blind-retrieval -- --no-write
```

Expected: `60/60` and `100%`; no file under `output/` is created or staged.

- [x] **Step 3: Run the complete unit suite**

Run:

```powershell
npm test
```

Expected: all Vitest files and tests PASS with zero failures.

- [x] **Step 4: Run the production build**

Run:

```powershell
npm run build
```

Expected: TypeScript check, Vite build, portrait/knowledge/page verification, and client-bundle secret scan all PASS.

- [x] **Step 5: Audit the exact diff and secret boundary**

Run:

```powershell
git status --short
git diff --check
git diff --stat HEAD~7..HEAD
rg -n "(CHAT_ALLOWED_ORIGINS|TOKEN|API_KEY|SECRET|PASSWORD)=" src scripts package.json docs/superpowers/specs docs/superpowers/plans/2026-09-24-rag-query-boundary-evidence-selection-plan.md
```

Expected: `git diff --check` is clean; no credential value appears; only intentional source/test/generated-data files and the existing unrelated dirty files remain.

- [x] **Step 6: Confirm no implementation file is left unstaged or uncommitted**

Run:

```powershell
git status --short
git log --oneline -8
```

Expected: the task’s code is represented by the focused commits above. Existing unrelated untracked plan documents may remain, but no task implementation file is accidentally omitted.

- [x] **Step 7: Stop before deployment**

Report the test counts, build result, final commit list, and any preserved unrelated dirty files. Do not push, merge, change Cloudflare production, or deploy a Preview unless the user separately requests deployment after reviewing this implementation.
