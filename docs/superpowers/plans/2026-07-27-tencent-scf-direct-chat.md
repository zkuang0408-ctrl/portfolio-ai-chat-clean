# Tencent SCF Direct Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the existing evidence-grounded portfolio assistant from a Tencent Cloud Guangzhou SCF Web Function and let the Cloudflare-hosted homepage stream responses directly from its public Function URL.

**Architecture:** Extend the shared chat request contract with an explicit origin allow-list, then reuse the existing runtime inside a small Node.js HTTP server that listens on SCF port 9000. The browser selects either the strict Tencent Function URL or the existing same-origin `/api/chat` fallback at build time; a deterministic bundle-and-ZIP pipeline produces a secret-free SCF upload artifact.

**Tech Stack:** TypeScript 5.9, Node.js 20, native Node HTTP, Web Fetch/Streams APIs, Vitest 4, esbuild, Python `zipfile`, Tencent SCF Web Function and Function URL, Tencent TokenHub, Upstash Redis, Vite 8

---

## File map

- `src/chat/server/validation.ts` — accepts an optional exact Origin allow-list while retaining same-origin behavior by default.
- `src/chat/server/validation.test.ts` — proves same-origin compatibility and explicit cross-origin acceptance/rejection.
- `src/chat/server/chat-handler.ts` — passes the runtime allow-list into both pre-body and post-body validation.
- `src/chat/server/chat-handler.test.ts` — proves the handler accepts only configured origins.
- `src/chat/server/runtime.ts` — carries allowed origins from an entry point into the shared handler.
- `src/chat/server/runtime.test.ts` — proves runtime propagation without changing Vercel or Cloudflare defaults.
- `src/chat/chat-endpoint.ts` — validates the public SCF endpoint and returns `/api/chat` on absent or invalid input.
- `src/chat/chat-endpoint.test.ts` — locks the exact Guangzhou Function URL contract.
- `src/chat/chat-controller.ts` — posts to an injected endpoint instead of a hard-coded path.
- `src/chat/chat-controller.test.ts` — proves requests use the injected endpoint.
- `src/main.ts` — resolves `import.meta.env.VITE_CHAT_API_URL` once and injects it into the controller.
- `src/vite-env.d.ts` — documents the public, non-secret Vite variable.
- `scf/security.ts` — parses exact HTTPS origins and `x-scf-remote-addr`.
- `scf/security.test.ts` — rejects spoofable, malformed, chained, or non-IP address values.
- `scf/runtime.ts` — maps SCF environment values to the fixed TokenHub runtime and fails closed.
- `scf/runtime.test.ts` — proves provider isolation, origin parsing, and safe logging.
- `scf/server.ts` — adapts Node HTTP requests and streaming responses to the shared Web API runtime.
- `scf/server.test.ts` — real local HTTP tests for CORS, routing, body forwarding, SSE chunks, and cancellation.
- `scf/index.ts` — initializes the runtime once and listens on `0.0.0.0:9000`.
- `scf/scf_bootstrap` — starts the bundled Node server in Tencent's standard Web Function runtime.
- `scripts/build-scf-package.ts` — bundles the server, stages files, invokes the ZIP writer, and verifies the artifact.
- `scripts/build-scf-package.test.ts` — verifies artifact structure and secret boundaries.
- `tools/package_scf.py` — writes a deterministic ZIP and preserves executable mode on `scf_bootstrap`.
- `package.json` / `package-lock.json` — declare `esbuild` and SCF build/check scripts.
- `tsconfig.json` / `vitest.config.ts` — include the SCF TypeScript and tests.
- `.env.example` — adds only empty/public configuration names.
- `.gitignore` — excludes `.scf-build/` and the generated ZIP.
- `src/production-delivery.test.ts` — locks scripts, environment manifest, ignored outputs, and secret scanning.
- `docs/deployment/tencent-scf-chat.md` — exact console deployment, CORS, environment, smoke-test, rollout, and rollback instructions.

### Task 1: Add an explicit cross-origin contract to the shared runtime

**Files:**
- Modify: `src/chat/server/validation.ts`
- Modify: `src/chat/server/validation.test.ts`
- Modify: `src/chat/server/chat-handler.ts`
- Modify: `src/chat/server/chat-handler.test.ts`
- Modify: `src/chat/server/runtime.ts`
- Modify: `src/chat/server/runtime.test.ts`

- [ ] **Step 1: Write failing validation tests**

Add to `validateChatRequestContext` tests:

