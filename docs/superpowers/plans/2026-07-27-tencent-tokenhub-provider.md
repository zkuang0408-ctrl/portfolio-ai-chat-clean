# Tencent TokenHub Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Cloudflare Pages portfolio assistant by calling Tencent TokenHub's Guangzhou OpenAI-compatible DeepSeek-V4-Flash endpoint with a dedicated server-only API key.

**Architecture:** Keep the existing browser UI, `/api/chat` protocol, local knowledge retrieval, SSE parser, citations, Upstash limits, and shared runtime. Extend the strictly allow-listed DeepSeek-compatible provider for the exact TokenHub origin, omit unsupported `user_id` only on that route, and make the Cloudflare entry point map `TENCENT_TOKENHUB_API_KEY` to fixed in-memory runtime values without consulting the legacy AI binding.

**Tech Stack:** TypeScript 5.9, Vitest 4, Cloudflare Pages Functions, Wrangler, Tencent TokenHub OpenAI-compatible Chat Completions, DeepSeek-V4-Flash, Upstash Redis, Vite 8

---

## File map

- `src/chat/server/deepseek-provider.ts` — owns the exact provider-origin allow-list, outbound TokenHub request shape, credential headers, and shared SSE parsing.
- `src/chat/server/deepseek-provider.test.ts` — proves exact URL pinning, TokenHub header isolation, `user_id` omission, and unchanged direct/Gateway behavior.
- `src/chat/server/runtime.test.ts` — proves the shared runtime accepts the exact TokenHub origin without a Cloudflare Gateway credential and rejects near-match origins.
- `functions/api/chat.ts` — reads the dedicated TokenHub Secret, strips legacy provider configuration, maps fixed TokenHub values into the shared runtime, and fails closed with a fixed log category.
- `functions/api/chat.test.ts` — proves the AI binding is unused, legacy credentials cannot select the provider, invalid TokenHub keys disable chat, logs are sanitized, and one isolate creates one runtime.
- `.env.example` — documents only the empty `TENCENT_TOKENHUB_API_KEY` variable name while retaining legacy names until production succeeds.
- `src/production-delivery.test.ts` — locks the environment manifest, checks tracked files for secret-shaped values, and later proves the retired AI binding is absent.
- `wrangler.toml` — keeps the current AI binding for the first TokenHub production check, then removes it only after a successful real SSE response.

### Task 1: Add the exact TokenHub provider contract

**Files:**
- Modify: `src/chat/server/deepseek-provider.test.ts:6-310`
- Modify: `src/chat/server/runtime.test.ts:14-301`
- Modify: `src/chat/server/deepseek-provider.ts:5-18`
- Modify: `src/chat/server/deepseek-provider.ts:324-385`

- [ ] **Step 1: Add failing provider tests for the TokenHub request**

Add `TENCENT_TOKENHUB_BASE_URL` to the provider import in `src/chat/server/deepseek-provider.test.ts`:

```ts
import {
  DeepSeekProvider,
  DeepSeekProviderError,
  MAX_OUTPUT_CODE_POINTS,
  MAX_SSE_EVENT_CHARS,
  MAX_SSE_LINE_CHARS,
  MAX_SSE_STREAM_BYTES,
  TENCENT_TOKENHUB_BASE_URL,
} from "./deepseek-provider";
```

Add the model constant after `TEST_GATEWAY_BASE_URL`:

```ts
const TEST_TOKENHUB_MODEL = "deepseek-v4-flash-202605";
```

Add these tests after the existing Cloudflare Gateway request test:

