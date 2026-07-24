# Cloudflare AI Gateway + DeepSeek Dual Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the production portfolio assistant by authenticating every Cloudflare AI Gateway provider-native request with a dedicated Cloudflare token while continuing to authenticate DeepSeek with the existing DeepSeek API key.

**Architecture:** Keep Cloudflare Pages, the `AI` binding, the shared chat runtime, local retrieval, SSE, and Upstash rate limiting unchanged. Extend the server-only provider boundary with an optional Gateway token, require it only for the strictly allow-listed Cloudflare DeepSeek endpoint, and send it only in `cf-aig-authorization`; direct Vercel-to-DeepSeek requests remain unchanged.

**Tech Stack:** TypeScript 5.9, Vitest 4, Cloudflare Pages Functions and AI binding, Wrangler, DeepSeek provider-native SSE API, Upstash Redis, Vite 8

---

## File map

- `src/chat/server/deepseek-provider.ts` — validates the two independent server credentials, identifies the Cloudflare endpoint, and owns all outbound authentication headers.
- `src/chat/server/deepseek-provider.test.ts` — proves header separation, endpoint pinning, normalization, and invalid-token failure behavior.
- `src/chat/server/runtime.ts` — reads `CLOUDFLARE_AI_GATEWAY_TOKEN`, requires it only for a Cloudflare Gateway URL, and passes it to the provider without logging it.
- `src/chat/server/runtime.test.ts` — proves Cloudflare fails closed without the new token while direct DeepSeek and Vercel remain enabled.
- `.env.example` — documents the new server-only variable name with an empty value.
- `src/production-delivery.test.ts` — locks the approved environment-variable manifest and continues scanning all tracked files for committed DeepSeek secrets.
- `docs/superpowers/specs/2026-07-24-cloudflare-ai-gateway-dual-auth-design.md` — records the current `AI Gateway Run` minimum permission for the runtime token.

### Task 1: Add provider-level dual authentication

**Files:**
- Modify: `src/chat/server/deepseek-provider.test.ts:97-219`
- Modify: `src/chat/server/deepseek-provider.ts:5-50`
- Modify: `src/chat/server/deepseek-provider.ts:324-385`

- [ ] **Step 1: Replace the existing Cloudflare routing test with a failing dual-header test**

In `src/chat/server/deepseek-provider.test.ts`, add this constant after `TEST_TOKEN`:

```ts
const TEST_GATEWAY_TOKEN = "cloudflare-gateway-unit-test-token";
const TEST_GATEWAY_BASE_URL =
  "https://gateway.ai.cloudflare.com/v1/ce389bbbfa541a3a82e81e65eff6a1eb/default/deepseek";
```

Replace `routes requests through an approved Cloudflare AI Gateway base URL` with:

```ts
test("sends separate DeepSeek and Cloudflare credentials through the approved gateway", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    okResponse("data: [DONE]\n\n"),
  );
  const provider = new DeepSeekProvider({
    apiKey: TEST_TOKEN,
    gatewayToken: `  ${TEST_GATEWAY_TOKEN}  `,
    fetch: fetchMock,
    baseUrl: TEST_GATEWAY_BASE_URL,
  });

  await collect(provider);

  const [url, init] = fetchMock.mock.calls[0] ?? [];
  const headers = new Headers(init?.headers);
  expect(url).toBe(`${TEST_GATEWAY_BASE_URL}/chat/completions`);
  expect(headers.get("authorization")).toBe(`Bearer ${TEST_TOKEN}`);
  expect(headers.get("cf-aig-authorization")).toBe(
    `Bearer ${TEST_GATEWAY_TOKEN}`,
  );
});
```

Add these tests immediately after it:

```ts
test("never sends the Cloudflare credential to the direct DeepSeek endpoint", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    okResponse("data: [DONE]\n\n"),
  );
  const provider = new DeepSeekProvider({
    apiKey: TEST_TOKEN,
    gatewayToken: TEST_GATEWAY_TOKEN,
    fetch: fetchMock,
  });

  await collect(provider);

  const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
  expect(headers.get("authorization")).toBe(`Bearer ${TEST_TOKEN}`);
  expect(headers.has("cf-aig-authorization")).toBe(false);
});

test("rejects a Cloudflare gateway endpoint without its gateway credential", () => {
  expect(
    () =>
      new DeepSeekProvider({
        apiKey: TEST_TOKEN,
        baseUrl: TEST_GATEWAY_BASE_URL,
      }),
  ).toThrow("DeepSeek provider configuration is invalid");
});

test.each([
  " ",
  "x".repeat(4_097),
  "contains space",
  "line\nbreak",
  "非ASCII",
])("rejects an unsafe Cloudflare gateway credential", (gatewayToken) => {
  expect(
    () =>
      new DeepSeekProvider({
        apiKey: TEST_TOKEN,
        gatewayToken,
        baseUrl: TEST_GATEWAY_BASE_URL,
      }),
  ).toThrow("DeepSeek provider configuration is invalid");
});
```

In the existing direct request test, add:

```ts
expect(new Headers(init?.headers).has("cf-aig-authorization")).toBe(false);
```

Extend the existing `rejects unsafe or unbounded configuration` table with these DeepSeek key cases:

```ts
{ apiKey: "contains space", model: "deepseek-v4-flash" },
{ apiKey: "line\nbreak", model: "deepseek-v4-flash" },
{ apiKey: "非ASCII", model: "deepseek-v4-flash" },
```

- [ ] **Step 2: Run the focused provider tests and verify the new contract fails**

Run:

```powershell
npx.cmd vitest run src/chat/server/deepseek-provider.test.ts
```

Expected: FAIL because `DeepSeekProviderOptions` does not yet accept `gatewayToken`, Gateway construction without a token still succeeds, or `cf-aig-authorization` is missing.

- [ ] **Step 3: Add the minimal endpoint and token helpers**

In `src/chat/server/deepseek-provider.ts`, replace the private regex declaration and the existing `isApprovedDeepSeekBaseUrl` implementation with:

```ts
const CLOUDFLARE_DEEPSEEK_BASE_URL_PATTERN =
  /^https:\/\/gateway\.ai\.cloudflare\.com\/v1\/[a-f0-9]{32}\/[a-z0-9][a-z0-9_-]{0,63}\/deepseek$/;
const MAX_SERVER_TOKEN_CHARS = 4_096;

export function isCloudflareDeepSeekBaseUrl(value: string): boolean {
  return CLOUDFLARE_DEEPSEEK_BASE_URL_PATTERN.test(value);
}

export function isApprovedDeepSeekBaseUrl(value: string): boolean {
  return (
    value === DEFAULT_DEEPSEEK_BASE_URL ||
    isCloudflareDeepSeekBaseUrl(value)
  );
}

function normalizeServerToken(value: string | undefined): string | undefined {
  const token = value?.trim();
  return token &&
    token.length <= MAX_SERVER_TOKEN_CHARS &&
    /^[\x21-\x7e]+$/.test(token)
    ? token
    : undefined;
}
```

Keep `MAX_API_KEY_CHARS` for the existing DeepSeek key validation; both maximums remain 4,096 characters so the change does not expand the prior credential boundary.

- [ ] **Step 4: Extend the provider option and constructor**

Add the option:

```ts
export interface DeepSeekProviderOptions {
  readonly apiKey: string;
  readonly gatewayToken?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly maxTokens?: number;
  readonly fetch?: typeof fetch;
}
```

Add the private field:

```ts
readonly #gatewayToken: string | undefined;
```

At the start of the constructor, compute:

```ts
const apiKey = options.apiKey.trim();
const baseUrl = options.baseUrl ?? DEFAULT_DEEPSEEK_BASE_URL;
const usesCloudflareGateway = isCloudflareDeepSeekBaseUrl(baseUrl);
const suppliedGatewayToken =
  options.gatewayToken === undefined
    ? undefined
    : normalizeServerToken(options.gatewayToken);
const gatewayToken = usesCloudflareGateway
  ? suppliedGatewayToken
  : undefined;
```

