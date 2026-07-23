# Cloudflare Chat Function Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the existing portfolio AI assistant from Cloudflare Pages at the same-origin `/api/chat` route without exposing secrets or breaking the Vercel adapter.

**Architecture:** Remove Vercel and Node-only dependencies from the shared chat runtime, then add thin platform adapters for Vercel and Cloudflare. Cloudflare Pages reads bindings from `context.env`, trusts only `CF-Connecting-IP`, and routes only `/api/*` through Functions.

**Tech Stack:** TypeScript, Web Platform APIs, Cloudflare Pages Functions, Vercel Functions, DeepSeek, Upstash Redis, Vitest, Vite

---

### Task 1: Make the shared runtime platform-neutral

**Files:**
- Modify: `src/chat/server/runtime.test.ts`
- Modify: `src/chat/server/runtime.ts`
- Test: `src/chat/server/runtime.test.ts`

- [ ] **Step 1: Add failing portability tests**

Add:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("keeps platform adapters out of the shared runtime", () => {
  const source = readFileSync(resolve(process.cwd(), "src/chat/server/runtime.ts"), "utf8");

  expect(source).not.toContain('"node:crypto"');
  expect(source).not.toContain('"@vercel/functions/headers"');
  expect(source).not.toContain("process.env");
  expect(source).not.toContain("Buffer.byteLength");
});

