# Session Rate-Limit Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace unreliable platform IP identity with a salted anonymous key derived from the validated browser `sessionId`, while preserving all existing rate limits and public behavior.

**Architecture:** `handleChat` already parses and validates `sessionId` before rate limiting. It will pass the domain-separated material `session:<sessionId>` into the existing HMAC-SHA256 key derivation function; platform runtimes will no longer inject IP readers. Upstash continues to receive only a 64-character digest, and the site-wide daily key remains unchanged.

**Tech Stack:** TypeScript, Web Crypto HMAC-SHA256, Vitest, Upstash Redis, Tencent SCF Web Functions

---

## File map

- Modify `src/chat/server/chat-handler.ts`: derive the visitor key from validated session material and remove the IP dependency.
- Modify `src/chat/server/chat-handler.test.ts`: prove deterministic session identity, domain separation, absence of raw session data, and no dependency on IP headers.
- Modify `src/chat/server/rate-limit.ts`: rename the generic derivation input and update its empty-input error.
- Modify `src/chat/server/rate-limit.test.ts`: document generic identity derivation instead of IP-specific behavior.
- Modify `src/chat/server/runtime.ts` and tests: stop accepting or injecting an IP reader.
- Modify `src/chat/server/vercel-runtime.ts` and tests: remove the Vercel IP helper.
- Modify `scf/runtime.ts` and tests: stop reading `x-scf-remote-addr`.
- Modify `scf/security.ts` and tests: remove the unused SCF remote-address parser while retaining strict origin parsing.
- Modify `package.json`, `package-lock.json`, and `src/production-delivery.test.ts`: remove the now-unused `@vercel/functions` production dependency.
- Regenerate `output/portfolio-chat-scf.zip`.

### Task 1: Derive anonymous visitor keys from validated sessions

**Files:**
- Modify: `src/chat/server/chat-handler.ts`
- Modify: `src/chat/server/chat-handler.test.ts`
- Modify: `src/chat/server/rate-limit.ts`
- Modify: `src/chat/server/rate-limit.test.ts`

- [ ] **Step 1: Write the failing handler identity test**

Import Node HMAC in `chat-handler.test.ts`:

```ts
import { createHmac } from "node:crypto";
```

Add a shared salt and a test that proves the request succeeds without IP headers and sends only the expected digest to Upstash:

```ts
const RATE_LIMIT_SALT =
  "a-safe-test-salt-that-is-at-least-32-bytes-long";

test("derives an anonymous visitor key from the validated session", async () => {
  const deps = dependencies();
  const response = await handleChat(request(), deps);
  await response.text();

  const consume = vi.mocked(deps.rateLimit.consume);
  expect(consume).toHaveBeenCalledOnce();
  const input = consume.mock.calls[0]?.[0];
  expect(input?.visitorKey).toBe(
    createHmac("sha256", RATE_LIMIT_SALT)
      .update("session:session_123")
      .digest("hex"),
  );
  expect(JSON.stringify(input)).not.toContain("session_123");
  expect(input?.visitorKey).toMatch(/^[a-f0-9]{64}$/);
});

test("keeps sessions stable and distinct without visitor IP headers", async () => {
  const keys: string[] = [];
  for (const sessionId of [
    "session_123",
    "session_123",
    "session_456",
  ]) {
    const deps = dependencies();
    const response = await handleChat(
      request({
        message: "Tell me about INKSeat",
        history: [],
        sessionId,
        locale: "en",
      }),
      deps,
    );
    await response.text();
    const input =
      vi.mocked(deps.rateLimit.consume).mock.calls[0]?.[0];
    keys.push(input!.visitorKey);
  }

  expect(keys[0]).toBe(keys[1]);
  expect(keys[0]).not.toBe(keys[2]);
});
```

Update the dependency helper options so they accept a salt override:

```ts
function dependencies(options: {
  results?: readonly KnowledgeChunk[];
  provider?: ChatProvider;
  rateResult?: { allowed: boolean; resetAt: number };
  metrics?: ChatMetric[];
  providerFailures?: string[];
  runtimeFailures?: ChatRuntimeFailure[];
  rateLimitSalt?: string;
  rateLimitError?: Error;
  retrievalError?: Error;
  runtimeFailureThrows?: boolean;
  allowedOrigins?: readonly string[];
} = {}): ChatHandlerDependencies {
```

Delete the IP test double from the returned dependencies:

```ts
ipAddress: () => options.ipAddress ?? "203.0.113.8",
```

Replace its fixed salt assignment with:

```ts
rateLimitSalt:
  options.rateLimitSalt ?? RATE_LIMIT_SALT,
```

Change the existing diagnostic table entry:

```ts
[
  "visitor_identity",
  { rateLimitSalt: "short" },
],
```

- [ ] **Step 2: Run the handler test and verify RED**

Run:

```powershell
npm.cmd test -- src/chat/server/chat-handler.test.ts
```

Expected: the new digest assertion fails because the current implementation still hashes `203.0.113.8`.

