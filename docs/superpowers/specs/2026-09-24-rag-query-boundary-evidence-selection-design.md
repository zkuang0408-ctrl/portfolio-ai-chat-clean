# RAG Query Boundary and Evidence Selection Design

Date: 2026-09-24

## Context

The portfolio assistant already uses a generated v2 knowledge index, deterministic query routing, structured hybrid retrieval, grounded generation, server-side citation parsing, and source navigation. It correctly limits project-specific contribution questions to public profile/resume evidence and owner-confirmed statements.

Two gaps remain:

1. A generic question such as “你做了什么” retrieves all six owner-confirmed project contribution claims, but the claims only describe contribution level. The grounded model may therefore answer that the available material is insufficient instead of presenting the six portfolio projects.
2. A separate 60-question held-out retrieval run passes 48/60. The failures are concentrated in unsupported/private questions, cross-project evidence selection, and two Atempo paraphrases. Retrieval accuracy and final-answer accuracy are currently measured separately, so the existing 6/6 contribution retrieval result does not cover generic final-answer behavior.

## Confirmed fact boundary

The site owner confirmed the following public statement:

> All six projects publicly displayed on the website are portfolio projects that Zhao Shikuang participated in and completed. A team project must not be described as independently completed by Zhao Shikuang, and specific personal responsibilities may only be stated when supported by owner-confirmed evidence.

This statement is the authoritative boundary for generic portfolio-ownership answers.

## Goals

1. Answer generic portfolio questions such as “你做了什么” with the six displayed projects and concise descriptions.
2. Preserve the distinction between participation/completion, sole authorship, team output, and confirmed personal responsibility.
3. Distinguish questions about Zhao Shikuang’s work from questions about what the AI assistant can do.
4. Reject unsupported or private personal questions before irrelevant evidence reaches the model.
5. Improve cross-project comparison retrieval so each named project contributes intent-relevant evidence.
6. Fix the two known Atempo paraphrase misses without weakening project boundaries.
7. Add retrieval and answer-contract tests that make these behaviors regression-safe.

## Non-goals

- Do not introduce embeddings, a vector database, a reranker service, model fine-tuning, or a second model call.
- Do not change the visual design, chat layout, particle animation, project reader, navigation, or deployment topology.
- Do not infer unconfirmed detailed responsibilities from ordinary project pages.
- Do not claim that all six projects were independently completed.
- Do not turn the assistant into a general-purpose agent or personal-information service.

## Design principles

### Evidence before generation

The model must not be asked to repair a poor evidence packet. Query scope, retrieval eligibility, project balance, and privacy rejection are deterministic server-side responsibilities.

### Small corpus, explicit semantics

The corpus contains six projects, a profile, and a public resume. Explicit aliases, intents, provenance, and project-aware selection are more predictable and auditable than adding a semantic service at this scale.

### Fail closed for personal claims

Generic portfolio ownership may use the confirmed portfolio statement and project overviews. Specific personal responsibilities remain restricted to owner-confirmed evidence and public profile/resume statements.

## Query classification

Extend the existing query route with a scope that captures how evidence may be selected:

```ts
type QueryScope =
  | "assistant-capability"
  | "portfolio-overview"
  | "project"
  | "project-contribution"
  | "comparison"
  | "profile"
  | "unsupported-private";
```

The existing `projectIds`, `intents`, normalized query, and query terms remain in place. The new scope must be derived deterministically from the same generated index and a small set of explicit policy terms.

### Route ownership and data flow

The query must be classified exactly once per request. The retrieval boundary will return one server-owned outcome containing both the route and selected evidence:

```ts
interface RetrievalOutcome {
  readonly route: QueryRoute;
  readonly results: readonly SearchResult[];
}
```

The handler passes the same `route.scope` to the prompt builder that was used to filter and select evidence. The handler and retriever must not independently classify the same question, because two classifications could diverge and weaken the boundary.

The request order remains:

```text
validate request → apply rate limit → classify once → select evidence
  → return no-result without a model call, or build a scoped prompt → stream answer
```

### Scope precedence

Classification must use the following precedence:

1. `unsupported-private`
2. `assistant-capability`
3. `project-contribution`
4. `comparison`
5. `project`
6. `portfolio-overview`
7. `profile`

