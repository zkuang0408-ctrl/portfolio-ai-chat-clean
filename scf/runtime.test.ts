// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const handle = vi.fn(async () => new Response(null, { status: 204 }));
  return {
    handle,
    createRuntime: vi.fn((_options: unknown) => ({
      enabled: true,
      handle,
    })),
  };
});

vi.mock("../src/chat/server/runtime.js", () => ({
  createRuntime: mocks.createRuntime,
}));

import { createScfRuntime } from "./runtime";
import type {
  ChatRuntimeFailure,
} from "../src/chat/server/chat-handler";

const environment = {
  CHAT_ENABLED: "true",
  CHAT_ALLOWED_ORIGINS:
    "https://portfolio-ai-chat-clean.pages.dev",
  TENCENT_TOKENHUB_API_KEY: "tokenhub-test-key",
  DEEPSEEK_API_KEY: "legacy-key-must-not-cross",
  DEEPSEEK_BASE_URL: "https://legacy.example/v1",
  DEEPSEEK_MODEL: "legacy-model",
  CLOUDFLARE_AI_GATEWAY_TOKEN: "legacy-gateway-token",
  RATE_LIMIT_KV_URL: "https://example.upstash.io",
  RATE_LIMIT_KV_TOKEN: "redis-token",
  RATE_LIMIT_SALT:
    "a-runtime-salt-that-is-at-least-thirty-two-bytes",
};

type RuntimeOptionsCapture = {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly allowedOrigins?: readonly string[];
  readonly providerFailure?: (category: string) => void;
  readonly runtimeFailure?: (
    failure: ChatRuntimeFailure,
  ) => void;
};

beforeEach(() => {
  mocks.createRuntime.mockClear();
  mocks.handle.mockClear();
});

describe("createScfRuntime", () => {
  test("maps only the dedicated TokenHub configuration", () => {
    const configured = createScfRuntime(environment);
    const options =
      mocks.createRuntime.mock.calls[0]?.[0] as RuntimeOptionsCapture;

    expect(configured.allowedOrigins).toEqual([
      "https://portfolio-ai-chat-clean.pages.dev",
    ]);
    expect(options.env).toEqual({
      CHAT_ENABLED: "true",
      DEEPSEEK_API_KEY: "tokenhub-test-key",
      DEEPSEEK_BASE_URL: "https://tokenhub.tencentmaas.com/v1",
      DEEPSEEK_MODEL: "deepseek-v4-flash-202605",
      RATE_LIMIT_KV_URL: "https://example.upstash.io",
      RATE_LIMIT_KV_TOKEN: "redis-token",
      RATE_LIMIT_SALT:
        "a-runtime-salt-that-is-at-least-thirty-two-bytes",
    });
    expect(options.allowedOrigins).toEqual(
      configured.allowedOrigins,
    );
    expect(options).not.toHaveProperty("ipAddress");
  });

  test.each([
    [
      "tokenhub_key",
      { ...environment, TENCENT_TOKENHUB_API_KEY: "" },
    ],
    [
      "allowed_origins",
      { ...environment, CHAT_ALLOWED_ORIGINS: "*" },
    ],
  ])("fails closed for %s", (category, source) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const configured = createScfRuntime(source);
      const options =
        mocks.createRuntime.mock.calls[0]?.[0] as RuntimeOptionsCapture;

      expect(configured.allowedOrigins).toEqual(
        category === "allowed_origins"
          ? []
          : ["https://portfolio-ai-chat-clean.pages.dev"],
      );
      expect(options.env).toEqual({
        CHAT_ENABLED: "false",
        RATE_LIMIT_KV_URL: "https://example.upstash.io",
        RATE_LIMIT_KV_TOKEN: "redis-token",
        RATE_LIMIT_SALT:
          "a-runtime-salt-that-is-at-least-thirty-two-bytes",
      });
      expect(warn).toHaveBeenCalledWith(JSON.stringify({
        event: "portfolio_chat_configuration_failure",
        category,
      }));
      const logged = warn.mock.calls.flat().join("\n");
      expect(logged).not.toContain("tokenhub-test-key");
      expect(logged).not.toContain("redis-token");
    } finally {
      warn.mockRestore();
    }
  });

  test("logs provider failures with fixed fields only", () => {
    createScfRuntime(environment);
    const options =
      mocks.createRuntime.mock.calls[0]?.[0] as RuntimeOptionsCapture;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      options.providerFailure?.("network");
      expect(warn).toHaveBeenCalledWith(JSON.stringify({
        event: "portfolio_chat_upstream_failure",
        category: "network",
      }));
    } finally {
      warn.mockRestore();
    }
  });

  test("logs runtime failures with fixed non-sensitive fields only", () => {
    createScfRuntime(environment);
    const options =
      mocks.createRuntime.mock.calls[0]?.[0] as RuntimeOptionsCapture;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      options.runtimeFailure?.({
        stage: "rate_limit",
        requestId:
          "16f2b048-89dc-11f1-9f14-525400ea158b",
      });
      expect(warn).toHaveBeenCalledWith(JSON.stringify({
        event: "portfolio_chat_runtime_failure",
        stage: "rate_limit",
        requestId:
          "16f2b048-89dc-11f1-9f14-525400ea158b",
      }));
      const logged = warn.mock.calls.flat().join("\n");
      expect(logged).not.toContain("redis-token");
      expect(logged).not.toContain("tokenhub-test-key");
      expect(logged).not.toContain("203.0.113.8");
    } finally {
      warn.mockRestore();
    }
  });
});