```ts
test("accepts an origin from an explicit exact allow-list", () => {
  expect(() =>
    validateChatRequestContext({
      ...validContext,
      requestUrl: "https://123456-urlid.ap-guangzhou.tencentscf.com/chat",
      origin: "https://portfolio-ai-chat-clean.pages.dev",
      allowedOrigins: ["https://portfolio-ai-chat-clean.pages.dev"],
    }),
  ).not.toThrow();
});

test.each([
  "https://portfolio-ai-chat-clean.pages.dev.evil.example",
  "http://portfolio-ai-chat-clean.pages.dev",
  "https://portfolio-ai-chat-clean.pages.dev/",
])("rejects a near-match explicit origin %s", (origin) => {
  expect(() =>
    validateChatRequestContext({
      ...validContext,
      requestUrl: "https://123456-urlid.ap-guangzhou.tencentscf.com/chat",
      origin,
      allowedOrigins: ["https://portfolio-ai-chat-clean.pages.dev"],
    }),
  ).toThrow("cross_origin_request");
});
```

- [ ] **Step 2: Write failing runtime/handler propagation tests**

In the handler fixture, set:

```ts
allowedOrigins: ["https://portfolio-ai-chat-clean.pages.dev"],
```

Add:

```ts
test("accepts only the configured cross-origin site", async () => {
  const allowed = new Request(
    "https://123456-urlid.ap-guangzhou.tencentscf.com/chat",
    {
      method: "POST",
      headers: {
        origin: "https://portfolio-ai-chat-clean.pages.dev",
        "content-type": "application/json",
        "content-length": String(validBody.length),
      },
      body: validBody,
    },
  );
  expect((await handleChat(allowed, dependencies)).status).toBe(200);

  provider.stream.mockClear();
  const rejected = new Request(
    "https://123456-urlid.ap-guangzhou.tencentscf.com/chat",
    {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        "content-type": "application/json",
      },
      body: validBody,
    },
  );
  const response = await handleChat(rejected, dependencies);
  expect(response.status).toBe(403);
  expect(provider.stream).not.toHaveBeenCalled();
});
```

In `runtime.test.ts`, create a runtime with:

```ts
allowedOrigins: ["https://portfolio-ai-chat-clean.pages.dev"],
```

Execute the runtime handler with:

```ts
const response = await runtime.handle(
  new Request(
    "https://123456-urlid.ap-guangzhou.tencentscf.com/chat",
    {
      method: "POST",
      headers: {
        origin: "https://portfolio-ai-chat-clean.pages.dev",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: "介绍 INKSeat",
        history: [],
        sessionId: "session_123",
        locale: "zh",
      }),
    },
  ),
);
expect(response.status).toBe(200);
```

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```powershell
npx.cmd vitest run src/chat/server/validation.test.ts src/chat/server/chat-handler.test.ts src/chat/server/runtime.test.ts
```

Expected: FAIL because `allowedOrigins` is not part of the request or runtime contract.

- [ ] **Step 4: Implement exact origin selection**

Extend `ChatRequestContext`:

```ts
readonly allowedOrigins?: readonly string[];
```

Replace the final origin check in `validateChatRequestContext` with:

```ts
const allowedOrigins = context.allowedOrigins ?? [expectedOrigin];
if (
  typeof context.origin !== "string" ||
  !allowedOrigins.includes(context.origin)
) {
  fail("cross_origin_request", 403);
}
```

Add to `RuntimeOptions` and `ChatHandlerDependencies`:

```ts
readonly allowedOrigins?: readonly string[];
```

Pass `dependencies.allowedOrigins` to both `validateChatRequestContext` calls. In `createRuntime`, copy the value into handler dependencies:

```ts
allowedOrigins: options.allowedOrigins,
```

Do not set this option in Vercel or Cloudflare entry points; their existing same-origin behavior remains unchanged.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npx.cmd vitest run src/chat/server/validation.test.ts src/chat/server/chat-handler.test.ts src/chat/server/runtime.test.ts
```

Expected: PASS; same-origin tests and new allow-list tests both succeed.

- [ ] **Step 6: Commit**

```powershell
git add src/chat/server/validation.ts src/chat/server/validation.test.ts src/chat/server/chat-handler.ts src/chat/server/chat-handler.test.ts src/chat/server/runtime.ts src/chat/server/runtime.test.ts
git commit -m "feat: support explicit chat origins"
```

### Task 2: Make the browser chat endpoint configurable and strict

**Files:**
- Create: `src/chat/chat-endpoint.ts`
- Create: `src/chat/chat-endpoint.test.ts`
- Create: `src/vite-env.d.ts`
- Modify: `src/chat/chat-controller.ts`
- Modify: `src/chat/chat-controller.test.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Write failing endpoint tests**