This prevents a password question containing “作品集” from entering normal portfolio retrieval and prevents “你能做什么” from being confused with “你做了什么”.

### Required interpretations

| Query | Scope | Required interpretation |
| --- | --- | --- |
| 你做了什么？ | `portfolio-overview` | Zhao Shikuang’s displayed portfolio work |
| 你有哪些作品？ | `portfolio-overview` | The six displayed projects |
| 你在 INKSeat 中做了什么？ | `project-contribution` | Only confirmed personal contribution to INKSeat |
| 这些项目都是你独立完成的吗？ | `portfolio-overview` | Explain participation/completion and reject a sole-authorship inference |
| 你能做什么？ | `assistant-capability` | The assistant’s supported question types and source navigation |
| 比较 INKSeat 和 UroSense 的系统架构 | `comparison` | Project-balanced architecture evidence |
| 你的工资是多少？ | `unsupported-private` | No retrieval results |
| UroSense 的医疗场景是什么？ | `project` | Normal project retrieval; “医疗” alone must not trigger rejection |

### Pronoun handling

Second-person references are contextual, not globally replaced:

- Work/history phrases such as “你做了什么”, “你做过哪些项目”, and “你的作品” refer to Zhao Shikuang.
- Capability phrases such as “你能做什么”, “你能回答什么”, and “你可以帮我什么” refer to the assistant.
- A named project plus contribution language takes precedence and becomes `project-contribution`.

## Knowledge changes

Add a public, deterministic portfolio-ownership fact to the profile knowledge source. It must state:

- the six displayed projects are projects Zhao Shikuang participated in and completed;
- team projects are not evidence of sole authorship;
- specific responsibility claims require owner-confirmed evidence.

Add profile aliases and deterministic routing phrases sufficient for generic portfolio formulations in Chinese and English, including the equivalents of:

- 你做了什么
- 你有哪些作品
- 你做过哪些项目
- what projects have you worked on
- what did you make

Add a public assistant-capability fact to the profile knowledge text. It limits the assistant to questions grounded in the public portfolio and resume and states that sources can navigate to the relevant project/page. It must not imply access to private, live, or external information.

No existing project claim may be rewritten to imply sole authorship. Existing per-project `owner_statement` claims remain the only project-specific personal-contribution evidence unless the owner separately confirms more detail.

## Retrieval eligibility

### Unsupported/private

`unsupported-private` returns an empty evidence packet before scoring.

The policy must require both a personal target and an unsupported/private topic where appropriate. It must cover at least:

- salary or private compensation;
- unpublished GPA or class ranking;
- romantic relationship status;
- personal medical history or allergies;
- passwords, credentials, tokens, or private administration access;
- exact home address or apartment number;
- live personal availability.

Project-domain questions must not be rejected merely because they contain words such as “medical”, “patient”, “health”, “address”, or “system”. Explicit project routing takes precedence unless the question clearly asks for private data or credentials.

### Assistant capability

`assistant-capability` may retrieve only the profile evidence containing the assistant-capability fact. It must not retrieve project contribution claims merely because the query contains a second-person pronoun.

### Portfolio overview

`portfolio-overview` may retrieve:

1. the portfolio-ownership fact;
2. a compact overview for each of the six displayed projects;
3. owner-confirmed contribution statements when the question also asks about participation.

The evidence packet must include all six projects for explicit “what projects” questions. The packet remains capped and must use one compact overview per project rather than arbitrary PDF excerpts.

### Project contribution

`project-contribution` keeps the current strict boundary:

- owner-confirmed project claims;
- public profile/resume evidence;
- no ordinary project excerpt may be treated as proof of personal responsibility;
- no candidate contribution may enter the published index or retrieval result.

### Normal project queries

Named-project questions remain fail-closed to the named project. Other projects cannot re-enter through lexical overlap.

### Cross-project comparison

Comparison selection must be project-aware:

1. score candidates normally;
2. partition eligible candidates by routed project;
3. select at least one highest-scoring intent-relevant claim from every named project;
4. fill remaining slots by score while enforcing source, intent, and page diversity;
5. preserve deterministic ordering and the overall maximum of eight results.

An intent-relevant candidate is one whose structured intents match the routed intent or whose exact question alias matches. If no such claim exists for one project, choose that project’s highest lexical candidate rather than silently omitting the project.