Extend `valid` with both conditions:

```ts
(apiKey.length <= MAX_API_KEY_CHARS && /^[\x21-\x7e]+$/.test(apiKey)) &&
(options.gatewayToken === undefined || suppliedGatewayToken !== undefined) &&
(!usesCloudflareGateway || gatewayToken !== undefined)
```

Replace the existing standalone `apiKey.length <= MAX_API_KEY_CHARS` term in `valid` with the combined API-key term above so the condition is present only once.

After `this.#apiKey = apiKey;`, assign:

```ts
this.#gatewayToken = gatewayToken;
```

This validates any supplied Gateway token but stores it only when the destination is the allow-listed Cloudflare endpoint.

- [ ] **Step 5: Build the outbound headers at the provider boundary**

Immediately before the `fetch` call in `stream`, add:

```ts
const headers: Record<string, string> = {
  authorization: `Bearer ${this.#apiKey}`,
  "content-type": "application/json",
};
if (this.#gatewayToken !== undefined) {
  headers["cf-aig-authorization"] = `Bearer ${this.#gatewayToken}`;
}
```

Replace the inline `headers` object in the fetch initializer with:

```ts
headers,
```

- [ ] **Step 6: Run the provider tests and verify the two credentials stay separated**

Run:

```powershell
npx.cmd vitest run src/chat/server/deepseek-provider.test.ts
```

Expected: PASS for the whole provider test file, including Gateway dual headers, direct-endpoint non-disclosure, missing-token rejection, token trimming, and invalid-token rejection.

- [ ] **Step 7: Commit the provider boundary**

```powershell
git add src/chat/server/deepseek-provider.ts src/chat/server/deepseek-provider.test.ts
git commit -m "feat: authenticate DeepSeek through AI Gateway"
```

Expected: one commit containing only the provider and provider-test changes.

### Task 2: Require the Gateway token conditionally in the shared runtime

**Files:**
- Modify: `src/chat/server/runtime.test.ts:14-242`
- Modify: `src/chat/server/runtime.ts:11-202`
- Modify: `src/chat/server/runtime.ts:228-234`

- [ ] **Step 1: Write failing runtime tests for Cloudflare and direct modes**

Add this test constant after `validEnv`:

```ts
const cloudflareBaseUrl =
  "https://gateway.ai.cloudflare.com/v1/ce389bbbfa541a3a82e81e65eff6a1eb/default/deepseek";
```

Replace the existing `accepts and forwards the canonical Cloudflare DeepSeek gateway endpoint` test with:

```ts
test("requires and forwards the Cloudflare credential only for the gateway endpoint", () => {
  const captures: Parameters<typeof factories>[0] = {};
  const runtime = createRuntime({
    env: {
      ...validEnv,
      DEEPSEEK_BASE_URL: cloudflareBaseUrl,
      CLOUDFLARE_AI_GATEWAY_TOKEN: "  cloudflare-runtime-token  ",
    },
    factories: factories(captures),
  });

  expect(runtime.enabled).toBe(true);
  expect(captures.providerOptions).toMatchObject({
    baseUrl: cloudflareBaseUrl,
    gatewayToken: "cloudflare-runtime-token",
  });
});

test("fails closed when a Cloudflare gateway endpoint lacks its credential", () => {
  const runtime = createRuntime({
    env: {
      ...validEnv,
      DEEPSEEK_BASE_URL: cloudflareBaseUrl,
    },
  });

  expect(runtime.enabled).toBe(false);
});