Create `src/chat/chat-endpoint.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { resolveChatEndpoint } from "./chat-endpoint";

describe("resolveChatEndpoint", () => {
  test.each([undefined, "", "   "])("falls back for %j", (value) => {
    expect(resolveChatEndpoint(value)).toBe("/api/chat");
  });

  test("accepts the exact Guangzhou Function URL shape", () => {
    expect(
      resolveChatEndpoint(
        "https://1234567890-abcd1234.ap-guangzhou.tencentscf.com/chat",
      ),
    ).toBe(
      "https://1234567890-abcd1234.ap-guangzhou.tencentscf.com/chat",
    );
  });

  test.each([
    "http://1234567890-abcd1234.ap-guangzhou.tencentscf.com/chat",
    "https://1234567890-abcd1234.ap-shanghai.tencentscf.com/chat",
    "https://evil.ap-guangzhou.tencentscf.com/chat",
    "https://1234567890-abcd1234.ap-guangzhou.tencentscf.com/",
    "https://1234567890-abcd1234.ap-guangzhou.tencentscf.com/chat/",
    "https://1234567890-abcd1234.ap-guangzhou.tencentscf.com/chat?q=1",
    "https://user@1234567890-abcd1234.ap-guangzhou.tencentscf.com/chat",
  ])("falls back for invalid endpoint %s", (value) => {
    expect(resolveChatEndpoint(value)).toBe("/api/chat");
  });
});
```

- [ ] **Step 2: Add a failing controller assertion**

Set the test fixture dependency:

```ts
endpoint: "https://1234567890-abcd1234.ap-guangzhou.tencentscf.com/chat",
```

After submitting one question, assert:

```ts
expect(fetch.mock.calls[0]?.[0]).toBe(
  "https://1234567890-abcd1234.ap-guangzhou.tencentscf.com/chat",
);
```

- [ ] **Step 3: Run focused tests and verify failure**

```powershell
npx.cmd vitest run src/chat/chat-endpoint.test.ts src/chat/chat-controller.test.ts
```

Expected: FAIL because the resolver and dependency do not exist.

- [ ] **Step 4: Implement the resolver**

Create `src/chat/chat-endpoint.ts`:

```ts
const FALLBACK_CHAT_ENDPOINT = "/api/chat";
const FUNCTION_HOST =
  /^\d+-[a-z0-9]+\.ap-guangzhou\.tencentscf\.com$/u;

export function resolveChatEndpoint(value: string | undefined): string {
  const candidate = value?.trim();
  if (!candidate) return FALLBACK_CHAT_ENDPOINT;
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "https:" ||
      !FUNCTION_HOST.test(url.hostname) ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/chat" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return FALLBACK_CHAT_ENDPOINT;
    }
    return url.href;
  } catch {
    return FALLBACK_CHAT_ENDPOINT;
  }
}
```

- [ ] **Step 5: Inject the endpoint**

Add to `PortfolioChatDependencies`:

```ts
readonly endpoint: string;
```

Replace:

```ts
dependencies.fetch("/api/chat", {
```

with:

```ts
dependencies.fetch(dependencies.endpoint, {
```

Create `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHAT_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

In `src/main.ts`, import and inject:

```ts
import { resolveChatEndpoint } from "./chat/chat-endpoint";
```

```ts
endpoint: resolveChatEndpoint(import.meta.env.VITE_CHAT_API_URL),
```

- [ ] **Step 6: Run focused tests and build**

```powershell
npx.cmd vitest run src/chat/chat-endpoint.test.ts src/chat/chat-controller.test.ts
npm.cmd run build
```

Expected: tests PASS and the production build succeeds without embedding server secrets.

- [ ] **Step 7: Commit**

```powershell
git add src/chat/chat-endpoint.ts src/chat/chat-endpoint.test.ts src/vite-env.d.ts src/chat/chat-controller.ts src/chat/chat-controller.test.ts src/main.ts
git commit -m "feat: configure public chat endpoint"
```

### Task 3: Add SCF origin, address, and runtime configuration

**Files:**
- Create: `scf/security.ts`
- Create: `scf/security.test.ts`
- Create: `scf/runtime.ts`
- Create: `scf/runtime.test.ts`
- Modify: `.env.example`
- Modify: `tsconfig.json`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Write failing security tests**

Create `scf/security.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, test } from "vitest";
import { parseAllowedOrigins, scfRemoteAddress } from "./security";

test("parses exact unique HTTPS origins", () => {
  expect(
    parseAllowedOrigins(
      "https://portfolio-ai-chat-clean.pages.dev,https://portfolio.example",
    ),
  ).toEqual([
    "https://portfolio-ai-chat-clean.pages.dev",
    "https://portfolio.example",
  ]);
});