## Known paraphrase repair

The following held-out questions must retrieve the named claims:

- “Atempo的典型用户在什么情境下开始一次使用？” → `atempo.scenario`
- “How does Atempo translate respiratory motion into the phase gap between two arcs?” → `atempo.data-translation`

Prefer authored question aliases and intent aliases over special-case code for the full sentence. The rule must also support close paraphrases, not only exact equality.

## Grounded-answer contract

Update the grounded prompt so the model receives an explicit expression boundary:

- For `portfolio-overview`, describe the projects as work Zhao Shikuang participated in and completed.
- Do not say or imply sole authorship unless an owner-confirmed statement explicitly says so.
- For “what did you do” without a named project, summarize the portfolio projects rather than demanding detailed responsibility evidence.
- For a named project contribution question, give only confirmed participation or responsibility details and state the limit when details are unavailable.
- For comparison questions, synthesize by comparison dimension rather than narrating sources one by one.

The prompt must receive the classified scope as server-controlled metadata. The client-supplied history and retrieved evidence remain untrusted data and cannot alter the scope or rules.

## No-result behavior

Unsupported/private questions must not call the model. They use the existing no-result path and expose no irrelevant project sources.

The visitor-facing response may state that the public portfolio does not contain evidence for that question and invite the visitor to ask about projects, methods, capabilities, or the public resume. It must not confirm whether private data exists.

## Evaluation and tests

### Query-routing tests

Add Chinese and English cases for:

- generic portfolio overview;
- project-specific contribution;
- assistant capability;
- comparison;
- unsupported/private topics;
- medical project questions that must remain allowed;
- “你做了什么” versus “你能做什么”.

### Retriever tests

Assert that:

- generic work questions return the ownership fact and all six project overviews;
- project contribution remains owner-confirmed only;
- private questions return no results;
- comparison results contain intent-relevant evidence from every named project;
- candidate contributions remain rejected;
- unrelated projects cannot cross an explicit project boundary.

### Prompt and handler tests

Assert that:

- the server-controlled scope appears in the prompt contract;
- generic portfolio evidence is instructed to produce a project summary rather than a false “no information” answer;
- unsupported/private questions do not call the provider;
- sources remain server-assigned and citation-safe.

### Held-out regression

Preserve the existing 60-question bank as a regression suite after this tuning. It can no longer be described as unseen after being used for optimization.

Acceptance criteria:

- all 60 retrieval cases pass;
- the new generic portfolio and pronoun-disambiguation cases pass;
- existing structured retrieval, prompt, handler, privacy, citation, and SSE tests pass;
- generated knowledge verification passes;
- production build passes;
- no secret, private contact information, or unconfirmed contribution enters the generated index or browser bundle.

## Error handling and observability

- Query classification must be deterministic and side-effect free.
- Invalid generated knowledge still fails closed at runtime construction.
- Unsupported/private rejection records no user question text and exposes no sensitive classifier details.
- Existing metrics may count the outcome as `no_result`; no new personally identifying log field is added.
- Provider behavior, retry policy, rate limits, and SSE event order remain unchanged for answerable questions.

## Files expected to change during implementation

Likely production files:

- `src/chat/knowledge/manifest.ts`
- `src/chat/knowledge/authored/glossary.json`
- selected authored project dossier JSON files for question aliases only
- `src/chat/knowledge/generated-index.json` through the existing generator
- `src/chat/retrieval/query-routing.ts`
- `src/chat/retrieval/retriever.ts`
- `src/chat/retrieval/local-hybrid.ts` to keep the shared retrieval contract consistent
- `src/chat/retrieval/structured-hybrid.ts`
- `src/chat/server/prompt.ts`
- `src/chat/server/chat-handler.ts`

Likely tests:

- `src/chat/retrieval/query-routing.test.ts`
- `src/chat/retrieval/structured-hybrid.test.ts`
- `src/chat/retrieval/evaluation-cases.ts` or a dedicated regression bank
- `src/chat/server/prompt.test.ts`
- `src/chat/server/chat-handler.test.ts`
- the existing 60-question held-out evaluation files currently present in the worktree

Implementation must preserve unrelated dirty-worktree files and stage only explicitly reviewed files.