```ts
test("sends the exact TokenHub request without gateway credentials or user_id", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    okResponse("data: [DONE]\n\n"),
  );
  const provider = new DeepSeekProvider({
    apiKey: TEST_TOKEN,
    baseUrl: TENCENT_TOKENHUB_BASE_URL,
    model: TEST_TOKENHUB_MODEL,
    gatewayToken: TEST_GATEWAY_TOKEN,
    fetch: fetchMock,
  });

  await expect(collect(provider)).resolves.toEqual([{ type: "done" }]);

  const [url, init] = fetchMock.mock.calls[0] ?? [];
  const headers = new Headers(init?.headers);
  expect(url).toBe(
    "https://tokenhub.tencentmaas.com/v1/chat/completions",
  );
  expect(headers.get("authorization")).toBe(`Bearer ${TEST_TOKEN}`);
  expect(headers.get("content-type")).toBe("application/json");
  expect(headers.has("cf-aig-authorization")).toBe(false);
  expect(JSON.parse(String(init?.body))).toEqual({
    model: TEST_TOKENHUB_MODEL,
    messages: [
      { role: "system", content: input.system },
      ...input.messages,
    ],
    thinking: { type: "disabled" },
    temperature: 0.2,
    max_tokens: 700,
    stream: true,
    stream_options: { include_usage: true },
  });
});

test.each([
  "https://tokenhub.tencentmaas.com",
  "https://tokenhub.tencentmaas.com/v1/",
  "http://tokenhub.tencentmaas.com/v1",
  "https://evil.tokenhub.tencentmaas.com/v1",
  "https://tokenhub.tencentmaas.com:443/v1",
  "https://tokenhub.tencentmaas.com/v1?target=evil",
  "https://tokenhub.tencentmaas.com/v1#fragment",
  "https://user@tokenhub.tencentmaas.com/v1",
])("rejects a non-canonical TokenHub endpoint %s", (baseUrl) => {
  expect(
    () =>
      new DeepSeekProvider({
        apiKey: TEST_TOKEN,
        baseUrl,
      }),
  ).toThrow("DeepSeek provider configuration is invalid");
});
```

The direct DeepSeek request test must continue to expect `user_id: input.userId`, so it detects any accidental global removal of the existing field.

- [ ] **Step 2: Add failing runtime tests for exact origin acceptance**

Import the TokenHub constant in `src/chat/server/runtime.test.ts`:

```ts
import { TENCENT_TOKENHUB_BASE_URL } from "./deepseek-provider";
```

Add these tests after the direct DeepSeek credential test:

```ts
test("accepts the exact TokenHub endpoint without a Cloudflare credential", () => {
  const captures: Parameters<typeof factories>[0] = {};
  const runtime = createRuntime({
    env: {
      ...validEnv,
      DEEPSEEK_BASE_URL: TENCENT_TOKENHUB_BASE_URL,
      DEEPSEEK_MODEL: "deepseek-v4-flash-202605",
      CLOUDFLARE_AI_GATEWAY_TOKEN: "must-not-cross-provider-boundary",
    },
    factories: factories(captures),
  });

  expect(runtime.enabled).toBe(true);
  expect(captures.providerOptions).toMatchObject({
    apiKey: validEnv.DEEPSEEK_API_KEY,
    baseUrl: TENCENT_TOKENHUB_BASE_URL,
    model: "deepseek-v4-flash-202605",
  });
  expect(captures.providerOptions).not.toHaveProperty("gatewayToken");
});

test.each([
  "https://tokenhub.tencentmaas.com",
  "https://tokenhub.tencentmaas.com/v1/",
  "http://tokenhub.tencentmaas.com/v1",
  "https://tokenhub.tencentmaas.com/v1?target=evil",
])("fails closed for a non-canonical TokenHub runtime URL %s", (baseUrl) => {
  expect(
    createRuntime({
      env: { ...validEnv, DEEPSEEK_BASE_URL: baseUrl },
    }).enabled,
  ).toBe(false);
});
```

- [ ] **Step 3: Run the focused tests and verify the new contract fails**

Run:

```powershell
npx.cmd vitest run src/chat/server/deepseek-provider.test.ts src/chat/server/runtime.test.ts
```

Expected: FAIL because `TENCENT_TOKENHUB_BASE_URL` is not exported and the TokenHub origin is not yet approved.

- [ ] **Step 4: Add the exact TokenHub origin and route classifier**

In `src/chat/server/deepseek-provider.ts`, add this exported constant after `DEFAULT_DEEPSEEK_BASE_URL`:

```ts
export const TENCENT_TOKENHUB_BASE_URL =
  "https://tokenhub.tencentmaas.com/v1";
```

Add this helper after `isCloudflareDeepSeekBaseUrl`:

```ts
function isTencentTokenHubBaseUrl(value: string): boolean {
  return value === TENCENT_TOKENHUB_BASE_URL;
}
```

Replace `isApprovedDeepSeekBaseUrl` with:

```ts
export function isApprovedDeepSeekBaseUrl(value: string): boolean {
  return (
    value === DEFAULT_DEEPSEEK_BASE_URL ||
    isCloudflareDeepSeekBaseUrl(value) ||
    isTencentTokenHubBaseUrl(value)
  );
}
```

