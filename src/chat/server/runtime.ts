import { randomUUID } from "node:crypto";

import { ipAddress as vercelIpAddress } from "@vercel/functions/headers";

import generatedIndexJson from "../knowledge/generated-index.json";
import type { GeneratedKnowledgeIndex } from "../knowledge/types";
import { createLocalHybridRetriever } from "../retrieval/local-hybrid";
import type { Retriever } from "../retrieval/retriever";
import {
  handleChat,
  type ChatHandlerDependencies,
  type ChatMetricsSink,
} from "./chat-handler";
import type { ChatProvider, PublicChatError } from "./chat-types";
import {
  DeepSeekProvider,
  type DeepSeekProviderOptions,
} from "./deepseek-provider";
import {
  createUpstashRateLimitStore,
  type CreateUpstashRateLimitStoreOptions,
  type RateLimitStore,
} from "./rate-limit";

const generatedIndex = generatedIndexJson as GeneratedKnowledgeIndex;
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_TOKENS = 700;
const noopMetrics: ChatMetricsSink = { record() {} };

export interface RuntimeFactories {
  readonly createRetriever: (index: GeneratedKnowledgeIndex) => Retriever;
  readonly createProvider: (options: DeepSeekProviderOptions) => ChatProvider;
  readonly createRateLimitStore: (
    options: CreateUpstashRateLimitStoreOptions,
  ) => RateLimitStore;
}

export interface RuntimeOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly factories?: RuntimeFactories;
  readonly ipAddress?: (request: Request) => string | undefined;
  readonly clock?: () => number;
  readonly requestId?: () => string;
  readonly metrics?: ChatMetricsSink;
}

export interface ChatRuntime {
  readonly enabled: boolean;
  readonly handle: (request: Request) => Promise<Response>;
}

interface RuntimeConfig {
  readonly apiKey: string;
  readonly kvUrl: string;
  readonly kvToken: string;
  readonly salt: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxTokens: number;
}

function disabledResponse(): Response {
  const error: PublicChatError = {
    code: "chat_disabled",
    message: "The portfolio assistant is temporarily unavailable.",
    retryable: false,
  };
  return Response.json(
    { error },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}

function disabledRuntime(): ChatRuntime {
  return { enabled: false, handle: async () => disabledResponse() };
}

function required(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number | undefined {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum
    ? parsed
    : undefined;
}

function parseConfig(
  env: Readonly<Record<string, string | undefined>>,
): RuntimeConfig | undefined {
  if (env.CHAT_ENABLED !== "true") return undefined;
  const apiKey = required(env.DEEPSEEK_API_KEY);
  const kvToken = required(env.RATE_LIMIT_KV_TOKEN);
  const salt = required(env.RATE_LIMIT_SALT);
  const model = required(env.DEEPSEEK_MODEL) ?? DEFAULT_MODEL;
  const timeoutMs = positiveInteger(
    env.CHAT_UPSTREAM_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    120_000,
  );
  const maxTokens = positiveInteger(
    env.CHAT_MAX_OUTPUT_TOKENS,
    DEFAULT_MAX_TOKENS,
    4_096,
  );
  let kvUrl: URL;
  try {
    kvUrl = new URL(env.RATE_LIMIT_KV_URL ?? "");
  } catch {
    return undefined;
  }
  if (
    !apiKey ||
    !kvToken ||
    !salt ||
    Buffer.byteLength(salt, "utf8") < 32 ||
    kvUrl.protocol !== "https:" ||
    kvUrl.username !== "" ||
    kvUrl.password !== "" ||
    !timeoutMs ||
    !maxTokens
  ) {
    return undefined;
  }
  return {
    apiKey,
    kvUrl: kvUrl.toString().replace(/\/$/, ""),
    kvToken,
    salt,
    model,
    timeoutMs,
    maxTokens,
  };
}

function defaultFactories(): RuntimeFactories {
  return {
    createRetriever: (index) => createLocalHybridRetriever(index),
    createProvider: (options) => new DeepSeekProvider(options),
    createRateLimitStore: (options) => createUpstashRateLimitStore(options),
  };
}

function structuredProfileFacts(index: GeneratedKnowledgeIndex): readonly string[] {
  return index.chunks
    .filter(({ sourceId }) => sourceId === "profile")
    .map(({ text }) => text)
    .filter((text) => text.trim().length > 0);
}

export function createRuntime(options: RuntimeOptions = {}): ChatRuntime {
  // Environment access deliberately occurs only when this factory is invoked.
  const env = options.env ?? process.env;
  const config = parseConfig(env);
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
      }),
      rateLimitSalt: config.salt,
      profileFacts: structuredProfileFacts(generatedIndex),
      ipAddress: options.ipAddress ?? ((request) => vercelIpAddress(request)),
      clock: options.clock ?? Date.now,
      requestId: options.requestId ?? randomUUID,
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