test.each([
  undefined,
  "",
  "*",
  "http://portfolio.example",
  "https://portfolio.example/path",
  "https://user@portfolio.example",
])("rejects invalid origin configuration %j", (value) => {
  expect(parseAllowedOrigins(value)).toBeUndefined();
});

test.each(["203.0.113.8", "2001:db8::8"])(
  "accepts SCF address %s",
  (address) => {
    expect(
      scfRemoteAddress(new Headers({ "x-scf-remote-addr": address })),
    ).toBe(address);
  },
);

test.each([
  "",
  "203.0.113.8:443",
  "203.0.113.8, 198.51.100.1",
  "not-an-ip",
  "203.0.113.8\nx",
])("rejects invalid SCF address %j", (address) => {
  expect(
    scfRemoteAddress(new Headers({ "x-scf-remote-addr": address })),
  ).toBeUndefined();
});

test("does not trust x-forwarded-for", () => {
  expect(
    scfRemoteAddress(new Headers({ "x-forwarded-for": "203.0.113.8" })),
  ).toBeUndefined();
});
```

- [ ] **Step 2: Write failing runtime configuration tests**

Mock `createRuntime`, call `createScfRuntime` with this complete fixture, and assert:

```ts
const environment = {
  CHAT_ENABLED: "true",
  CHAT_ALLOWED_ORIGINS:
    "https://portfolio-ai-chat-clean.pages.dev",
  TENCENT_TOKENHUB_API_KEY: "tokenhub-test-key",
  DEEPSEEK_API_KEY: "legacy-key-must-not-cross",
  RATE_LIMIT_KV_URL: "https://example.upstash.io",
  RATE_LIMIT_KV_TOKEN: "redis-token",
  RATE_LIMIT_SALT: "a-runtime-salt-that-is-at-least-thirty-two-bytes",
};
const configured = createScfRuntime(environment);
const options = mocks.createRuntime.mock.calls[0]?.[0];
```

```ts
expect(options.env).toEqual({
  CHAT_ENABLED: "true",
  DEEPSEEK_API_KEY: "tokenhub-test-key",
  DEEPSEEK_BASE_URL: "https://tokenhub.tencentmaas.com/v1",
  DEEPSEEK_MODEL: "deepseek-v4-flash-202605",
  RATE_LIMIT_KV_URL: "https://example.upstash.io",
  RATE_LIMIT_KV_TOKEN: "redis-token",
  RATE_LIMIT_SALT: "a-runtime-salt-that-is-at-least-thirty-two-bytes",
});
expect(options.allowedOrigins).toEqual([
  "https://portfolio-ai-chat-clean.pages.dev",
]);
```

Add this table:

```ts
test.each([
  ["tokenhub_key", { ...environment, TENCENT_TOKENHUB_API_KEY: "" }],
  ["allowed_origins", { ...environment, CHAT_ALLOWED_ORIGINS: "*" }],
])("fails closed for %s", async (category, source) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  createScfRuntime(source);
  expect(mocks.createRuntime.mock.calls[0]?.[0].env.CHAT_ENABLED)
    .toBe("false");
  expect(warn).toHaveBeenCalledWith(JSON.stringify({
    event: "portfolio_chat_configuration_failure",
    category,
  }));
});
```

- [ ] **Step 3: Run and verify failure**

```powershell
npx.cmd vitest run scf/security.test.ts scf/runtime.test.ts
```

Expected: FAIL because the SCF modules do not exist.

- [ ] **Step 4: Implement strict security helpers**

Create `scf/security.ts`:

```ts
import { isIP } from "node:net";

export function parseAllowedOrigins(
  value: string | undefined,
): readonly string[] | undefined {
  if (!value) return undefined;
  const origins = value.split(",").map((item) => item.trim());
  if (origins.length === 0 || origins.some((item) => item === "")) {
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
      ) return undefined;
      parsed.push(origin);
    } catch {
      return undefined;
    }
  }
  return [...new Set(parsed)];
}

export function scfRemoteAddress(headers: Headers): string | undefined {
  const value = headers.get("x-scf-remote-addr");
  return value && value.length <= 45 && !value.includes(",") && isIP(value)
    ? value
    : undefined;
}
```

- [ ] **Step 5: Implement the fixed SCF runtime mapping**

Create `scf/runtime.ts` with:

```ts
import {
  TENCENT_TOKENHUB_BASE_URL,
} from "../src/chat/server/deepseek-provider.js";
import {
  createRuntime,
  type ChatRuntime,
} from "../src/chat/server/runtime.js";
import { parseAllowedOrigins, scfRemoteAddress } from "./security.js";