Exact string equality intentionally rejects trailing slashes, alternate schemes, ports, credentials, queries, fragments, subdomains, and other TokenHub paths.

- [ ] **Step 5: Make the request body route-specific**

Add this private field to `DeepSeekProvider`:

```ts
readonly #usesTencentTokenHub: boolean;
```

In the constructor, after `const baseUrl = ...`, compute:

```ts
const usesTencentTokenHub = isTencentTokenHubBaseUrl(baseUrl);
```

After assigning `this.#gatewayToken`, assign:

```ts
this.#usesTencentTokenHub = usesTencentTokenHub;
```

Immediately before the outbound `fetch`, create the complete request body:

```ts
const body = {
  model: this.#model,
  messages: [
    { role: "system", content: input.system },
    ...input.messages,
  ],
  thinking: { type: "disabled" },
  temperature: 0.2,
  max_tokens: this.#maxTokens,
  stream: true,
  stream_options: { include_usage: true },
  ...(this.#usesTencentTokenHub ? {} : { user_id: userId }),
};
```

Replace the existing inline `body: JSON.stringify({ ... })` with:

```ts
body: JSON.stringify(body),
```

Keep the existing user-ID validation before the request. It remains an internal request contract even when TokenHub does not receive the field.

- [ ] **Step 6: Run the provider and runtime tests**

Run:

```powershell
npx.cmd vitest run src/chat/server/deepseek-provider.test.ts src/chat/server/runtime.test.ts
```

Expected: both files PASS. Direct DeepSeek still includes `user_id`, Cloudflare Gateway still sends two separate credentials, TokenHub sends only its Bearer credential, and all near-match TokenHub origins fail closed.

- [ ] **Step 7: Commit the provider boundary**

```powershell
git add src/chat/server/deepseek-provider.ts src/chat/server/deepseek-provider.test.ts src/chat/server/runtime.test.ts
git commit -m "feat: support Tencent TokenHub provider"
```

Expected: one commit containing only provider behavior and its shared-runtime regression tests.

### Task 2: Switch the Cloudflare entry point to the dedicated TokenHub Secret

**Files:**
- Modify: `functions/api/chat.test.ts:1-186`
- Modify: `functions/api/chat.ts:1-82`

- [ ] **Step 1: Replace the binding-oriented fixture with a TokenHub fixture**

In `functions/api/chat.test.ts`, retain the `gateway` and `getUrl` spies only as sentinels that must never be called. Replace `env` with:

```ts
const env = {
  AI: { gateway },
  CHAT_ENABLED: "true",
  TENCENT_TOKENHUB_API_KEY: "tokenhub-unit-test-key",
  DEEPSEEK_API_KEY: "legacy-deepseek-key-must-not-cross",
  DEEPSEEK_BASE_URL: "https://api.deepseek.com",
  DEEPSEEK_MODEL: "legacy-model-must-not-cross",
  CLOUDFLARE_AI_GATEWAY_TOKEN: "legacy-gateway-key-must-not-cross",
  RATE_LIMIT_KV_URL: "https://example.upstash.io",
  RATE_LIMIT_KV_TOKEN: "test-token",
  RATE_LIMIT_SALT: "a-runtime-salt-that-is-at-least-thirty-two-bytes",
};
```

Keep `beforeEach` clearing all spies and resetting modules.

- [ ] **Step 2: Replace the successful initialization test**

Replace `resolves the DeepSeek URL through the account AI binding` with:

```ts
test("maps only the dedicated TokenHub Secret to fixed runtime values", async () => {
  const { onRequest } = await import("./chat");
  const request = new Request("https://portfolio.test/api/chat", {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.10" },
  });

  const response = await onRequest({ request, env });
  const options = mocks.createRuntime.mock.calls[0]?.[0] as {
    env: Readonly<Record<string, string | undefined>>;
    ipAddress(request: Request): string | undefined;
    providerFailure(category: string): void;
  };

  expect(response.headers.get("content-type")).toBe("text/event-stream");
  expect(gateway).not.toHaveBeenCalled();
  expect(getUrl).not.toHaveBeenCalled();
  expect(options.env).toEqual({
    CHAT_ENABLED: "true",
    DEEPSEEK_API_KEY: "tokenhub-unit-test-key",
    DEEPSEEK_BASE_URL: "https://tokenhub.tencentmaas.com/v1",
    DEEPSEEK_MODEL: "deepseek-v4-flash-202605",
    RATE_LIMIT_KV_URL: "https://example.upstash.io",
    RATE_LIMIT_KV_TOKEN: "test-token",
    RATE_LIMIT_SALT: "a-runtime-salt-that-is-at-least-thirty-two-bytes",
  });
  expect(options.env).not.toHaveProperty("AI");
  expect(options.env).not.toHaveProperty("TENCENT_TOKENHUB_API_KEY");
  expect(options.env).not.toHaveProperty("CLOUDFLARE_AI_GATEWAY_TOKEN");
  expect(options.ipAddress(request)).toBe("203.0.113.10");
  expect(mocks.handle).toHaveBeenCalledWith(request);

  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    options.providerFailure("authentication");
    expect(warn).toHaveBeenCalledWith(
      JSON.stringify({
        event: "portfolio_chat_upstream_failure",
        category: "authentication",
      }),
    );
  } finally {
    warn.mockRestore();
  }
});
```

- [ ] **Step 3: Add fail-closed and sanitization tests**

Replace the existing AI-binding failure table with:

```ts
test.each([
  ["missing", undefined],
  ["blank", ""],
  ["whitespace", " tokenhub-key"],
  ["too long", "x".repeat(4_097)],
  ["control character", "tokenhub\nkey"],
  ["non ASCII", "令牌"],
])("fails closed when the TokenHub key is %s", async (_label, apiKey) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const { onRequest } = await import("./chat");
    await onRequest({
      request: new Request("https://portfolio.test/api/chat", {
        method: "POST",
      }),
      env: {
        ...env,
        TENCENT_TOKENHUB_API_KEY: apiKey,
      },
    });

    const options = mocks.createRuntime.mock.calls[0]?.[0] as {
      env: Readonly<Record<string, string | undefined>>;
    };
    expect(options.env.CHAT_ENABLED).toBe("false");
    expect(options.env).not.toHaveProperty("TENCENT_TOKENHUB_API_KEY");
    expect(options.env).not.toHaveProperty("DEEPSEEK_API_KEY");
    expect(options.env).not.toHaveProperty("CLOUDFLARE_AI_GATEWAY_TOKEN");
    expect(gateway).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      JSON.stringify({
        event: "portfolio_chat_configuration_failure",
        category: "tokenhub_key",
      }),
    );
    const logged = warn.mock.calls.flat().join("\n");
    expect(logged).not.toContain(String(apiKey));
    expect(logged).not.toContain("tokenhub.tencentmaas.com");
  } finally {
    warn.mockRestore();
  }
});

test("does not enable TokenHub from legacy credentials alone", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const { onRequest } = await import("./chat");
    await onRequest({
      request: new Request("https://portfolio.test/api/chat", {
        method: "POST",
      }),
      env: {
        ...env,
        TENCENT_TOKENHUB_API_KEY: undefined,
        DEEPSEEK_API_KEY: "legacy-key",
        CLOUDFLARE_AI_GATEWAY_TOKEN: "legacy-gateway-key",
      },
    });

    const options = mocks.createRuntime.mock.calls[0]?.[0] as {
      env: Readonly<Record<string, string | undefined>>;
    };
    expect(options.env.CHAT_ENABLED).toBe("false");
    expect(gateway).not.toHaveBeenCalled();
  } finally {
    warn.mockRestore();
  }
});
```

Update the runtime reuse tests to expect:

```ts
expect(mocks.createRuntime).toHaveBeenCalledTimes(1);
expect(gateway).not.toHaveBeenCalled();
expect(getUrl).not.toHaveBeenCalled();
expect(mocks.handle).toHaveBeenCalledTimes(2);
```

Replace the asynchronous URL-resolution concurrency test with:

```ts
test("shares one runtime initialization across concurrent requests", async () => {
  const { onRequest } = await import("./chat");
  const first = onRequest({
    request: new Request("https://portfolio.test/api/chat", { method: "POST" }),
    env,
  });
  const second = onRequest({
    request: new Request("https://portfolio.test/api/chat", { method: "POST" }),
    env,
  });

  await Promise.all([first, second]);

  expect(mocks.createRuntime).toHaveBeenCalledTimes(1);
  expect(gateway).not.toHaveBeenCalled();
  expect(getUrl).not.toHaveBeenCalled();
  expect(mocks.handle).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 4: Run the Cloudflare entry tests and verify they fail**

Run:

```powershell
npx.cmd vitest run functions/api/chat.test.ts
```

Expected: FAIL because the entry point still requires `env.AI`, calls `getUrl("deepseek")`, and ignores `TENCENT_TOKENHUB_API_KEY`.

- [ ] **Step 5: Replace binding lookup with fixed server-side mapping**

Replace `functions/api/chat.ts` with:

```ts
import {
  TENCENT_TOKENHUB_BASE_URL,
} from "../../src/chat/server/deepseek-provider.js";
import {
  createRuntime,
  type RuntimeOptions,
} from "../../src/chat/server/runtime.js";

type CloudflareEnv = Readonly<Record<string, unknown>>;

interface PagesContext {
  readonly request: Request;
  readonly env: CloudflareEnv;
}

const TENCENT_TOKENHUB_MODEL = "deepseek-v4-flash-202605";
const PROVIDER_ENVIRONMENT_NAMES = [
  "TENCENT_TOKENHUB_API_KEY",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
  "CLOUDFLARE_AI_GATEWAY_TOKEN",
] as const;

let runtime: ReturnType<typeof createRuntime> | undefined;

function stringEnvironment(
  env: CloudflareEnv,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => {
      return typeof entry[1] === "string";
    }),
  );
}

function tokenHubKey(value: string | undefined): string | undefined {
  return value &&
    value.length <= 4_096 &&
    /^[\x21-\x7e]+$/.test(value)
    ? value
    : undefined;
}

function withoutProviderEnvironment(
  values: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  const sanitized = { ...values };
  for (const name of PROVIDER_ENVIRONMENT_NAMES) {
    delete sanitized[name];
  }
  return sanitized;
}

function runtimeOptions(
  env: Readonly<Record<string, string | undefined>>,
): RuntimeOptions {
  return {
    env,
    ipAddress: (request) =>
      request.headers.get("CF-Connecting-IP") ?? undefined,
    providerFailure: (category) => {
      console.warn(
        JSON.stringify({
          event: "portfolio_chat_upstream_failure",
          category,
        }),
      );
    },
  };
}

function initializeRuntime(
  env: CloudflareEnv,
): ReturnType<typeof createRuntime> {
  const values = stringEnvironment(env);
  const apiKey = tokenHubKey(values.TENCENT_TOKENHUB_API_KEY);
  const shared = withoutProviderEnvironment(values);
  if (!apiKey) {
    console.warn(
      JSON.stringify({
        event: "portfolio_chat_configuration_failure",
        category: "tokenhub_key",
      }),
    );
    return createRuntime(
      runtimeOptions({ ...shared, CHAT_ENABLED: "false" }),
    );
  }
  return createRuntime(
    runtimeOptions({
      ...shared,
      DEEPSEEK_API_KEY: apiKey,
      DEEPSEEK_BASE_URL: TENCENT_TOKENHUB_BASE_URL,
      DEEPSEEK_MODEL: TENCENT_TOKENHUB_MODEL,
    }),
  );
}

function methodNotAllowed(): Response {
  return Response.json(
    {
      error: {
        code: "method_not_allowed",
        message: "Only POST is supported.",
        retryable: false,
      },
    },
    {
      status: 405,
      headers: {
        allow: "POST",
        "cache-control": "no-store",
      },
    },
  );
}

