// @vitest-environment node

import { describe, expect, test, vi } from "vitest";

import type { GeneratedKnowledgeIndex } from "../knowledge/types";
import type { Retriever } from "../retrieval/retriever";
import type { ChatProvider } from "./chat-types";
import type { RateLimitStore } from "./rate-limit";
import { createRuntime, type RuntimeFactories } from "./runtime";

const validEnv = {
  CHAT_ENABLED: "true",
  DEEPSEEK_API_KEY: "replacement-key-kept-outside-source-control",
  RATE_LIMIT_KV_URL: "https://example.upstash.io",
  RATE_LIMIT_KV_TOKEN: "upstash-token",
  RATE_LIMIT_SALT: "a-runtime-salt-that-is-at-least-thirty-two-bytes",
};

function validRequest(): Request {
  return new Request("https://portfolio.test/api/chat", {
    method: "POST",
    headers: {
      origin: "https://portfolio.test",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: "totally unrelated query",
      history: [],
      sessionId: "session_123",
      locale: "en",
    }),
  });
}

function factories(captures: {
  index?: GeneratedKnowledgeIndex;
  profileFacts?: readonly string[];
  providerOptions?: unknown;
  rateOptions?: unknown;
}): RuntimeFactories {
  const retriever: Retriever = { search: vi.fn(async () => []) };
  const provider: ChatProvider = {
    async *stream() {
      throw new Error("provider must not run for no result");
    },
  };
  const rateLimit: RateLimitStore = {
    consume: vi.fn(async () => ({ allowed: true, resetAt: 1_786_000_003_000 })),
  };
  return {
    createRetriever(index) {
      captures.index = index;
      return retriever;
    },
    createProvider(options) {
      captures.providerOptions = options;
      return provider;
    },
    createRateLimitStore(options) {
      captures.rateOptions = options;
      return rateLimit;
    },
  };
}

describe("createRuntime", () => {
  test("returns a generic disabled state when chat is explicitly disabled", async () => {
    const createRetriever = vi.fn();
    const runtime = createRuntime({
      env: { CHAT_ENABLED: "false" },
      factories: {
        createRetriever,
        createProvider: vi.fn(),
        createRateLimitStore: vi.fn(),
      },
    });

    expect(runtime.enabled).toBe(false);
    const response = await runtime.handle(validRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "chat_disabled", message: expect.any(String), retryable: false },
    });
    expect(createRetriever).not.toHaveBeenCalled();
  });

  test.each([
    ["missing key", { ...validEnv, DEEPSEEK_API_KEY: "" }],
    ["invalid kv URL", { ...validEnv, RATE_LIMIT_KV_URL: "http://localhost:9999" }],
    ["missing kv token", { ...validEnv, RATE_LIMIT_KV_TOKEN: "" }],
    ["short salt", { ...validEnv, RATE_LIMIT_SALT: "short" }],
    ["invalid enable flag", { ...validEnv, CHAT_ENABLED: "yes" }],
  ])("fails closed without configuration detail for %s", async (_name, env) => {
    const runtime = createRuntime({ env });
    const response = await runtime.handle(validRequest());
    const serialized = await response.text();

    expect(runtime.enabled).toBe(false);
    expect(response.status).toBe(503);
    expect(serialized).toContain("chat_disabled");
    for (const value of Object.values(env)) {
      if (value) expect(serialized).not.toContain(value);
    }
  });

  test("wires the committed generated index and safe profile evidence without network access", async () => {
    const captures: Parameters<typeof factories>[0] = {};
    const runtime = createRuntime({
      env: validEnv,
      factories: factories(captures),
      ipAddress: () => "203.0.113.8",
      clock: () => 1_786_000_000_000,
      requestId: () => "request_12345678",
    });

    expect(runtime.enabled).toBe(true);
    expect(captures.index?.chunks.length).toBeGreaterThan(100);
    expect(captures.index?.chunks.some(({ sourceId }) => sourceId === "profile")).toBe(true);
    expect(captures.providerOptions).toMatchObject({
      apiKey: validEnv.DEEPSEEK_API_KEY,
      model: "deepseek-v4-flash",
      timeoutMs: 45_000,
      maxTokens: 700,
    });
    expect(captures.rateOptions).toEqual({
      url: validEnv.RATE_LIMIT_KV_URL,
      token: validEnv.RATE_LIMIT_KV_TOKEN,
    });

    const response = await runtime.handle(validRequest());
    const stream = await response.text();
    expect(stream).toContain("I could not find enough portfolio evidence");
    expect(stream).not.toContain("赵实旷是");
  });

  test("passes safe optional DeepSeek configuration only after strict parsing", () => {
    const captures: Parameters<typeof factories>[0] = {};
    const runtime = createRuntime({
      env: {
        ...validEnv,
        DEEPSEEK_MODEL: "deepseek-custom",
        CHAT_MAX_OUTPUT_TOKENS: "512",
        CHAT_UPSTREAM_TIMEOUT_MS: "30000",
      },
      factories: factories(captures),
    });

    expect(runtime.enabled).toBe(true);
    expect(captures.providerOptions).toMatchObject({
      model: "deepseek-custom",
      maxTokens: 512,
      timeoutMs: 30_000,
    });
  });

  test.each([
    { CHAT_MAX_OUTPUT_TOKENS: "0" },
    { CHAT_MAX_OUTPUT_TOKENS: "12.5" },
    { CHAT_UPSTREAM_TIMEOUT_MS: "NaN" },
    { CHAT_UPSTREAM_TIMEOUT_MS: "120001" },
  ])("fails closed for invalid optional numeric configuration %#", (extra) => {
    expect(createRuntime({ env: { ...validEnv, ...extra } }).enabled).toBe(false);
  });
});