const MODEL = "deepseek-v4-flash-202605";
const PROVIDER_NAMES = new Set([
  "TENCENT_TOKENHUB_API_KEY",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
  "CLOUDFLARE_AI_GATEWAY_TOKEN",
  "CHAT_ALLOWED_ORIGINS",
]);

export interface ScfRuntime {
  readonly chat: ChatRuntime;
  readonly allowedOrigins: readonly string[];
}

export function createScfRuntime(
  source: NodeJS.ProcessEnv = process.env,
): ScfRuntime {
  const values = Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string",
    ),
  );
  const key = values.TENCENT_TOKENHUB_API_KEY;
  const allowedOrigins = parseAllowedOrigins(values.CHAT_ALLOWED_ORIGINS);
  const shared = Object.fromEntries(
    Object.entries(values).filter(([name]) => !PROVIDER_NAMES.has(name)),
  );
  const validKey =
    key !== undefined &&
    key.length > 0 &&
    key.length <= 4_096 &&
    /^[\x21-\x7e]+$/u.test(key);

  if (!validKey || !allowedOrigins) {
    console.warn(JSON.stringify({
      event: "portfolio_chat_configuration_failure",
      category: validKey ? "allowed_origins" : "tokenhub_key",
    }));
    return {
      chat: createRuntime({ env: { ...shared, CHAT_ENABLED: "false" } }),
      allowedOrigins: allowedOrigins ?? [],
    };
  }

  return {
    chat: createRuntime({
      env: {
        ...shared,
        DEEPSEEK_API_KEY: key,
        DEEPSEEK_BASE_URL: TENCENT_TOKENHUB_BASE_URL,
        DEEPSEEK_MODEL: MODEL,
      },
      allowedOrigins,
      ipAddress: (request) => scfRemoteAddress(request.headers),
      providerFailure: (category) => {
        console.warn(JSON.stringify({
          event: "portfolio_chat_upstream_failure",
          category,
        }));
      },
    }),
    allowedOrigins,
  };
}
```

- [ ] **Step 6: Include SCF sources and safe variable names**

Add `scf` to `tsconfig.json` include and `scf/**/*.test.ts` to Vitest include. Add only:

```dotenv
CHAT_ALLOWED_ORIGINS=https://portfolio-ai-chat-clean.pages.dev
VITE_CHAT_API_URL=
```

to `.env.example`; no real Function URL or Secret value is committed.

- [ ] **Step 7: Run focused tests and typecheck**

```powershell
npx.cmd vitest run scf/security.test.ts scf/runtime.test.ts
npx.cmd tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add scf/security.ts scf/security.test.ts scf/runtime.ts scf/runtime.test.ts .env.example tsconfig.json vitest.config.ts
git commit -m "feat: configure Tencent SCF chat runtime"
```

### Task 4: Implement the Node HTTP and SSE adapter

**Files:**
- Create: `scf/server.ts`
- Create: `scf/server.test.ts`
- Create: `scf/index.ts`
- Create: `scf/scf_bootstrap`

- [ ] **Step 1: Write real local HTTP tests**

Create a test server with this fixture:

```ts
const ALLOWED_ORIGIN =
  "https://portfolio-ai-chat-clean.pages.dev";
const encoder = new TextEncoder();
const handle = vi.fn(async () => new Response(
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(
        'event: start\ndata: {"locale":"zh"}\n\n',
      ));
      controller.enqueue(encoder.encode(
        'event: delta\ndata: {"text":"回答。"}\n\n',
      ));
      controller.enqueue(encoder.encode(
        'event: sources\ndata: {"sources":[]}\n\n',
      ));
      controller.enqueue(encoder.encode(
        "event: done\ndata: {}\n\n",
      ));
      controller.close();
    },
  }),
  { headers: { "content-type": "text/event-stream" } },
));
const server = createScfServer({
  chat: { enabled: true, handle },
  allowedOrigins: [ALLOWED_ORIGIN],
});
await new Promise<void>((resolve) =>
  server.listen(0, "127.0.0.1", resolve),
);
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("test server did not bind");
}
const baseUrl = `http://127.0.0.1:${address.port}`;
```

Cover:

```ts
test("returns exact preflight headers for an allowed origin", async () => {
  const response = await fetch(`${baseUrl}/chat`, {
    method: "OPTIONS",
    headers: {
      origin: ALLOWED_ORIGIN,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin"))
    .toBe(ALLOWED_ORIGIN);
  expect(response.headers.get("access-control-allow-methods"))
    .toBe("POST, OPTIONS");
  expect(response.headers.get("access-control-allow-headers"))
    .toBe("content-type");
});

test("streams SSE chunks without buffering the completed answer", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  handle.mockImplementationOnce(async () => new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode("event: start\ndata: {}\n\n"));
        await gate;
        controller.enqueue(encoder.encode(
          'event: delta\ndata: {"text":"later"}\n\n',
        ));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  ));
  const response = await fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: {
      origin: ALLOWED_ORIGIN,
      "content-type": "application/json",
    },
    body: "{}",
  });
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value))
    .toContain("event: start");
  release();
  expect(new TextDecoder().decode((await reader.read()).value))
    .toContain("event: delta");
});

