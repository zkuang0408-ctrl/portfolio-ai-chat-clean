# Cloudflare AI Binding + DeepSeek BYOK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Cloudflare Pages portfolio assistant by resolving the DeepSeek Provider Native Gateway through the account-scoped Cloudflare AI Binding while retaining the user's DeepSeek key, local knowledge retrieval, SSE protocol, and Upstash limits.

**Architecture:** Keep the shared chat runtime platform-neutral. The Cloudflare Pages adapter asynchronously resolves `env.AI.gateway("default").getUrl("deepseek")`, converts the binding environment into a string-only runtime environment, injects the normalized Gateway URL, and caches one runtime initialization promise per isolate. The Vercel adapter and browser bundle remain unchanged.

**Tech Stack:** TypeScript, Cloudflare Pages Functions, Cloudflare AI Binding, DeepSeek Provider Native API, Upstash Redis, Vitest, Vite, Wrangler

---

## File map

- Modify `functions/api/chat.ts`: own Cloudflare AI Binding resolution, safe environment conversion, fail-closed initialization, and isolate-level runtime promise caching.
- Modify `functions/api/chat.test.ts`: specify binding success, normalization, failure, logging, trusted IP extraction, and concurrent initialization behavior.
- Modify `wrangler.toml`: declare the production `AI` binding while retaining the existing Pages settings and compatibility flag.
- Modify `src/production-delivery.test.ts`: lock the committed Wrangler configuration and verify the binding cannot disappear unnoticed.
- No changes to `src/chat/server/runtime.ts`, `src/chat/server/deepseek-provider.ts`, `api/chat.ts`, client code, prompts, limits, or knowledge content.

### Task 1: Resolve the DeepSeek Gateway through the Cloudflare adapter

**Files:**
- Modify: `functions/api/chat.test.ts`
- Modify: `functions/api/chat.ts`
- Test: `functions/api/chat.test.ts`

- [ ] **Step 1: Replace the Cloudflare test fixture with a mock AI Binding**

Define a reusable binding fixture in `functions/api/chat.test.ts`:

```ts
const getUrl = vi.fn(async () =>
  "https://gateway.ai.cloudflare.com/v1/ce389bbbfa541a3a82e81e65eff6a1eb/default/deepseek/",
);
const gateway = vi.fn(() => ({ getUrl }));

const env = {
  AI: { gateway },
  CHAT_ENABLED: "true",
  DEEPSEEK_API_KEY: "test-key",
  RATE_LIMIT_KV_URL: "https://example.upstash.io",
  RATE_LIMIT_KV_TOKEN: "test-token",
  RATE_LIMIT_SALT: "a-runtime-salt-that-is-at-least-thirty-two-bytes",
};
```

Clear `gateway` and `getUrl` in `beforeEach` in addition to the existing runtime mocks.

- [ ] **Step 2: Add the failing binding and environment-boundary test**

Replace the current binding pass-through assertion with:

```ts
test("resolves the DeepSeek URL through the account AI binding", async () => {
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
  expect(gateway).toHaveBeenCalledWith("default");
  expect(getUrl).toHaveBeenCalledWith("deepseek");
  expect(options.env).toEqual({
    CHAT_ENABLED: "true",
    DEEPSEEK_API_KEY: "test-key",
    DEEPSEEK_BASE_URL:
      "https://gateway.ai.cloudflare.com/v1/ce389bbbfa541a3a82e81e65eff6a1eb/default/deepseek",
    RATE_LIMIT_KV_URL: "https://example.upstash.io",
    RATE_LIMIT_KV_TOKEN: "test-token",
    RATE_LIMIT_SALT: "a-runtime-salt-that-is-at-least-thirty-two-bytes",
  });
  expect(options.env).not.toHaveProperty("AI");
  expect(options.ipAddress(request)).toBe("203.0.113.10");
  expect(mocks.handle).toHaveBeenCalledWith(request);
});
```

- [ ] **Step 3: Add failing fail-closed and concurrency tests**

Add:

```ts
test.each([
  ["missing", { ...env, AI: undefined }],
  [
    "unavailable",
    {
      ...env,
      AI: {
        gateway: () => ({
          getUrl: vi.fn(async () => {
            throw new Error("binding unavailable");
          }),
        }),
      },
    },
  ],
])("fails closed when the AI binding is %s", async (_label, failingEnv) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const { onRequest } = await import("./chat");
    await onRequest({
      request: new Request("https://portfolio.test/api/chat", {
        method: "POST",
      }),
      env: failingEnv,
    });

    const options = mocks.createRuntime.mock.calls[0]?.[0] as {
      env: Readonly<Record<string, string | undefined>>;
    };
    expect(options.env.CHAT_ENABLED).toBe("false");
    expect(warn).toHaveBeenCalledWith(
      JSON.stringify({
        event: "portfolio_chat_configuration_failure",
        category: "ai_binding",
      }),
    );
  } finally {
    warn.mockRestore();
  }
});

test("shares one asynchronous runtime initialization across concurrent requests", async () => {
  let resolveUrl!: (value: string) => void;
  getUrl.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        resolveUrl = resolve;
      }),
  );
  const { onRequest } = await import("./chat");
  const first = onRequest({
    request: new Request("https://portfolio.test/api/chat", { method: "POST" }),
    env,
  });
  const second = onRequest({
    request: new Request("https://portfolio.test/api/chat", { method: "POST" }),
    env,
  });

  expect(getUrl).toHaveBeenCalledTimes(1);
  resolveUrl(
    "https://gateway.ai.cloudflare.com/v1/ce389bbbfa541a3a82e81e65eff6a1eb/default/deepseek",
  );
  await Promise.all([first, second]);

  expect(mocks.createRuntime).toHaveBeenCalledTimes(1);
  expect(mocks.handle).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 4: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- --run functions/api/chat.test.ts
```

Expected: FAIL because the current adapter passes the AI object into `createRuntime`, never calls `gateway().getUrl()`, and initializes synchronously.

- [ ] **Step 5: Implement the minimal Cloudflare adapter**

Replace the environment and runtime initialization portion of `functions/api/chat.ts` with:

```ts
import { createRuntime } from "../../src/chat/server/runtime.js";

interface AiGateway {
  getUrl(provider: string): Promise<string>;
}

interface AiBinding {
  gateway(id: string): AiGateway;
}

type CloudflareEnv = Readonly<Record<string, unknown>> & {
  readonly AI?: AiBinding;
};

interface PagesContext {
  readonly request: Request;
  readonly env: CloudflareEnv;
}

let runtimePromise: Promise<ReturnType<typeof createRuntime>> | undefined;

function stringEnvironment(
  env: CloudflareEnv,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => {
      return typeof entry[1] === "string";
    }),
  );
}

function withoutTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function runtimeOptions(
  env: Readonly<Record<string, string | undefined>>,
) {
  return {
    env,
    ipAddress: (request: Request) =>
      request.headers.get("CF-Connecting-IP") ?? undefined,
    providerFailure: (category: string) => {
      console.warn(
        JSON.stringify({
          event: "portfolio_chat_upstream_failure",
          category,
        }),
      );
    },
  };
}

async function initializeRuntime(env: CloudflareEnv) {
  const values = stringEnvironment(env);
  try {
    const gateway = env.AI?.gateway("default");
    if (!gateway) throw new Error("AI binding unavailable");
    const baseUrl = withoutTrailingSlash(await gateway.getUrl("deepseek"));
    return createRuntime(
      runtimeOptions({ ...values, DEEPSEEK_BASE_URL: baseUrl }),
    );
  } catch {
    console.warn(
      JSON.stringify({
        event: "portfolio_chat_configuration_failure",
        category: "ai_binding",
      }),
    );
    return createRuntime(
      runtimeOptions({ ...values, CHAT_ENABLED: "false" }),
    );
  }
}
```

Keep `methodNotAllowed()`, and change the POST path to:

```ts
runtimePromise ??= initializeRuntime(context.env);
const runtime = await runtimePromise;
return runtime.handle(context.request);
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run:

```powershell
npm.cmd test -- --run functions/api/chat.test.ts
```

Expected: all Cloudflare Function tests pass, including binding failure and concurrent initialization.

- [ ] **Step 7: Commit the adapter**

```powershell
git add functions/api/chat.ts functions/api/chat.test.ts
git commit -m "fix: resolve DeepSeek through Cloudflare AI binding"
```

### Task 2: Declare and lock the production AI Binding

**Files:**
- Modify: `wrangler.toml`
- Modify: `src/production-delivery.test.ts`
- Test: `src/production-delivery.test.ts`

- [ ] **Step 1: Add a failing committed-configuration test**

Add to `src/production-delivery.test.ts`:

```ts
it("declares the Cloudflare AI binding and public subrequest routing", () => {
  const config = readFileSync(resolve(projectRoot, "wrangler.toml"), "utf8");

  expect(config).toContain('name = "portfolio-ai-chat-clean"');
  expect(config).toContain('pages_build_output_dir = "dist"');
  expect(config).toContain(
    'compatibility_flags = ["global_fetch_strictly_public"]',
  );
  expect(config).toMatch(/\[ai\]\r?\nbinding = "AI"/u);
});
```

- [ ] **Step 2: Run the delivery test and verify RED**

Run:

```powershell
npm.cmd test -- --run src/production-delivery.test.ts
```

Expected: FAIL because `wrangler.toml` does not yet declare `[ai]`.

- [ ] **Step 3: Add the binding to Wrangler configuration**

Change `wrangler.toml` to:

```toml
name = "portfolio-ai-chat-clean"
pages_build_output_dir = "dist"
compatibility_date = "2026-07-23"
compatibility_flags = ["global_fetch_strictly_public"]