- [ ] **Step 3: Implement the session identity material**

In `handleChat`, replace IP extraction with the validated, domain-separated session:

```ts
runtimeStage = "visitor_identity";
const visitorKey = await deriveVisitorKey(
  `session:${parsed.sessionId}`,
  dependencies.rateLimitSalt,
);
runtimeStage = "rate_limit";
```

Remove this property from `ChatHandlerDependencies`:

```ts
readonly ipAddress: (request: Request) => string | undefined;
```

Rename the generic input in `rate-limit.ts`:

```ts
export async function deriveVisitorKey(
  identityMaterial: string,
  rateLimitSalt: string,
): Promise<string> {
  if (identityMaterial.length === 0) {
    throw new Error("visitor identity is required");
  }
  const encoder = new TextEncoder();
  const saltBytes = encoder.encode(rateLimitSalt);
  if (saltBytes.byteLength < MINIMUM_SALT_BYTES) {
    throw new Error(
      "RATE_LIMIT_SALT must contain at least 32 UTF-8 bytes",
    );
  }

  const key = await crypto.subtle.importKey(
    "raw",
    saltBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(identityMaterial),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
```

Update the rate-limit unit test:

```ts
test("uses HMAC-SHA256 and never returns the raw identity", async () => {
  const identity = "session:session_123";
  const salt = "a-high-entropy-test-salt-32-bytes";

  const key = await deriveVisitorKey(identity, salt);

  expect(key).toBe(
    createHmac("sha256", salt).update(identity).digest("hex"),
  );
  expect(key).toMatch(/^[a-f0-9]{64}$/);
  expect(key).not.toContain("session_123");
});
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- `
  src/chat/server/chat-handler.test.ts `
  src/chat/server/rate-limit.test.ts
```

Expected: both test files pass, including the session digest and privacy assertions.

- [ ] **Step 5: Commit the identity change**

```powershell
git add -- `
  src/chat/server/chat-handler.ts `
  src/chat/server/chat-handler.test.ts `
  src/chat/server/rate-limit.ts `
  src/chat/server/rate-limit.test.ts
git commit -m "fix: derive visitor limits from anonymous sessions"
```

### Task 2: Remove obsolete platform IP adapters

**Files:**
- Modify: `src/chat/server/runtime.ts`
- Modify: `src/chat/server/runtime.test.ts`
- Modify: `src/chat/server/vercel-runtime.ts`
- Modify: `src/chat/server/vercel-runtime.test.ts`
- Modify: `scf/runtime.ts`
- Modify: `scf/runtime.test.ts`
- Modify: `scf/security.ts`
- Modify: `scf/security.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/production-delivery.test.ts`

- [ ] **Step 1: Write failing adapter contract tests**

Change the Vercel runtime test to require environment-only configuration:

```ts
const mocks = vi.hoisted(() => ({
  createRuntime: vi.fn((options: unknown) => ({
    enabled: true,
    handle: vi.fn(),
    options,
  })),
}));

vi.mock("./runtime.js", () => ({
  createRuntime: mocks.createRuntime,
}));

test("passes only process environment to the shared runtime", async () => {
  const { createVercelRuntime } =
    await import("./vercel-runtime");
  const runtime = createVercelRuntime();

  expect(runtime.enabled).toBe(true);
  expect(mocks.createRuntime).toHaveBeenCalledWith({
    env: process.env,
  });
});
```

In `scf/runtime.test.ts`, remove `ipAddress` from `RuntimeOptionsCapture` and replace the IP assertion with:

```ts
expect(options).not.toHaveProperty("ipAddress");
```

In `production-delivery.test.ts`, require only the remaining server dependency:

```ts
expect(packageJson.dependencies).toEqual({
  "@upstash/redis": "1.38.0",
});
```

- [ ] **Step 2: Run adapter tests and verify RED**

Run:

```powershell
npm.cmd test -- `
  src/chat/server/vercel-runtime.test.ts `
  scf/runtime.test.ts `
  src/production-delivery.test.ts
```

Expected: tests fail because the runtimes still inject IP readers and `@vercel/functions` is still declared.

- [ ] **Step 3: Remove runtime and SCF IP injection**

Delete this option from `RuntimeOptions`:

```ts
readonly ipAddress?: (request: Request) => string | undefined;
```

Delete this dependency assignment from `createRuntime`:

```ts
ipAddress: options.ipAddress ?? (() => undefined),
```

Replace `vercel-runtime.ts` with:

```ts
import { createRuntime } from "./runtime.js";

export function createVercelRuntime() {
  return createRuntime({ env: process.env });
}
```

In `scf/runtime.ts`, import only `parseAllowedOrigins`:

```ts
import { parseAllowedOrigins } from "./security.js";
```

Delete the SCF `ipAddress` option:

```ts
ipAddress: (request) =>
  scfRemoteAddress(request.headers),
