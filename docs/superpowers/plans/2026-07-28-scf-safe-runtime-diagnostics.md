# SCF Safe Runtime Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add privacy-preserving stage diagnostics for pre-SSE Tencent SCF chat failures, then rebuild a verified deployment ZIP.

**Architecture:** The shared chat handler tracks a small enum describing the current pre-SSE stage and invokes an injected failure sink only for unexpected exceptions. The shared runtime supplies a no-op sink by default, while the Tencent SCF adapter serializes a fixed-field JSON event containing only the stage and platform request ID.

**Tech Stack:** TypeScript, Node.js 20 Web APIs, Vitest, esbuild, Tencent SCF Web Functions

---

## File map

- Modify `src/chat/server/chat-handler.ts`: define diagnostic types, safely invoke the sink, and track the failing pre-SSE stage.
- Modify `src/chat/server/chat-handler.test.ts`: prove stage classification, validation exclusion, stable public responses, and sink isolation.
- Modify `src/chat/server/runtime.ts`: expose a default no-op runtime failure sink.
- Modify `scf/runtime.ts`: emit fixed-field `portfolio_chat_runtime_failure` JSON.
- Modify `scf/runtime.test.ts`: prove the SCF event contains only approved fields.
- Regenerate `output/portfolio-chat-scf.zip`: deployable Web Function bundle.

### Task 1: Shared pre-SSE stage diagnostics

**Files:**
- Modify: `src/chat/server/chat-handler.ts`
- Test: `src/chat/server/chat-handler.test.ts`

- [ ] **Step 1: Extend the test dependency helper**

Add imports and options that allow each pre-SSE boundary to fail independently:

```ts
import type {
  ChatHandlerDependencies,
  ChatMetric,
  ChatRuntimeFailure,
} from "./chat-handler";

function dependencies(options: {
  results?: readonly KnowledgeChunk[];
  provider?: ChatProvider;
  rateResult?: { allowed: boolean; resetAt: number };
  metrics?: ChatMetric[];
  providerFailures?: string[];
  runtimeFailures?: ChatRuntimeFailure[];
  ipAddress?: string;
  rateLimitError?: Error;
  retrievalError?: Error;
  runtimeFailureThrows?: boolean;
  allowedOrigins?: readonly string[];
} = {}): ChatHandlerDependencies {
  const retriever: Retriever = {
    search: vi.fn(async () => {
      if (options.retrievalError) throw options.retrievalError;
      return (options.results ?? [chunk("inkseat", 8)]).map(
        (item, index) => ({ chunk: item, score: 20 - index }),
      );
    }),
  };
  const rateLimit: RateLimitStore = {
    consume: vi.fn(async () => {
      if (options.rateLimitError) throw options.rateLimitError;
      return options.rateResult ?? {
        allowed: true,
        resetAt: fixedNow + 3_000,
      };
    }),
  };
  return {
    retriever,
    provider:
      options.provider ??
      providerFromAttempts([[
        { type: "delta", text: "Grounded answer [[S1]]" },
        { type: "usage", inputTokens: 12, outputTokens: 4 },
        { type: "done" },
      ]]),
    rateLimit,
    rateLimitSalt:
      "a-safe-test-salt-that-is-at-least-32-bytes-long",
    profileFacts: ["赵实旷是同济大学工业设计学生。"],
    ipAddress: () => options.ipAddress ?? "203.0.113.8",
    clock: () => fixedNow,
    requestId: () => "request_12345678",
    metrics: {
      record(metric) {
        options.metrics?.push(metric);
      },
    },
    providerFailure(category) {
      options.providerFailures?.push(category);
    },
    runtimeFailure(failure) {
      if (options.runtimeFailureThrows) {
        throw new Error("diagnostic sink failed");
      }
      options.runtimeFailures?.push(failure);
    },
    allowedOrigins: options.allowedOrigins,
  };
}
```

- [ ] **Step 2: Write failing stage-classification tests**

Append focused tests:

```ts
test.each([
  [
    "visitor_identity",
    { ipAddress: "" },
  ],
  [
    "rate_limit",
    { rateLimitError: new Error("redis unavailable") },
  ],
  [
    "retrieval",
    { retrievalError: new Error("retriever unavailable") },
  ],
] as const)(
  "records a safe %s runtime failure",
  async (stage, options) => {
    const runtimeFailures: ChatRuntimeFailure[] = [];
    const response = await handleChat(
      request(undefined, {
        headers: {
          "x-scf-request-id":
            "16f2b048-89dc-11f1-9f14-525400ea158b",
        },
      }),
      dependencies({ ...options, runtimeFailures }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { code: "internal_error", retryable: true },
    });
    expect(runtimeFailures).toEqual([{
      stage,
      requestId: "16f2b048-89dc-11f1-9f14-525400ea158b",
    }]);
  },
);

test("does not classify request validation failures as runtime failures", async () => {
  const runtimeFailures: ChatRuntimeFailure[] = [];
  const response = await handleChat(
    request({ message: "" }),
    dependencies({ runtimeFailures }),
  );

  expect(response.status).toBe(400);
  expect(runtimeFailures).toEqual([]);
});

test("a failing runtime diagnostic sink cannot replace the public error", async () => {
  const response = await handleChat(
    request(),
    dependencies({
      rateLimitError: new Error("redis unavailable"),
      runtimeFailureThrows: true,
    }),
  );

  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({
    error: { code: "internal_error", retryable: true },
  });
});
```

- [ ] **Step 3: Run the tests and verify RED**

Run:

```powershell
npm.cmd test -- src/chat/server/chat-handler.test.ts
```

Expected: TypeScript/Vitest fails because `ChatRuntimeFailure` and `runtimeFailure` do not exist.

- [ ] **Step 4: Implement the minimal shared diagnostic contract**

Add the types and dependency:

```ts
export type ChatRuntimeFailureStage =
  | "visitor_identity"
  | "rate_limit"
  | "retrieval";

export interface ChatRuntimeFailure {
  readonly stage: ChatRuntimeFailureStage;
  readonly requestId?: string;
}

export interface ChatHandlerDependencies {
  readonly retriever: Retriever;
  readonly provider: ChatProvider;
  readonly rateLimit: RateLimitStore;
  readonly rateLimitSalt: string;
  readonly profileFacts: readonly string[];
  readonly allowedOrigins?: readonly string[];
  readonly ipAddress: (
    request: Request,
  ) => string | undefined;
  readonly clock: () => number;
  readonly requestId: () => string;
  metrics: ChatMetricsSink;
  readonly providerFailure: (
    category: DeepSeekProviderErrorCategory | "unknown",
  ) => void;
  readonly runtimeFailure: (
    failure: ChatRuntimeFailure,
  ) => void;
}

function recordRuntimeFailure(
  sink: ChatHandlerDependencies["runtimeFailure"],
  failure: ChatRuntimeFailure,
): void {
  try {
    sink(failure);
  } catch {
    // Diagnostics must never change the public assistant outcome.
  }
}
```

Track the stage inside `handleChat`:

```ts
let runtimeStage: ChatRuntimeFailureStage | undefined;
try {
  const declaredLength = contentLength(request);
  validateChatRequestContext({
    requestUrl: request.url,
    origin: request.headers.get("origin"),
    allowedOrigins: dependencies.allowedOrigins,
    contentType: request.headers.get("content-type"),
    contentLength: declaredLength,
    bodyBytes: 0,
  });
  const body = await readBody(request);
  validateChatRequestContext({
    requestUrl: request.url,
    origin: request.headers.get("origin"),
    allowedOrigins: dependencies.allowedOrigins,
    contentType: request.headers.get("content-type"),
    contentLength: declaredLength,
    bodyBytes: body.bodyBytes,
  });
  const parsed = parseChatBody(parseJson(body.text));

  runtimeStage = "visitor_identity";
  const rawIp = dependencies.ipAddress(request);
  if (typeof rawIp !== "string" || rawIp.length === 0) {
    throw new Error("visitor identity unavailable");
  }
  const visitorKey = await deriveVisitorKey(
    rawIp,
    dependencies.rateLimitSalt,
  );

  runtimeStage = "rate_limit";
  const rate = await dependencies.rateLimit.consume({
    visitorKey,
    now: startedAt,
    requestId: dependencies.requestId(),
  });

  if (!rate.allowed) {
    recordMetric(dependencies.metrics, {
      status: "rate_limited",
      latencyMs: elapsed(dependencies.clock, startedAt),
      ...EMPTY_METRIC_COUNTS,
    });
    return jsonError("rate_limited", 429, true, {
      "retry-after": String(Math.max(
        1,
        Math.ceil((rate.resetAt - startedAt) / 1_000),
      )),
    });
  }

  runtimeStage = "retrieval";
  const results = await dependencies.retriever.search(
    parsed.message,
    { locale: parsed.locale, limit: 8 },
  );
  runtimeStage = undefined;
  return sseResponse(
    createAnswerStream({
      locale: parsed.locale,
      results,
      visitorKey,
      message: parsed.message,
      history: parsed.history,
      requestSignal: request.signal,
      dependencies,
      startedAt,
    }),
  );
} catch (error) {
  const validation =
    error instanceof ChatValidationError ? error : undefined;
  if (!validation && runtimeStage) {
    const platformRequestId =
      request.headers.get("x-scf-request-id") ?? undefined;
    recordRuntimeFailure(dependencies.runtimeFailure, {
      stage: runtimeStage,
      ...(platformRequestId
        ? { requestId: platformRequestId }
        : {}),
    });
  }
  cancelStreamBestEffort(request.body);
  recordMetric(dependencies.metrics, {
    status: validation ? "rejected" : "failure",
    latencyMs: elapsed(dependencies.clock, startedAt),
    ...EMPTY_METRIC_COUNTS,
  });
  return validation
    ? jsonError(validation.code, validation.status)
    : jsonError("internal_error", 500, true);
}
```

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- src/chat/server/chat-handler.test.ts
```

Expected: all `chat-handler.test.ts` tests pass.

- [ ] **Step 6: Commit the shared diagnostic contract**

```powershell
git add -- src/chat/server/chat-handler.ts src/chat/server/chat-handler.test.ts
git commit -m "feat: classify pre-stream chat failures"
```

### Task 2: Runtime defaults and Tencent SCF structured logging

**Files:**
- Modify: `src/chat/server/runtime.ts`
- Modify: `scf/runtime.ts`
- Test: `scf/runtime.test.ts`

- [ ] **Step 1: Write the failing SCF fixed-field log test**

Extend `RuntimeOptionsCapture`:

```ts
import type {
  ChatRuntimeFailure,
} from "../src/chat/server/chat-handler";

type RuntimeOptionsCapture = {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly allowedOrigins?: readonly string[];
  readonly ipAddress?: (
    request: Request,
  ) => string | undefined;
  readonly providerFailure?: (category: string) => void;
  readonly runtimeFailure?: (
    failure: ChatRuntimeFailure,
  ) => void;
};
```

Add the test:

```ts
test("logs runtime failures with fixed non-sensitive fields only", () => {
  createScfRuntime(environment);
  const options =
    mocks.createRuntime.mock.calls[0]?.[0] as RuntimeOptionsCapture;
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    options.runtimeFailure?.({
      stage: "rate_limit",
      requestId: "16f2b048-89dc-11f1-9f14-525400ea158b",
    });
    expect(warn).toHaveBeenCalledWith(JSON.stringify({
      event: "portfolio_chat_runtime_failure",
      stage: "rate_limit",
      requestId: "16f2b048-89dc-11f1-9f14-525400ea158b",
    }));
    const logged = warn.mock.calls.flat().join("\n");
    expect(logged).not.toContain("redis-token");
    expect(logged).not.toContain("tokenhub-test-key");
    expect(logged).not.toContain("203.0.113.8");
  } finally {
    warn.mockRestore();
  }
});
```

- [ ] **Step 2: Run the SCF runtime test and verify RED**

Run:

```powershell
npm.cmd test -- scf/runtime.test.ts
```

Expected: FAIL because `runtimeFailure` is not passed to `createRuntime`.

- [ ] **Step 3: Add the default no-op sink**

In `src/chat/server/runtime.ts`, add:

```ts
const noopRuntimeFailure:
  ChatHandlerDependencies["runtimeFailure"] = () => {};
```

Then add this field to the constructed dependencies:

```ts
runtimeFailure:
  options.runtimeFailure ?? noopRuntimeFailure,
```

Extend `RuntimeOptions` with:

```ts
readonly runtimeFailure?:
  ChatHandlerDependencies["runtimeFailure"];