test.each([
  " ",
  "x".repeat(4_097),
  "contains space",
  "line\nbreak",
  "非ASCII",
])("fails closed for an unsafe Cloudflare gateway credential", (gatewayToken) => {
  const runtime = createRuntime({
    env: {
      ...validEnv,
      DEEPSEEK_BASE_URL: cloudflareBaseUrl,
      CLOUDFLARE_AI_GATEWAY_TOKEN: gatewayToken,
    },
  });

  expect(runtime.enabled).toBe(false);
});

test("keeps direct DeepSeek enabled without forwarding a Cloudflare credential", () => {
  const captures: Parameters<typeof factories>[0] = {};
  const runtime = createRuntime({
    env: {
      ...validEnv,
      CLOUDFLARE_AI_GATEWAY_TOKEN: "cloudflare-runtime-token",
    },
    factories: factories(captures),
  });

  expect(runtime.enabled).toBe(true);
  expect(captures.providerOptions).toMatchObject({
    baseUrl: "https://api.deepseek.com",
  });
  expect(captures.providerOptions).not.toHaveProperty("gatewayToken");
});
```

- [ ] **Step 2: Run the focused runtime tests and verify they fail**

Run:

```powershell
npx.cmd vitest run src/chat/server/runtime.test.ts
```

Expected: FAIL because the runtime still enables a Gateway URL without a token and does not forward a normalized `gatewayToken`.

- [ ] **Step 3: Import the endpoint classifier and add runtime token parsing**

Extend the provider import in `src/chat/server/runtime.ts`:

```ts
import {
  DEFAULT_DEEPSEEK_BASE_URL,
  DeepSeekProvider,
  type DeepSeekProviderErrorCategory,
  type DeepSeekProviderOptions,
  isApprovedDeepSeekBaseUrl,
  isCloudflareDeepSeekBaseUrl,
} from "./deepseek-provider.js";
```

Add this helper after `required`:

```ts
function serverToken(value: string | undefined): string | undefined {
  const token = required(value);
  return token && token.length <= 4_096 && /^[\x21-\x7e]+$/.test(token)
    ? token
    : undefined;
}
```

Add this optional property to `RuntimeConfig`:

```ts
readonly gatewayToken?: string;
```

- [ ] **Step 4: Require the token only for the Cloudflare endpoint**

After `baseUrl` is computed in `parseConfig`, add:

```ts
const usesCloudflareGateway = isCloudflareDeepSeekBaseUrl(baseUrl);
const gatewayToken = usesCloudflareGateway
  ? serverToken(env.CLOUDFLARE_AI_GATEWAY_TOKEN)
  : undefined;
```

Extend the invalid-configuration condition with:

```ts
(usesCloudflareGateway && !gatewayToken) ||
```

Extend the returned config object with:

```ts
...(gatewayToken === undefined ? {} : { gatewayToken }),
```

Extend the provider options in `createRuntime` with:

```ts
...(config.gatewayToken === undefined
  ? {}
  : { gatewayToken: config.gatewayToken }),