[ai]
binding = "AI"

[env.production]
```

- [ ] **Step 4: Run delivery and focused Cloudflare tests**

Run:

```powershell
npm.cmd test -- --run src/production-delivery.test.ts functions/api/chat.test.ts
```

Expected: both test files pass; secret scanning reports no credential path.

- [ ] **Step 5: Commit the binding configuration**

```powershell
git add wrangler.toml src/production-delivery.test.ts
git commit -m "chore: bind Cloudflare AI to portfolio chat"
```

### Task 3: Run complete regression and security verification

**Files:**
- No new source files

- [ ] **Step 1: Run the full unit suite**

```powershell
npm.cmd test -- --run
```

Expected: all 36 or more test files pass with no skipped failure.

- [ ] **Step 2: Run the production build**

```powershell
npm.cmd run build
```

Expected:

```text
Verified knowledge index: sources=8 chunks=139
Verified project page assets: projects=6 pages=135
Verified client bundle boundary
```

- [ ] **Step 3: Check the exact source state**

```powershell
git diff --check
git status --short
git log -3 --oneline
```

Expected: no unstaged source changes; only the two intended implementation commits appear above the approved design and plan commits.

### Task 4: Push, deploy, and verify real SSE output

**Files:**
- No source changes

- [ ] **Step 1: Push the exact tested commit**

```powershell
$env:HTTPS_PROXY = "http://127.0.0.1:12334"
$env:HTTP_PROXY = "http://127.0.0.1:12334"
git push origin HEAD
```

Expected: GitHub advances `feature/portfolio-ai-chat-clean` to the tested commit.

- [ ] **Step 2: Deploy the same commit to Cloudflare Production**

```powershell
$sha = (git rev-parse HEAD).Trim()
npx.cmd --yes wrangler@latest pages deploy dist `
  --project-name portfolio-ai-chat-clean `
  --branch feature/portfolio-ai-chat-clean `
  --commit-hash $sha `
  --commit-message "Use Cloudflare AI binding for DeepSeek" `
  --commit-dirty=false
```

Expected: Wrangler compiles the Function, uploads the binding configuration, and returns a new `pages.dev` deployment URL.

- [ ] **Step 3: Confirm the deployed configuration contains the AI binding**

Download the project configuration into a disposable directory and inspect only non-secret settings:

```powershell
$inspect = Join-Path $env:TEMP "portfolio-ai-binding-check"
New-Item -ItemType Directory -Force -Path $inspect | Out-Null
npx.cmd --yes wrangler@latest pages download config `
  portfolio-ai-chat-clean --cwd $inspect --force
Get-Content -LiteralPath (Join-Path $inspect "wrangler.toml")
```

Expected: Production contains `compatibility_flags = [ "global_fetch_strictly_public" ]` and an `AI` binding named `AI`. No secret values are printed.

- [ ] **Step 4: Send a real same-origin production request**

```powershell
$body = '{"message":"请用两句话介绍赵实旷，并给出一个作品来源。","history":[],"sessionId":"ai-binding-production-verification","locale":"zh"}'
curl.exe -sS -N --connect-timeout 20 --max-time 80 `
  -X POST "https://portfolio-ai-chat-clean.pages.dev/api/chat" `
  -H "Content-Type: application/json" `
  -H "Origin: https://portfolio-ai-chat-clean.pages.dev" `
  -H "Referer: https://portfolio-ai-chat-clean.pages.dev/" `
  --data-raw $body
```

Expected SSE sequence:

```text
event: start
event: delta
event: sources
event: done
```

The response must contain grounded portfolio or résumé source metadata and must not contain `chat_disabled` or `upstream_unavailable`.

- [ ] **Step 5: Inspect sanitized production logs**

Tail the new deployment and repeat one request:

```powershell
npx.cmd --yes wrangler@latest pages deployment tail `
  --project-name portfolio-ai-chat-clean `
  --environment production `
  --format pretty
```

Expected: the request completes without `portfolio_chat_upstream_failure`. Logs never include the DeepSeek Key, Upstash Token, prompt body, or provider response body.

- [ ] **Step 6: Clean diagnostics and verify the final worktree**

Remove any temporary request fixture created for verification using `apply_patch`, then run:

```powershell
git status --short
```

Expected: clean worktree.

- [ ] **Step 7: Stop safely if production BYOK remains unavailable**

If Step 4 still returns `upstream_unavailable`, do not switch models or expose Vercel Preview. Record the sanitized failure category, keep the previous working static Pages deployment available, and start a separate design for the Vercel Production API fallback described as方案 B in the approved specification.