export async function onRequest(context: PagesContext): Promise<Response> {
  if (context.request.method !== "POST") return methodNotAllowed();

  runtime ??= initializeRuntime(context.env);
  return runtime.handle(context.request);
}
```

This strips every legacy provider value before creating the runtime, maps the dedicated TokenHub key only in server memory, and leaves the UI/runtime protocol unchanged.

- [ ] **Step 6: Run the Cloudflare entry tests**

Run:

```powershell
npx.cmd vitest run functions/api/chat.test.ts
```

Expected: PASS. The AI binding sentinels remain untouched, fixed TokenHub values reach the runtime, invalid keys disable chat, and log output contains only fixed event/category values.

- [ ] **Step 7: Run the entry, runtime, and provider tests together**

Run:

```powershell
npx.cmd vitest run functions/api/chat.test.ts src/chat/server/runtime.test.ts src/chat/server/deepseek-provider.test.ts
```

Expected: all three files PASS with no regression in direct DeepSeek or Cloudflare Gateway behavior.

- [ ] **Step 8: Commit the Cloudflare mapping**

```powershell
git add functions/api/chat.ts functions/api/chat.test.ts
git commit -m "feat: route Cloudflare chat through TokenHub"
```

Expected: one commit containing only the Cloudflare entry point and its tests.

### Task 3: Document the dedicated Secret without storing a value

**Files:**
- Modify: `src/production-delivery.test.ts:19-34`
- Modify: `.env.example:1-14`

- [ ] **Step 1: Make the exact environment manifest test fail**

In `src/production-delivery.test.ts`, insert this exact line after `CLOUDFLARE_AI_GATEWAY_TOKEN=`:

```ts
'TENCENT_TOKENHUB_API_KEY=',
```

- [ ] **Step 2: Run the delivery test and verify the mismatch**

Run:

```powershell
npx.cmd vitest run src/production-delivery.test.ts
```

Expected: FAIL in `documents only the approved server configuration names and safe defaults` because `.env.example` does not yet contain the new empty name.

- [ ] **Step 3: Add only the empty TokenHub variable**

The first six lines of `.env.example` must become:

```dotenv
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
CLOUDFLARE_AI_GATEWAY_TOKEN=
TENCENT_TOKENHUB_API_KEY=
RATE_LIMIT_KV_URL=
```

Do not place a real TokenHub key in this file, another tracked file, the command line, a screenshot, or chat.

- [ ] **Step 4: Run the delivery test and tracked-file secret scan**

Run:

```powershell
npx.cmd vitest run src/production-delivery.test.ts
```

Expected: PASS, including the exact environment manifest, tracked-file secret scan, Function graph boundary, current AI-binding declaration, and generated-asset checks.

- [ ] **Step 5: Commit the environment contract**

```powershell
git add .env.example src/production-delivery.test.ts
git commit -m "docs: declare TokenHub runtime secret"
```

Expected: the diff contains only the variable name and test expectation, never its value.

### Task 4: Verify the complete local application

**Files:**
- Test only: all tracked source, generated knowledge, generated portfolio pages, and production assets

- [ ] **Step 1: Run the complete Vitest suite**

Run:

```powershell
npm.cmd test
```

Expected: every test file passes. The last verified branch baseline was 620 tests; the total must increase by the new TokenHub tests with zero failures.

- [ ] **Step 2: Run the production build**

Run:

```powershell
npm.cmd run build
```

Expected output includes:

```text
knowledge sources=8 chunks=139
projects=6 pages=135
```

TypeScript, Vite, and `scripts/check-client-bundle.ts` must exit with code 0.

- [ ] **Step 3: Inspect formatting, status, and secret-name boundaries**

Run:

```powershell
git diff --check
git status --short
git grep -n "TENCENT_TOKENHUB_API_KEY"
git grep -n "tokenhub.tencentmaas.com"
```

Expected:

- `git diff --check` emits no output.
- The worktree contains only planned documentation if the task commits were made.
- Every `TENCENT_TOKENHUB_API_KEY` occurrence is a variable name or explicit test fixture.
- The TokenHub URL appears only in server code, server tests, and design/plan documents; it does not enter browser code or generated assets.

- [ ] **Step 4: Record the verified implementation state**

Run:

```powershell
git status --short
git rev-parse HEAD
git log -8 --oneline
```

Expected: the worktree is clean and the latest commits include the provider, Cloudflare mapping, and empty environment manifest.

### Task 5: Store the TokenHub key as a Cloudflare Production Secret

**Files:**
- Modify externally: Cloudflare Pages encrypted Production Secrets
- Do not modify: tracked repository files

- [ ] **Step 1: Confirm the Tencent key is restricted to the selected model**

In Tencent Cloud TokenHub:

1. Open `API Key 管理`.
2. Select the key created for this portfolio.
3. Confirm its accessible model includes `DeepSeek-V4-Flash`.
4. Confirm the free-token balance is available.
5. Keep postpaid disabled for the first production verification.

Do not copy the key into Codex chat.

- [ ] **Step 2: Write the key through Wrangler's hidden prompt**

From the worktree, run:

```powershell
npx.cmd --yes wrangler@latest pages secret put TENCENT_TOKENHUB_API_KEY --project-name portfolio-ai-chat-clean
```

At `Enter a secret value:`, paste the TokenHub key directly into the hidden terminal prompt and submit it. Do not put the value in the command, shell history, `.env.local`, or a screenshot.

Expected: Wrangler confirms that `TENCENT_TOKENHUB_API_KEY` was created or updated.

- [ ] **Step 3: Verify only the encrypted name**

Run:

```powershell
npx.cmd --yes wrangler@latest pages secret list --project-name portfolio-ai-chat-clean
```

Expected: `TENCENT_TOKENHUB_API_KEY` is listed and no value is displayed.

### Task 6: Push, deploy, and verify real production SSE

**Files:**
- Create temporarily: `.chat-verification.json`
- Delete before completion: `.chat-verification.json`
- Modify externally: GitHub branch and Cloudflare Pages Production deployment

- [ ] **Step 1: Push the exact verified branch**

Run in the network environment already used successfully for this repository:

```powershell
$env:HTTPS_PROXY = "http://127.0.0.1:12334"
$env:HTTP_PROXY = "http://127.0.0.1:12334"
git push origin feature/portfolio-ai-chat-clean
Remove-Item Env:HTTPS_PROXY
Remove-Item Env:HTTP_PROXY
```

Expected: GitHub advances `feature/portfolio-ai-chat-clean` to the exact local commit. Do not persist the temporary proxy in Git configuration.

- [ ] **Step 2: Confirm GitHub and local commit identity**

Run:

```powershell
git rev-parse HEAD
git ls-remote origin refs/heads/feature/portfolio-ai-chat-clean
```

Expected: both commands show the same commit SHA.

- [ ] **Step 3: Deploy the existing verified `dist` as Production**

Run:

```powershell
$commit = git rev-parse HEAD
npx.cmd --yes wrangler@latest pages deploy dist --project-name portfolio-ai-chat-clean --branch feature/portfolio-ai-chat-clean --commit-hash $commit --commit-message "Route portfolio chat through Tencent TokenHub"
```

Expected: Wrangler returns a new deployment under `portfolio-ai-chat-clean.pages.dev`. The Pages project currently treats `feature/portfolio-ai-chat-clean` as its Production branch; deploying `main` would create a Preview.

- [ ] **Step 4: Create a non-secret verification request**

Create `.chat-verification.json` with:

```json
{
  "message": "请只依据网站资料，介绍赵实旷最具代表性的一个项目。",
  "history": [],
  "sessionId": "tokenhub_production_verification_20260727",
  "locale": "zh-CN"
}
```

- [ ] **Step 5: Send the same-origin production request**

Run:

```powershell
curl.exe --no-buffer --fail-with-body `
  -H "Origin: https://portfolio-ai-chat-clean.pages.dev" `
  -H "Content-Type: application/json" `
  --data-binary "@.chat-verification.json" `
  "https://portfolio-ai-chat-clean.pages.dev/api/chat"
