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
});

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

test("reuses one runtime within a Cloudflare isolate", async () => {
  const { onRequest } = await import("./chat");
  const first = new Request("https://portfolio.test/api/chat", {
    method: "POST",
  });
  const second = new Request("https://portfolio.test/api/chat", {
    method: "POST",
  });

  await onRequest({ request: first, env });
  await onRequest({ request: second, env });

  expect(mocks.createRuntime).toHaveBeenCalledTimes(1);
  expect(getUrl).toHaveBeenCalledTimes(1);
  expect(mocks.handle).toHaveBeenCalledTimes(2);
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
    request: new Request("https://portfolio.test/api/chat", {
      method: "POST",
    }),
    env,
  });
  const second = onRequest({
    request: new Request("https://portfolio.test/api/chat", {
      method: "POST",
    }),
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