```

Because the property is omitted rather than set to `undefined`, the direct DeepSeek regression test can prove that the Cloudflare credential never crosses that configuration boundary.

- [ ] **Step 5: Run the runtime and provider tests together**

Run:

```powershell
npx.cmd vitest run src/chat/server/runtime.test.ts src/chat/server/deepseek-provider.test.ts
```

Expected: PASS for both files. Existing direct endpoint, URL allow-list, rate-limit defaults, profile evidence, and SSE parsing tests remain green.

- [ ] **Step 6: Commit the conditional runtime configuration**

```powershell
git add src/chat/server/runtime.ts src/chat/server/runtime.test.ts
git commit -m "feat: require AI Gateway runtime credential"
```

Expected: one commit containing only runtime configuration and its tests.

### Task 3: Document the server-only secret name

**Files:**
- Modify: `src/production-delivery.test.ts:19-33`
- Modify: `.env.example:1-13`

- [ ] **Step 1: Make the delivery manifest test fail first**

In `expectedEnvironmentExample`, insert this exact line after `DEEPSEEK_MODEL`:

```ts
'CLOUDFLARE_AI_GATEWAY_TOKEN=',
```

- [ ] **Step 2: Run the delivery test and verify the manifest mismatch**

Run:

```powershell
npx.cmd vitest run src/production-delivery.test.ts
```

Expected: FAIL in `documents only the approved server configuration names and safe defaults` because `.env.example` does not yet contain the new empty variable.

- [ ] **Step 3: Add only the empty variable name to `.env.example`**

The first four lines of `.env.example` must become:

```dotenv
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
CLOUDFLARE_AI_GATEWAY_TOKEN=
```

Do not place a real Cloudflare token in this file or in any other tracked file.

- [ ] **Step 4: Run the delivery test and secret scan**

Run:

```powershell
npx.cmd vitest run src/production-delivery.test.ts
```

Expected: PASS, including the exact environment manifest, tracked-file secret scan, Cloudflare Function graph boundary, and Pages delivery checks.

- [ ] **Step 5: Commit the environment manifest**

```powershell
git add .env.example src/production-delivery.test.ts
git commit -m "docs: declare AI Gateway runtime secret"
```

Expected: no secret values in the diff.

### Task 4: Verify the complete local application

**Files:**
- Test only: all tracked source, generated knowledge, generated portfolio pages, and production assets

- [ ] **Step 1: Run the complete unit and integration suite**

Run:

```powershell
npm.cmd test
```

Expected: all test files and every test pass; the pre-change baseline was 36 files and 603 tests.

- [ ] **Step 2: Run the production build**

Run:

```powershell
npm.cmd run build
```

Expected:

```text
knowledge sources=8 chunks=139
projects=6 pages=135
```

TypeScript, Vite, and `scripts/check-client-bundle.ts` must all exit with code 0.

- [ ] **Step 3: Inspect the tracked diff and secret boundary**

Run:

```powershell
git diff --check
git status --short
git grep -n "CLOUDFLARE_AI_GATEWAY_TOKEN"
```

Expected:

- `git diff --check` emits no output.
- Only the planned code, tests, spec, plan, and empty `.env.example` name are changed or committed.
- Every occurrence of `CLOUDFLARE_AI_GATEWAY_TOKEN` is a variable name or test fixture; no real token appears.

- [ ] **Step 4: Confirm the plan and corrected design are already recorded**

```powershell
git log --oneline -- docs/superpowers/specs/2026-07-24-cloudflare-ai-gateway-dual-auth-design.md docs/superpowers/plans/2026-07-24-cloudflare-ai-gateway-dual-auth.md
```

Expected: the documentation commit created before implementation is present, and both files record `AI Gateway Run` as the runtime permission.

### Task 5: Create and store the dedicated Cloudflare runtime token

**Files:**
- Modify externally: Cloudflare AI Gateway authentication settings
- Modify externally: Cloudflare Pages encrypted Production Secrets
- Do not modify: tracked repository files

- [ ] **Step 1: Create the least-privileged runtime token in Cloudflare**

In the Cloudflare Dashboard:

1. Select the account that owns `portfolio-ai-chat-clean`.
2. Open `AI > AI Gateway`.
3. Select the `default` Gateway.
4. Open `Settings`.
5. In the authenticated Gateway section, choose `Create authentication token`.
6. Confirm the token has `Account / AI Gateway / Run`.
7. Confirm `Authenticated Gateway` is enabled.
8. Save the token in the user's password manager because Cloudflare shows it only once.

Do not grant `AI Gateway Edit` or `Workers AI Edit` to this runtime token, and do not paste the token into Codex chat.

- [ ] **Step 2: Write the token through Wrangler's hidden interactive prompt**

From the repository worktree, run:

```powershell
npx.cmd --yes wrangler@latest pages secret put CLOUDFLARE_AI_GATEWAY_TOKEN --project-name portfolio-ai-chat-clean
```

At `Enter a secret value:`, paste the token directly into the terminal and submit it. The value must not be placed in the command itself, a shell variable, `.env.local`, a screenshot, or the chat.

Expected: Wrangler confirms that `CLOUDFLARE_AI_GATEWAY_TOKEN` was created or updated for the Pages project.

- [ ] **Step 3: Verify the secret name without reading its value**

Run:

```powershell
npx.cmd --yes wrangler@latest pages secret list --project-name portfolio-ai-chat-clean
```

Expected: the output includes the name `CLOUDFLARE_AI_GATEWAY_TOKEN`; no value is displayed.

### Task 6: Push, deploy, and verify real production SSE

**Files:**
- Create temporarily: `.chat-verification.json`
- Delete before completion: `.chat-verification.json`
- Modify externally: GitHub branch and Cloudflare Pages production deployment

- [ ] **Step 1: Record the exact source state**

Run:

```powershell
git status --short
git rev-parse HEAD
git log -5 --oneline
```

Expected: the worktree is clean and the displayed commit includes all Task 1–5 repository changes.

- [ ] **Step 2: Push the implementation branch**

Run in the network environment already used successfully for this repository:

```powershell
$env:HTTPS_PROXY = "http://127.0.0.1:12334"
$env:HTTP_PROXY = "http://127.0.0.1:12334"
git push origin feature/portfolio-ai-chat-clean
Remove-Item Env:HTTPS_PROXY
Remove-Item Env:HTTP_PROXY
```

Expected: GitHub advances `feature/portfolio-ai-chat-clean` to the exact local commit. Do not persist the temporary proxy in Git configuration.

- [ ] **Step 3: Deploy that exact source state to Cloudflare Pages**

Run:

```powershell
npx.cmd --yes wrangler@latest pages deploy dist --project-name portfolio-ai-chat-clean --branch feature/portfolio-ai-chat-clean --commit-hash $(git rev-parse HEAD) --commit-message "Restore authenticated portfolio chat"
```

Expected: Wrangler returns a new deployment URL under `portfolio-ai-chat-clean.pages.dev`, the deployment list classifies it as `Production`, and the canonical production domain points to the new deployment. This Pages project currently defines `feature/portfolio-ai-chat-clean` as its Production branch; deploying `main` creates only a Preview.

- [ ] **Step 4: Create a non-secret production request fixture**

Create `.chat-verification.json` with exactly:

```json
{
  "message": "请用网站资料介绍赵实旷最具代表性的一个项目。",
  "history": [],
  "sessionId": "production_verification_20260724",
  "locale": "zh-CN"
}
```

- [ ] **Step 5: Send the real same-origin chat request**

Run:

```powershell
curl.exe --no-buffer --fail-with-body `
  -H "Origin: https://portfolio-ai-chat-clean.pages.dev" `
  -H "Content-Type: application/json" `
  --data-binary "@.chat-verification.json" `
  "https://portfolio-ai-chat-clean.pages.dev/api/chat"
```

Expected:

- HTTP content type is `text/event-stream`.
- The stream contains `start`, at least one non-empty `delta`, `sources`, and `done`.
- The stream does not contain `chat_disabled` or `upstream_unavailable`.
- No response contains either credential.

- [ ] **Step 6: Inspect sanitized production logs**

In a second terminal, run during one verification request:

```powershell
npx.cmd --yes wrangler@latest pages deployment tail --project-name portfolio-ai-chat-clean --environment production
```

Expected: no `portfolio_chat_upstream_failure` event for the successful request and no URL, request header, token, prompt, or provider response body in logs.

- [ ] **Step 7: Remove the request fixture and finish clean**

Delete `.chat-verification.json`, then run:

```powershell
git status --short
```

Expected: the worktree is clean.

- [ ] **Step 8: Apply the explicit stop condition if production still fails**

If the real request still returns `upstream_unavailable`, stop this implementation without expanding token permissions, exposing credentials, switching models, or silently routing elsewhere. Preserve the functioning static portfolio and begin a separate Vercel Production API fallback design based on the sanitized HTTP category and Cloudflare request logs.