```

Expected:

- Response content type is `text/event-stream`.
- The stream contains `start`, at least one non-empty `delta`, `sources`, and `done`.
- The stream contains neither `chat_disabled` nor `upstream_unavailable`.
- No response contains a TokenHub key, Cloudflare token, DeepSeek key, upstream URL, or provider diagnostics.

- [ ] **Step 6: Inspect sanitized Cloudflare production logs**

In a second terminal during one verification request, run:

```powershell
npx.cmd --yes wrangler@latest pages deployment tail --project-name portfolio-ai-chat-clean --environment production
```

Expected: the successful request has no `portfolio_chat_upstream_failure`; no log contains a key, request header, prompt, upstream URL, or provider response body.

- [ ] **Step 7: Confirm TokenHub usage without enabling postpaid**

In Tencent Cloud TokenHub, refresh the model usage page.

Expected: DeepSeek-V4-Flash token usage has increased and the free balance has decreased by a plausible amount. Postpaid remains disabled.

- [ ] **Step 8: Remove the local request fixture**

Delete `.chat-verification.json`, then run:

```powershell
git status --short
```

Expected: the worktree is clean.

- [ ] **Step 9: Apply the stop condition if the provider still fails**

If the real request fails before receiving an upstream HTTP status and the sanitized category remains `network`, stop without changing the key, widening permissions, enabling postpaid, changing models, or silently falling back to the old Gateway. Keep the static portfolio available and return to the approved Vercel Production API relay design or begin a separate Tencent Cloud serverless design.

If the category is `authentication`, `balance`, or `rate_limited`, inspect only the corresponding TokenHub key status, model access, free balance, or documented limit. Do not mask the category with code changes.

### Task 7: Retire the unused Cloudflare AI binding after TokenHub succeeds

**Precondition:** Run this task only after Task 6 produces a real non-empty TokenHub `delta`, `sources`, and `done`.

**Files:**
- Modify: `src/production-delivery.test.ts:213-228`
- Modify: `wrangler.toml:1-10`
- Modify externally: Cloudflare Pages Production Secrets

- [ ] **Step 1: Replace the binding-presence test with a failing absence test**

Replace `declares the Cloudflare AI binding and public subrequest routing` in `src/production-delivery.test.ts` with:

```ts
it('declares public subrequest routing without the retired AI binding', () => {
  const config = readFileSync(
    resolve(projectRoot, 'wrangler.toml'),
    'utf8',
  );

  expect(config).toContain('name = "portfolio-ai-chat-clean"');
  expect(config).toContain('pages_build_output_dir = "dist"');
  expect(config).toContain(
    'compatibility_flags = ["global_fetch_strictly_public"]',
  );
  expect(config).not.toMatch(/^\[ai\]$/mu);
  expect(config).not.toMatch(/^\[env\.production\.ai\]$/mu);
  expect(config).not.toContain('binding = "AI"');
});
```

- [ ] **Step 2: Run the delivery test and verify the old binding is detected**

Run:

```powershell
npx.cmd vitest run src/production-delivery.test.ts
```

Expected: FAIL because `wrangler.toml` still declares `[ai]` and `[env.production.ai]`.

- [ ] **Step 3: Remove only the unused binding declarations**

Make `wrangler.toml` exactly:

```toml
name = "portfolio-ai-chat-clean"
pages_build_output_dir = "dist"
compatibility_date = "2026-07-23"
compatibility_flags = ["global_fetch_strictly_public"]
```

Keep `global_fetch_strictly_public`; TokenHub is a public outbound HTTPS origin.

- [ ] **Step 4: Re-run the delivery test and complete suite**

Run:

```powershell
npx.cmd vitest run src/production-delivery.test.ts
npm.cmd test
npm.cmd run build
```

Expected: every command passes; build output still reports `sources=8 chunks=139` and `projects=6 pages=135`.

- [ ] **Step 5: Commit the binding cleanup**

```powershell
git add wrangler.toml src/production-delivery.test.ts
git commit -m "chore: retire unused Cloudflare AI binding"
```

- [ ] **Step 6: Delete only the retired Gateway Secret**

Run:

```powershell
npx.cmd --yes wrangler@latest pages secret delete CLOUDFLARE_AI_GATEWAY_TOKEN --project-name portfolio-ai-chat-clean
```

Confirm deletion when Wrangler prompts.

Expected: the encrypted `CLOUDFLARE_AI_GATEWAY_TOKEN` name disappears. Keep `TENCENT_TOKENHUB_API_KEY`, the Upstash variables, and `RATE_LIMIT_SALT`. Do not delete `DEEPSEEK_API_KEY` without a separate user decision because it may still support the Vercel fallback.

- [ ] **Step 7: Push and deploy the cleanup commit**

Run:

```powershell
$env:HTTPS_PROXY = "http://127.0.0.1:12334"
$env:HTTP_PROXY = "http://127.0.0.1:12334"
git push origin feature/portfolio-ai-chat-clean
Remove-Item Env:HTTPS_PROXY
Remove-Item Env:HTTP_PROXY
$commit = git rev-parse HEAD
npx.cmd --yes wrangler@latest pages deploy dist --project-name portfolio-ai-chat-clean --branch feature/portfolio-ai-chat-clean --commit-hash $commit --commit-message "Retire unused Cloudflare AI binding"
```

Expected: the production deployment reports the cleanup commit SHA.

- [ ] **Step 8: Repeat the real SSE acceptance check**

Recreate the same non-secret `.chat-verification.json`, repeat the `curl.exe` request from Task 6, and delete the fixture.

Expected: `start`, non-empty `delta`, `sources`, and `done` still appear after the AI binding and Gateway Secret are absent.

- [ ] **Step 9: Finish with a clean, verifiable branch**

Run:

```powershell
git status --short
git rev-parse HEAD
git ls-remote origin refs/heads/feature/portfolio-ai-chat-clean
```

Expected: the worktree is clean and local/GitHub SHAs match.