test("forwards POST body and SCF headers to the shared runtime", async () => {
  await fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: {
      origin: ALLOWED_ORIGIN,
      "content-type": "application/json",
      "x-scf-remote-addr": "203.0.113.8",
    },
    body: '{"message":"hello"}',
  });
  const request = handle.mock.calls[0]?.[0];
  expect(new URL(request.url).pathname).toBe("/chat");
  expect(request.headers.get("origin")).toBe(ALLOWED_ORIGIN);
  expect(request.headers.get("x-scf-remote-addr")).toBe("203.0.113.8");
  expect(await request.text()).toBe('{"message":"hello"}');
});

test.each([
  ["GET", "/chat", 405],
  ["POST", "/missing", 404],
])("rejects %s %s", async (method, path, status) => {
  handle.mockClear();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { origin: ALLOWED_ORIGIN },
  });
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(await response.text()).not.toContain("tokenhub");
  expect(handle).not.toHaveBeenCalled();
});
```

Add tests for a disallowed/missing Origin, removal of `connection` and `transfer-encoding`, and client cancellation aborting the Web `Request.signal`.

- [ ] **Step 2: Run and verify failure**

```powershell
npx.cmd vitest run scf/server.test.ts
```

Expected: FAIL because the server does not exist.

- [ ] **Step 3: Implement the adapter**

Create `scf/server.ts` with focused helpers:

```ts
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { ChatRuntime } from "../src/chat/server/runtime.js";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
```

Implement the following functions in this order:

- `readBody(request)` with a hard stop at `MAX_CHAT_BODY_BYTES + 1`.
- `toWebRequest(request, signal)` using `https://${request.headers.host}${request.url}`.
- `corsHeaders(origin)` returning exact Origin, `vary: Origin`, methods and headers.
- `writeWebResponse(response, target, origin)` that skips hop-by-hop headers and iterates `Readable.fromWeb(response.body)`.
- `createScfServer({ chat, allowedOrigins })`, routing only `/chat`.

The request handler sequence must be:

```ts
const origin = typeof request.headers.origin === "string"
  ? request.headers.origin
  : undefined;
if (!origin || !allowedOrigins.includes(origin)) {
  return writeJson(response, 403, "cross_origin_request");
}
if (request.method === "OPTIONS") return writePreflight(response, origin);
if (url.pathname !== "/chat") return writeJson(response, 404, "not_found");
if (request.method !== "POST") return writeJson(response, 405, "method_not_allowed");
```

On POST, create an `AbortController`, attach `request.aborted` and early `response.close`, call `chat.handle(webRequest)`, and stream the result. No answer buffering is allowed.

- [ ] **Step 4: Add the production entry and bootstrap**

Create `scf/index.ts`:

```ts
import { createScfRuntime } from "./runtime.js";
import { createScfServer } from "./server.js";

const runtime = createScfRuntime();
const server = createScfServer(runtime);
server.listen(9000, "0.0.0.0", () => {
  console.log(JSON.stringify({
    event: "portfolio_chat_server_ready",
    port: 9000,
  }));
});
```

Create `scf/scf_bootstrap` with LF line endings:

```sh
#!/bin/bash
set -e
cd /var/user
exec node index.mjs
```

- [ ] **Step 5: Run adapter tests and typecheck**

```powershell
npx.cmd vitest run scf/server.test.ts scf/security.test.ts scf/runtime.test.ts
npx.cmd tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add scf/server.ts scf/server.test.ts scf/index.ts scf/scf_bootstrap
git commit -m "feat: add Tencent SCF web server"
```

### Task 5: Build a deterministic, secret-free SCF ZIP

