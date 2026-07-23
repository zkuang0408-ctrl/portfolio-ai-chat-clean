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

const env = {
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
  const options = mocks.createRuntime.mock.calls[0]?.[0] as {
    env: typeof env;
    ipAddress(request: Request): string | undefined;
    providerFailure(category: string): void;
  };

  expect(response.headers.get("content-type")).toBe("text/event-stream");
  expect(options.env).toBe(env);
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
  expect(mocks.handle).toHaveBeenCalledTimes(2);
});