```

- [ ] **Step 4: Implement the SCF logger**

Pass this callback in `scf/runtime.ts`:

```ts
runtimeFailure: ({ stage, requestId }) => {
  console.warn(JSON.stringify({
    event: "portfolio_chat_runtime_failure",
    stage,
    ...(requestId ? { requestId } : {}),
  }));
},
```

The callback must not accept or serialize any other fields.

- [ ] **Step 5: Run focused and TypeScript checks**

Run:

```powershell
npm.cmd test -- scf/runtime.test.ts src/chat/server/runtime.test.ts
npx.cmd tsc --noEmit
```

Expected: all focused tests pass and TypeScript exits with code 0.

- [ ] **Step 6: Commit the SCF logger**

```powershell
git add -- src/chat/server/runtime.ts scf/runtime.ts scf/runtime.test.ts
git commit -m "feat: log safe SCF runtime failure stages"
```

### Task 3: Full verification and SCF package regeneration

**Files:**
- Regenerate: `.scf-build/index.mjs`
- Regenerate: `output/portfolio-chat-scf.zip`

- [ ] **Step 1: Run the complete automated test suite**

Run:

```powershell
npm.cmd test
```

Expected: every test file and test passes with no unhandled errors.

- [ ] **Step 2: Run production and boundary checks**

Run:

```powershell
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run check:client-secrets
npm.cmd run verify:knowledge
npm.cmd run verify:portfolio
```

Expected: TypeScript and Vite succeed; the client bundle contains no server secrets; knowledge and portfolio manifests verify.

- [ ] **Step 3: Rebuild and verify the Tencent package**

Run:

```powershell
npm.cmd run build:scf
npm.cmd run verify:scf-package
```

Expected: `output/portfolio-chat-scf.zip` contains only executable `scf_bootstrap` and bundled `index.mjs`, and the verifier exits with code 0.

- [ ] **Step 4: Record package integrity**

Run:

```powershell
Get-Item output\portfolio-chat-scf.zip |
  Select-Object FullName,Length,LastWriteTime
Get-FileHash output\portfolio-chat-scf.zip -Algorithm SHA256
```

Expected: a non-empty ZIP and a SHA-256 value suitable for deployment handoff.

- [ ] **Step 5: Confirm generated deployment artifacts remain ignored**

Run:

```powershell
git status --short
git check-ignore -v `
  .scf-build/index.mjs `
  output/portfolio-chat-scf.zip
```

Expected: both generated paths match the repository `.gitignore`, and `git status --short` is clean after the two source commits.

### Task 4: Tencent deployment and diagnostic acceptance

**Files:**
- Deploy: `output/portfolio-chat-scf.zip`

- [ ] **Step 1: Upload the verified ZIP**

In Tencent SCF, open `portfolio-ai-chat` → Function Management → Function Code, choose local ZIP upload, select `output/portfolio-chat-scf.zip`, and save. Keep all environment variables and the existing Function URL unchanged.

- [ ] **Step 2: Trigger one production request**

Run from the workspace:

```powershell
curl.exe -N -i --max-time 60 `
  -X POST "https://1458594587-86tdgscaev.ap-guangzhou.tencentscf.com/chat" `
  -H "Origin: https://portfolio-ai-chat-clean.pages.dev" `
  -H "Accept: text/event-stream" `
  -H "Content-Type: application/json" `
  --data-binary "@.tmp-chat-probe.json"
```

The probe file contains only a public test question and is deleted immediately after the request.

- [ ] **Step 3: Read the safe diagnostic event**

In Tencent SCF → Log Query, search:

```text
portfolio_chat_runtime_failure
```

Expected: one JSON line whose `stage` is `visitor_identity`, `rate_limit`, or `retrieval`, with no IP, token, question, or exception text.

- [ ] **Step 4: Record the diagnosed boundary**

Record exactly one diagnosed boundary from the deployed event:

- `visitor_identity`: Tencent request identity parsing.
- `rate_limit`: Upstash connectivity or credentials.
- `retrieval`: bundled local knowledge-index execution.

The diagnostic feature is accepted when the event identifies one boundary without logging any prohibited field. Any root-cause code change receives its own failing regression test before implementation; after that bounded fix, final production acceptance still requires HTTP 200 with `text/event-stream` and `start`, `delta`, `sources`, and `done`.