test("uses injected Web Platform defaults", () => {
  const captures: Parameters<typeof factories>[0] = {};
  const runtime = createRuntime({
    env: validEnv,
    factories: factories(captures),
  });

  expect(runtime.enabled).toBe(true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
& 'D:\APPS\claude\npm.cmd' test -- --run src/chat/server/runtime.test.ts
```

Expected: FAIL because `runtime.ts` imports `node:crypto`, imports the Vercel header helper, reads `process.env`, and uses `Buffer.byteLength`.

- [ ] **Step 3: Implement Web-standard defaults**

Change the shared options and dependency defaults to:

```ts
export interface RuntimeOptions {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly factories?: RuntimeFactories;
  readonly ipAddress?: (request: Request) => string | undefined;
  readonly clock?: () => number;
  readonly requestId?: () => string;
  readonly metrics?: ChatMetricsSink;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function createRuntime(options: RuntimeOptions): ChatRuntime {
  const config = parseConfig(options.env);
  if (!config) return disabledRuntime();

  try {
    const factories = options.factories ?? defaultFactories();
    const dependencies: ChatHandlerDependencies = {
      retriever: factories.createRetriever(generatedIndex),
      provider: factories.createProvider({
        apiKey: config.apiKey,
        model: config.model,
        timeoutMs: config.timeoutMs,
        maxTokens: config.maxTokens,
      }),
      rateLimit: factories.createRateLimitStore({
        url: config.kvUrl,
        token: config.kvToken,
        cooldownMs: config.cooldownMs,
        minuteLimit: config.visitorMinuteLimit,
        visitorDayLimit: config.visitorDayLimit,
        siteDayLimit: config.siteDayLimit,
      }),
      rateLimitSalt: config.salt,
      profileFacts: structuredProfileFacts(generatedIndex),
      ipAddress: options.ipAddress ?? (() => undefined),
      clock: options.clock ?? Date.now,
      requestId: options.requestId ?? (() => globalThis.crypto.randomUUID()),
      metrics: options.metrics ?? noopMetrics,
    };
    return {
      enabled: true,
      handle: (request) => handleChat(request, dependencies),
    };
  } catch {
    return disabledRuntime();
  }
}
```

Replace the salt validation call with:

```ts
utf8ByteLength(salt) < 32
```

Remove the `node:crypto` and `@vercel/functions/headers` imports.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
& 'D:\APPS\claude\npm.cmd' test -- --run src/chat/server/runtime.test.ts
```

Expected: all runtime tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/chat/server/runtime.ts src/chat/server/runtime.test.ts
git commit -m "refactor: make chat runtime platform neutral"
```

### Task 2: Move Vercel behavior into its adapter

**Files:**
- Create: `src/chat/server/vercel-runtime.ts`
- Create: `src/chat/server/vercel-runtime.test.ts`
- Modify: `api/chat.ts`
- Modify: `src/production-delivery.test.ts`
- Test: `src/chat/server/vercel-runtime.test.ts`
- Test: `src/production-delivery.test.ts`

- [ ] **Step 1: Add failing Vercel adapter tests**

Create:

```ts
// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

const createRuntime = vi.fn((options: unknown) => ({ enabled: true, handle: vi.fn(), options }));
const ipAddress = vi.fn(() => "203.0.113.8");

vi.mock("./runtime.js", () => ({ createRuntime }));
vi.mock("@vercel/functions/headers", () => ({ ipAddress }));

describe("createVercelRuntime", () => {
  test("passes process environment and Vercel IP extraction to the shared runtime", async () => {
    const { createVercelRuntime } = await import("./vercel-runtime");
    const runtime = createVercelRuntime();
    const options = createRuntime.mock.calls[0]?.[0] as {
      env: NodeJS.ProcessEnv;
      ipAddress(request: Request): string | undefined;
    };
    const request = new Request("https://portfolio.test/api/chat");

    expect(runtime.enabled).toBe(true);
    expect(options.env).toBe(process.env);
    expect(options.ipAddress(request)).toBe("203.0.113.8");
    expect(ipAddress).toHaveBeenCalledWith(request);
  });
});
```

Update the production entry test to mock `createVercelRuntime` rather than `createRuntime`.

- [ ] **Step 2: Run tests and verify RED**

```powershell
& 'D:\APPS\claude\npm.cmd' test -- --run src/chat/server/vercel-runtime.test.ts src/production-delivery.test.ts
```

Expected: FAIL because `vercel-runtime.ts` does not exist.

- [ ] **Step 3: Implement the Vercel adapter**

Create:

```ts
import { ipAddress as vercelIpAddress } from "@vercel/functions/headers";

import { createRuntime } from "./runtime.js";

export function createVercelRuntime() {
  return createRuntime({
    env: process.env,
    ipAddress: (request) => vercelIpAddress(request),
  });
}
```

Change `api/chat.ts` to:

```ts
import { createVercelRuntime } from "../src/chat/server/vercel-runtime.js";

let runtime: ReturnType<typeof createVercelRuntime> | undefined;

export default {
  fetch(request: Request): Promise<Response> {
    runtime ??= createVercelRuntime();
    return runtime.handle(request);
  },
};
```

- [ ] **Step 4: Run tests and verify GREEN**

```powershell
& 'D:\APPS\claude\npm.cmd' test -- --run src/chat/server/vercel-runtime.test.ts src/production-delivery.test.ts
```

Expected: both files pass and the Node ESM graph remains valid.

- [ ] **Step 5: Commit**

```powershell
git add api/chat.ts src/chat/server/vercel-runtime.ts src/chat/server/vercel-runtime.test.ts src/production-delivery.test.ts
git commit -m "refactor: isolate Vercel chat adapter"
```

### Task 3: Add the Cloudflare Pages Function

**Files:**
- Create: `functions/api/chat.ts`
- Create: `functions/api/chat.test.ts`
- Modify: `tsconfig.json`
- Test: `functions/api/chat.test.ts`

- [ ] **Step 1: Add failing Cloudflare entry tests**

Create a test that mocks `createRuntime`, then verifies method handling and bindings:

```ts
// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

const handle = vi.fn(async () => new Response("stream", {
  headers: { "content-type": "text/event-stream" },
}));
const createRuntime = vi.fn(() => ({ enabled: true, handle }));

vi.mock("../../src/chat/server/runtime.js", () => ({ createRuntime }));

const env = {
  CHAT_ENABLED: "true",
  DEEPSEEK_API_KEY: "test-key",
  RATE_LIMIT_KV_URL: "https://example.upstash.io",
  RATE_LIMIT_KV_TOKEN: "test-token",
  RATE_LIMIT_SALT: "a-runtime-salt-that-is-at-least-thirty-two-bytes",
};

beforeEach(() => {
  vi.resetModules();
  createRuntime.mockClear();
  handle.mockClear();
});

test("rejects non-POST requests without falling back to HTML", async () => {
  const { onRequest } = await import("./chat");
  const response = await onRequest({
    request: new Request("https://portfolio.test/api/chat"),
    env,
  });

  expect(response.status).toBe(405);
  expect(response.headers.get("allow")).toBe("POST");
  expect(response.headers.get("content-type")).toContain("application/json");
});

test("passes Cloudflare bindings and trusted visitor IP to the runtime", async () => {
  const { onRequest } = await import("./chat");
  const request = new Request("https://portfolio.test/api/chat", {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.10" },
  });
  const response = await onRequest({ request, env });
  const options = createRuntime.mock.calls[0]?.[0] as {
    env: typeof env;
    ipAddress(request: Request): string | undefined;
  };

  expect(response.headers.get("content-type")).toBe("text/event-stream");
  expect(options.env).toBe(env);
  expect(options.ipAddress(request)).toBe("203.0.113.10");
  expect(handle).toHaveBeenCalledWith(request);
});

test("reuses one runtime within a Cloudflare isolate", async () => {
  const { onRequest } = await import("./chat");
  const request = new Request("https://portfolio.test/api/chat", {
    method: "POST",
  });

  await onRequest({ request, env });
  await onRequest({ request, env });

  expect(createRuntime).toHaveBeenCalledTimes(1);
  expect(handle).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
& 'D:\APPS\claude\npm.cmd' test -- --run functions/api/chat.test.ts
```

Expected: FAIL because the Function does not exist and `functions` is absent from TypeScript scope.

- [ ] **Step 3: Implement the Function**

Create:

```ts
import { createRuntime } from "../../src/chat/server/runtime.js";

type CloudflareEnv = Readonly<Record<string, string | undefined>>;
interface PagesContext {
  readonly request: Request;
  readonly env: CloudflareEnv;
}

let runtime: ReturnType<typeof createRuntime> | undefined;

function methodNotAllowed(): Response {
  return Response.json(
    {
      error: {
        code: "method_not_allowed",
        message: "Only POST is supported.",
        retryable: false,
      },
    },
    { status: 405, headers: { allow: "POST", "cache-control": "no-store" } },
  );
}

export async function onRequest(context: PagesContext): Promise<Response> {
  if (context.request.method !== "POST") return methodNotAllowed();

  runtime ??= createRuntime({
    env: context.env,
    ipAddress: (request) =>
      request.headers.get("CF-Connecting-IP") ?? undefined,
  });
  return runtime.handle(context.request);
}
```

Add `"functions"` to `tsconfig.json` `include`.

- [ ] **Step 4: Run and verify GREEN**

```powershell
& 'D:\APPS\claude\npm.cmd' test -- --run functions/api/chat.test.ts
& 'D:\APPS\claude\npm.cmd' run build
```

Expected: Function tests and TypeScript build pass.

- [ ] **Step 5: Commit**

```powershell
git add functions/api/chat.ts functions/api/chat.test.ts tsconfig.json
git commit -m "feat: serve portfolio chat from Cloudflare Pages"
```

### Task 4: Restrict Function routing and harden secret handling

**Files:**
- Create: `public/_routes.json`
- Modify: `.gitignore`
- Modify: `src/production-delivery.test.ts`
- Test: `src/production-delivery.test.ts`

- [ ] **Step 1: Add failing delivery assertions**

Add assertions:

```ts
it("routes only API traffic through Cloudflare Functions", () => {
  const routes = JSON.parse(
    readFileSync(resolve(projectRoot, "public/_routes.json"), "utf8"),
  );
  expect(routes).toEqual({
    version: 1,
    include: ["/api/*"],
    exclude: [],
  });
});

it("ignores Cloudflare local secret files", () => {
  expect(isIgnored(".dev.vars")).toBe(true);
  expect(isIgnored(".dev.vars.production")).toBe(true);
});
```

Move `isIgnored` to module scope so both tests use the same helper.

- [ ] **Step 2: Run and verify RED**

```powershell
& 'D:\APPS\claude\npm.cmd' test -- --run src/production-delivery.test.ts
```

Expected: FAIL because `_routes.json` is missing and `.dev.vars*` is not ignored.

- [ ] **Step 3: Add Cloudflare routing and ignore rules**

Create `public/_routes.json`:

```json
{
  "version": 1,
  "include": ["/api/*"],
  "exclude": []
}
```

Append to `.gitignore`:

```gitignore
.dev.vars
.dev.vars.*
```

- [ ] **Step 4: Run verification**

```powershell
& 'D:\APPS\claude\npm.cmd' test -- --run src/production-delivery.test.ts
& 'D:\APPS\claude\npm.cmd' test
& 'D:\APPS\claude\npm.cmd' run build
```

Expected: all tests pass; `dist/_routes.json` exists; secret scan reports no tracked credential path.

- [ ] **Step 5: Commit**

```powershell
git add .gitignore public/_routes.json src/production-delivery.test.ts
git commit -m "chore: define Cloudflare function boundary"
```

### Task 5: Push and verify the Cloudflare API

**Files:**
- No source changes

- [ ] **Step 1: Push the feature branch**

```powershell
git push origin feature/portfolio-ai-chat-clean
```

Expected: GitHub accepts the new commits and Cloudflare starts a deployment from the connected branch.

- [ ] **Step 2: Configure Cloudflare Production secrets**

In Cloudflare Pages → `portfolio-ai-chat-clean` → Settings → Variables and Secrets, add the exact names from `.env.example`. Encrypt:

```text
DEEPSEEK_API_KEY
RATE_LIMIT_KV_TOKEN
RATE_LIMIT_SALT
```

Store the remaining values as normal variables. Do not paste values into chat or commit them.

- [ ] **Step 3: Redeploy and test method handling**

```powershell
curl.exe -i https://portfolio-ai-chat-clean.pages.dev/api/chat
```

Expected: `405`, `Allow: POST`, JSON body, and no HTML.

- [ ] **Step 4: Perform one real browser chat request**

Open the production site and choose “请用一分钟介绍赵实旷”.

Expected: streamed answer, source links, no generic temporary-unavailable message, and Upstash counters increment.