**Files:**
- Create: `scripts/build-scf-package.ts`
- Create: `scripts/build-scf-package.test.ts`
- Create: `tools/package_scf.py`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`
- Modify: `src/production-delivery.test.ts`

- [ ] **Step 1: Install the explicit bundler dependency**

Run:

```powershell
npm.cmd install --save-dev esbuild@0.28.1
```

Expected: only `package.json` and `package-lock.json` dependency metadata change.

- [ ] **Step 2: Write failing package tests**

Test the future artifact:

```ts
expect(packageJson.scripts).toMatchObject({
  "scf:build": "tsx scripts/build-scf-package.ts",
  "scf:verify": "tsx scripts/build-scf-package.ts --verify",
});
expect(isIgnored(".scf-build")).toBe(true);
expect(isIgnored("output/portfolio-chat-scf.zip")).toBe(true);
```

After invoking the build, run:

```powershell
python -c "import zipfile; z=zipfile.ZipFile(r'output/portfolio-chat-scf.zip'); assert z.namelist()==['index.mjs','scf_bootstrap']; assert (z.getinfo('scf_bootstrap').external_attr >> 16) & 0o111"
```

This asserts:

```text
index.mjs
scf_bootstrap
```

and no `.env`, source map, test, Git metadata, PDF, image, or secret-shaped content.

- [ ] **Step 3: Run and verify failure**

```powershell
npx.cmd vitest run scripts/build-scf-package.test.ts src/production-delivery.test.ts
```

Expected: FAIL because scripts and packaging files do not exist.

- [ ] **Step 4: Implement the bundler**

Create `scripts/build-scf-package.ts` to:

```ts
await rm(buildRoot, { recursive: true, force: true });
await mkdir(buildRoot, { recursive: true });
await build({
  entryPoints: [resolve(projectRoot, "scf/index.ts")],
  outfile: resolve(buildRoot, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  legalComments: "none",
});
```

Then invoke:

```ts
execFileSync(pythonCommand, [
  resolve(projectRoot, "tools/package_scf.py"),
  "--bundle",
  resolve(buildRoot, "index.mjs"),
  "--bootstrap",
  resolve(projectRoot, "scf/scf_bootstrap"),
  "--output",
  outputZip,
], { stdio: "inherit" });
```

Verify the bundle does not contain values loaded from local `.env` files and contains no source map.

- [ ] **Step 5: Implement deterministic ZIP creation**

`tools/package_scf.py` must:

- accept the four exact CLI paths above;
- create parent directories;
- use fixed timestamp `(1980, 1, 1, 0, 0, 0)`;
- write `index.mjs` with mode `0o100644`;
- normalize bootstrap to LF and write it with mode `0o100755`;
- use DEFLATED compression;
- reject extra files and output exactly two root entries.

- [ ] **Step 6: Add scripts and ignored outputs**

Add:

```json
"scf:build": "tsx scripts/build-scf-package.ts",
"scf:verify": "tsx scripts/build-scf-package.ts --verify"
```

Add to `.gitignore`:

```gitignore
.scf-build/
output/portfolio-chat-scf.zip
```

Update production delivery expectations for `esbuild`, `scf` in `tsconfig.include`, new environment names, scripts, and ignored artifacts.

- [ ] **Step 7: Build twice and verify determinism**

```powershell
npm.cmd run scf:build
$first=(Get-FileHash output\portfolio-chat-scf.zip -Algorithm SHA256).Hash
npm.cmd run scf:build
$second=(Get-FileHash output\portfolio-chat-scf.zip -Algorithm SHA256).Hash
if ($first -ne $second) { throw "SCF package is not deterministic" }
npm.cmd run scf:verify
```

Expected: hashes match and verification passes.

- [ ] **Step 8: Commit**

```powershell
git add package.json package-lock.json .gitignore scripts/build-scf-package.ts scripts/build-scf-package.test.ts tools/package_scf.py src/production-delivery.test.ts
git commit -m "build: package Tencent SCF chat"
```

### Task 6: Add deployment and rollback documentation

**Files:**
- Create: `docs/deployment/tencent-scf-chat.md`

- [ ] **Step 1: Write the exact deployment runbook**

Document these console values:

```text
Region: Guangzhou
Function type: Web Function
Runtime: Node.js 20.19
Memory: 512 MB
Timeout: 60 seconds
Listen address: 0.0.0.0:9000
Public Function URL: enabled
Authorization: Open / NONE
CORS origin: https://portfolio-ai-chat-clean.pages.dev
CORS methods: POST, OPTIONS
CORS headers: content-type
Credentials: disabled
```

List SCF environment variable names without values and state that the user must paste secrets only in Tencent Cloud:

```text
CHAT_ENABLED
CHAT_ALLOWED_ORIGINS
TENCENT_TOKENHUB_API_KEY
RATE_LIMIT_KV_URL
RATE_LIMIT_KV_TOKEN
RATE_LIMIT_SALT
CHAT_SITE_DAILY_LIMIT
CHAT_VISITOR_DAILY_LIMIT
CHAT_VISITOR_MINUTE_LIMIT
CHAT_COOLDOWN_SECONDS
CHAT_MAX_OUTPUT_TOKENS
CHAT_UPSTREAM_TIMEOUT_MS
```

Include exact smoke tests that read the public Function URL interactively:

```powershell
$env:SCF_CHAT_URL=(Read-Host "粘贴腾讯云 Function URL（末尾必须为 /chat）").Trim()
curl.exe -i -X OPTIONS $env:SCF_CHAT_URL -H "Origin: https://portfolio-ai-chat-clean.pages.dev" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type"
```

The POST example must use a valid test body and `x-scf-remote-addr` must never be client-supplied.

Document Cloudflare rollout:

```text
VITE_CHAT_API_URL=<Function URL ending in /chat>
```

Then redeploy Cloudflare Pages and verify the browser Network panel receives `text/event-stream`.

- [ ] **Step 2: Document rollback**

Rollback is only:

1. remove `VITE_CHAT_API_URL` from Cloudflare Production;
2. redeploy the last known-good static commit;
3. leave SCF Secrets and Upstash data intact;
4. confirm `/api/chat` fallback UI failure does not block portfolio browsing.

- [ ] **Step 3: Review for secret-safe instructions and commit**

```powershell
git add docs/deployment/tencent-scf-chat.md
git commit -m "docs: add Tencent SCF deployment runbook"
```

### Task 7: Run the complete local release gate

**Files:**
- Verify all files changed in Tasks 1–6

- [ ] **Step 1: Run all unit tests**

```powershell
npm.cmd test
```

Expected: all test files and tests PASS.

- [ ] **Step 2: Run the static production build**

```powershell
npm.cmd run build
```

Expected:

```text
Knowledge index verified: sources=8 chunks=139
Verified portfolio project page assets: projects=6 pages=135
Verified client bundle boundary
```

- [ ] **Step 3: Build and verify the SCF package**

```powershell
npm.cmd run scf:build
npm.cmd run scf:verify
```

Expected: ZIP contains only `index.mjs` and executable `scf_bootstrap`; secret scan passes.

- [ ] **Step 4: Run local HTTP/SSE smoke tests**

Run the automated local server suite; it uses an in-memory Provider and never reads a real key:

```powershell
npx.cmd vitest run scf/server.test.ts scf/runtime.test.ts scf/security.test.ts
```

Expected:

- preflight 204;
- disallowed Origin 403;
- POST returns `text/event-stream`;
- event order is `start`, non-empty `delta`, `sources`, `done`;
- abort closes the upstream request.

- [ ] **Step 5: Inspect the final diff and tracked-secret scan**

```powershell
git diff --check
git status --short
git ls-files -z | ForEach-Object { $_ }
```

Run the repository's production secret test; never print matching credential bytes.

- [ ] **Step 6: Commit any verification-only corrections**

If verification required code corrections, use focused commits matching the affected task. The working tree must be clean before remote delivery.

### Task 8: Push and perform the user-controlled production deployment

**Files:**
- No source changes unless production verification exposes a reproducible defect.

- [ ] **Step 1: Push the verified branch**

```powershell
git push origin feature/portfolio-ai-chat-clean
```

Expected: GitHub remote SHA equals local HEAD.

- [ ] **Step 2: Hand off only secret-entry steps to the user**

The user uploads `output/portfolio-chat-scf.zip` and writes the SCF environment values in Tencent Cloud. No Secret is pasted into chat or committed.

- [ ] **Step 3: Verify the Function URL before changing the website**

With the user-provided public Function URL, run read-only preflight and a real SSE question. Require:

```text
HTTP 200
content-type: text/event-stream
start
at least one non-empty delta
sources
done
```

Also verify disallowed Origin receives 403 and no CORS allow-origin header.

- [ ] **Step 4: Configure the Cloudflare public endpoint**

The user sets only the non-secret Production build variable `VITE_CHAT_API_URL` to the verified Function URL and redeploys the same Git commit.

- [ ] **Step 5: Verify the canonical homepage**

From `https://portfolio-ai-chat-clean.pages.dev`:

- ask one Chinese and one English question;
- confirm streamed answers and source controls;
- confirm projects remain fast and navigable;
- confirm SCF logs contain no question, IP, key, TokenHub body, or Upstash credential;
- confirm TokenHub usage increases;
- confirm the visitor and site limits remain active.

- [ ] **Step 6: Roll back if the acceptance gate fails**

Remove `VITE_CHAT_API_URL`, redeploy, and keep the static portfolio live. Do not delete Secrets, change TokenHub billing, widen CORS to `*`, or bypass Upstash limits during diagnosis.
