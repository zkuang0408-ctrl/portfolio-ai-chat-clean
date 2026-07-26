// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const handle = vi.fn(async () =>
    new Response("stream", {
      headers: { "content-type": "text/event-stream" },
    }),
  );
  return {
    handle,
    createRuntime: vi.fn((_options: unknown) => ({ enabled: true, handle })),
  };
});

vi.mock("../../src/chat/server/runtime.js", () => ({
  createRuntime: mocks.createRuntime,
}));

const getUrl = vi.fn(async () => "https://binding-sentinel.example/v1");
const gateway = vi.fn(() => ({ getUrl }));
const tokenHubKey = "tokenhub-unit-test-key";
const configurationFailure = JSON.stringify({
  event: "portfolio_chat_configuration_failure",
  category: "tokenhub_key",
});

const env = {
  AI: { gateway },
  CHAT_ENABLED: "true",
  TENCENT_TOKENHUB_API_KEY: tokenHubKey,
  DEEPSEEK_API_KEY: "legacy-deepseek-key-sentinel",
  DEEPSEEK_BASE_URL: "https://legacy-deepseek.example/v1",
  DEEPSEEK_MODEL: "legacy-deepseek-model",
  CLOUDFLARE_AI_GATEWAY_TOKEN: "cloudflare-gateway-token-sentinel",
  RATE_LIMIT_KV_URL: "https://example.upstash.io",
  RATE_LIMIT_KV_TOKEN: "test-token",
  RATE_LIMIT_SALT: "a-runtime-salt-that-is-at-least-thirty-two-bytes",
};

type RuntimeOptionsCapture = {
  env: Readonly<Record<string, string | undefined>>;
  ipAddress(request: Request): string | undefined;
  providerFailure(category: string): void;
};

function runtimeOptions(): RuntimeOptionsCapture {
  return mocks.createRuntime.mock.calls[0]?.[0] as RuntimeOptionsCapture;
}

function expectNoProviderSecrets(
  options: RuntimeOptionsCapture,
): void {
  expect(options.env).not.toHaveProperty("AI");
  expect(options.env).not.toHaveProperty("TENCENT_TOKENHUB_API_KEY");
  expect(options.env).not.toHaveProperty("DEEPSEEK_API_KEY");
  expect(options.env).not.toHaveProperty("DEEPSEEK_BASE_URL");
  expect(options.env).not.toHaveProperty("DEEPSEEK_MODEL");
  expect(options.env).not.toHaveProperty("CLOUDFLARE_AI_GATEWAY_TOKEN");
}

beforeEach(() => {
  vi.resetModules();
  mocks.createRuntime.mockClear();
  mocks.handle.mockClear();
  gateway.mockClear();
  getUrl.mockClear();
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
  expect(mocks.createRuntime).not.toHaveBeenCalled();
  expect(gateway).not.toHaveBeenCalled();
});

test("routes chat through the dedicated TokenHub credential", async () => {
  const { onRequest } = await import("./chat");
  const request = new Request("https://portfolio.test/api/chat", {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.10" },
  });
  const response = await onRequest({ request, env });
  const options = runtimeOptions();

  expect(response.headers.get("content-type")).toBe("text/event-stream");
  expect(gateway).not.toHaveBeenCalled();
  expect(getUrl).not.toHaveBeenCalled();
  expect(options.env).toEqual({
    CHAT_ENABLED: "true",
    DEEPSEEK_API_KEY: tokenHubKey,
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

test.each([
  ["missing", undefined],
  ["empty", ""],
  ["leading whitespace", ` ${tokenHubKey}`],
  ["too long", "x".repeat(4_097)],
  ["newline", "key\nvalue"],
  ["control", "key\u0007value"],
  ["non-ASCII", "密钥"],
])("fails closed and logs safely for a %s TokenHub key", async (_label, key) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const { onRequest } = await import("./chat");
    await onRequest({
      request: new Request("https://portfolio.test/api/chat", { method: "POST" }),
      env: { ...env, TENCENT_TOKENHUB_API_KEY: key },
    });

    const options = runtimeOptions();
    expect(options.env).toEqual({
      CHAT_ENABLED: "false",
      RATE_LIMIT_KV_URL: "https://example.upstash.io",
      RATE_LIMIT_KV_TOKEN: "test-token",
      RATE_LIMIT_SALT: "a-runtime-salt-that-is-at-least-thirty-two-bytes",
    });
    expectNoProviderSecrets(options);
    expect(gateway).not.toHaveBeenCalled();
    expect(getUrl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(configurationFailure);
    for (const [message] of warn.mock.calls) {
      if (key) expect(String(message)).not.toContain(key);
      expect(String(message)).not.toContain("tokenhub.tencentmaas.com");
    }
  } finally {
    warn.mockRestore();
  }
});

test("does not enable TokenHub with legacy provider credentials alone", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const { onRequest } = await import("./chat");
    await onRequest({
      request: new Request("https://portfolio.test/api/chat", { method: "POST" }),
      env: { ...env, TENCENT_TOKENHUB_API_KEY: undefined },
    });

    const options = runtimeOptions();
    expect(options.env.CHAT_ENABLED).toBe("false");
    expectNoProviderSecrets(options);
    expect(gateway).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(configurationFailure);
  } finally {
    warn.mockRestore();
  }
});

test("reuses one runtime within a Cloudflare isolate", async () => {
  const { onRequest } = await import("./chat");
  const first = new Request("https://portfolio.test/api/chat", { method: "POST" });
  const second = new Request("https://portfolio.test/api/chat", { method: "POST" });

  await onRequest({ request: first, env });
  await onRequest({ request: second, env });

  expect(mocks.createRuntime).toHaveBeenCalledTimes(1);
  expect(gateway).not.toHaveBeenCalled();
  expect(getUrl).not.toHaveBeenCalled();
  expect(mocks.handle).toHaveBeenCalledTimes(2);
});

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