```

- [ ] **Step 4: Remove the unused SCF address parser**

Replace `scf/security.ts` with the origin parser only:

```ts
export function parseAllowedOrigins(
  value: string | undefined,
): readonly string[] | undefined {
  if (!value) return undefined;
  const origins = value.split(",").map((item) => item.trim());
  if (
    origins.length === 0 ||
    origins.some((item) => item.length === 0)
  ) {
    return undefined;
  }

  const parsed: string[] = [];
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (
        url.protocol !== "https:" ||
        url.origin !== origin ||
        url.username !== "" ||
        url.password !== "" ||
        origin.includes("*")
      ) {
        return undefined;
      }
      parsed.push(origin);
    } catch {
      return undefined;
    }
  }
  return [...new Set(parsed)];
}
```

Delete the entire `describe("scfRemoteAddress", ...)` block from `scf/security.test.ts`.

- [ ] **Step 5: Remove the unused Vercel dependency**

Run:

```powershell
npm.cmd uninstall @vercel/functions `
  --package-lock-only `
  --ignore-scripts
```

Expected: `package.json` and `package-lock.json` no longer contain `@vercel/functions`, while `@upstash/redis` remains pinned to `1.38.0`.

- [ ] **Step 6: Run adapter, runtime, and TypeScript checks**

Run:

```powershell
npm.cmd test -- `
  src/chat/server/runtime.test.ts `
  src/chat/server/vercel-runtime.test.ts `
  scf/runtime.test.ts `
  scf/security.test.ts `
  src/production-delivery.test.ts
npx.cmd tsc --noEmit
```

Expected: every focused test passes and TypeScript exits with code 0.

- [ ] **Step 7: Commit adapter cleanup**

```powershell
git add -- `
  src/chat/server/runtime.ts `
  src/chat/server/runtime.test.ts `
  src/chat/server/vercel-runtime.ts `
  src/chat/server/vercel-runtime.test.ts `
  scf/runtime.ts `
  scf/runtime.test.ts `
  scf/security.ts `
  scf/security.test.ts `
  package.json `
  package-lock.json `
  src/production-delivery.test.ts
git commit -m "refactor: remove platform IP identity adapters"
```

### Task 3: Full verification and Tencent package handoff

**Files:**
- Regenerate: `.scf-build/index.mjs`
- Regenerate: `output/portfolio-chat-scf.zip`

- [ ] **Step 1: Run all automated tests**

Run:

```powershell
npm.cmd test
```

Expected: all test files and tests pass with zero failures.

- [ ] **Step 2: Run the production build and asset verification**

Run:

```powershell
npm.cmd run build
npm.cmd run knowledge:verify
npm.cmd run portfolio-pages:verify
```

Expected: TypeScript, Vite, client secret boundary, 8 knowledge sources/139 chunks, and 6 projects/135 pages verify.

- [ ] **Step 3: Rebuild and verify the SCF package**

Run:

```powershell
npm.cmd run scf:build
npm.cmd run scf:verify
```

Expected: the package contains only executable `scf_bootstrap` and bundled `index.mjs`.

- [ ] **Step 4: Record integrity and repository state**

Run:

```powershell
Get-Item output\portfolio-chat-scf.zip |
  Select-Object FullName,Length,LastWriteTime
Get-FileHash output\portfolio-chat-scf.zip -Algorithm SHA256
git status --short
```

Expected: a non-empty ZIP with a SHA-256 digest and a clean worktree; generated package paths remain ignored.

- [ ] **Step 5: Push the verified branch**

Run:

```powershell
git push origin feature/portfolio-ai-chat-clean
```

Expected: the GitHub default branch advances to the locally verified HEAD.

### Task 4: Production acceptance

**Files:**
- Deploy: `output/portfolio-chat-scf.zip`

- [ ] **Step 1: Cover-upload the verified ZIP**

In Tencent SCF, open `portfolio-ai-chat` → Function Management → Function Code, select local ZIP upload, upload `output/portfolio-chat-scf.zip`, save, and wait for status `正常`. Keep all environment variables and the existing Function URL unchanged.

- [ ] **Step 2: Trigger the public API**

Create a temporary JSON probe containing:

```json
{"message":"Who is Zhao Shikuang?","history":[],"sessionId":"codex_session_identity_probe","locale":"en"}
```

Send it to the existing `/chat` Function URL with the production Cloudflare origin and delete the temporary file immediately afterward.

- [ ] **Step 3: Classify the next boundary**

Expected outcomes:

- HTTP 200 plus `text/event-stream`: verify `start`, `delta`, `sources`, and `done`.
- `portfolio_chat_runtime_failure` with `rate_limit`: verify Upstash URL/token connectivity without exposing values.
- `portfolio_chat_upstream_failure`: use its fixed category to repair TokenHub configuration.
- No `visitor_identity` event is acceptable after this deployment.

- [ ] **Step 4: Verify the homepage**

Set Cloudflare Pages `VITE_CHAT_API_URL` to the existing Tencent `/chat` URL if it is not already present, redeploy Pages, and ask one recommended question from the homepage. Acceptance requires a visible answer and evidence sources without overlap with the page marker.
