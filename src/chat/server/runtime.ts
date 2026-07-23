import generatedIndexJson from "../knowledge/generated-index.json" with { type: "json" };
import type { GeneratedKnowledgeIndex } from "../knowledge/types.js";
import { createLocalHybridRetriever } from "../retrieval/local-hybrid.js";
import type { Retriever } from "../retrieval/retriever.js";
import {
  handleChat,
  type ChatHandlerDependencies,
  type ChatMetricsSink,
} from "./chat-handler.js";
import type { ChatProvider, PublicChatError } from "./chat-types.js";
import {
  DEFAULT_DEEPSEEK_BASE_URL,
  DeepSeekProvider,
  type DeepSeekProviderErrorCategory,
  type DeepSeekProviderOptions,
  isApprovedDeepSeekBaseUrl,
  isCloudflareDeepSeekBaseUrl,
} from "./deepseek-provider.js";
import {
  createUpstashRateLimitStore,
  type CreateUpstashRateLimitStoreOptions,
  type RateLimitStore,
} from "./rate-limit.js";

const generatedIndex = generatedIndexJson as GeneratedKnowledgeIndex;
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_TOKENS = 700;
const DEFAULT_SITE_DAY_LIMIT = 300;
const DEFAULT_VISITOR_DAY_LIMIT = 30;
const DEFAULT_VISITOR_MINUTE_LIMIT = 6;
const DEFAULT_COOLDOWN_SECONDS = 3;
const MAX_SITE_DAY_LIMIT = 100_000;
const MAX_VISITOR_DAY_LIMIT = 10_000;
const MAX_VISITOR_MINUTE_LIMIT = 1_000;
const MAX_COOLDOWN_SECONDS = 3_600;
const noopMetrics: ChatMetricsSink = { record() {} };

export interface RuntimeFactories {
  readonly createRetriever: (index: GeneratedKnowledgeIndex) => Retriever;
  readonly createProvider: (options: DeepSeekProviderOptions) => ChatProvider;
  readonly createRateLimitStore: (
    options: CreateUpstashRateLimitStoreOptions,
  ) => RateLimitStore;
}

export interface RuntimeOptions {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly factories?: RuntimeFactories;
  readonly ipAddress?: (request: Request) => string | undefined;
  readonly clock?: () => number;
  readonly requestId?: () => string;
  readonly metrics?: ChatMetricsSink;
  readonly providerFailure?: (
    category: DeepSeekProviderErrorCategory | "unknown",
  ) => void;
}

export interface ChatRuntime {
  readonly enabled: boolean;
  readonly handle: (request: Request) => Promise<Response>;
}

interface RuntimeConfig {
  readonly apiKey: string;
  readonly gatewayToken?: string;
  readonly baseUrl: string;
  readonly kvUrl: string;
  readonly kvToken: string;
  readonly salt: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxTokens: number;
  readonly siteDayLimit: number;
  readonly visitorDayLimit: number;
  readonly visitorMinuteLimit: number;
  readonly cooldownMs: number;
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

function serverToken(value: string | undefined): string | undefined {
  const token = required(value);
  return token && token.length <= 4_096 && /^[\x21-\x7e]+$/.test(token)
    ? token
    : undefined;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
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
  const kvUrlValue = required(env.RATE_LIMIT_KV_URL);
  const kvToken = required(env.RATE_LIMIT_KV_TOKEN);
  const salt = required(env.RATE_LIMIT_SALT);
  const baseUrl =
    env.DEEPSEEK_BASE_URL === undefined || env.DEEPSEEK_BASE_URL === ""
      ? DEFAULT_DEEPSEEK_BASE_URL
      : env.DEEPSEEK_BASE_URL.trim();
  const usesCloudflareGateway = isCloudflareDeepSeekBaseUrl(baseUrl);
  const gatewayToken = usesCloudflareGateway
    ? serverToken(env.CLOUDFLARE_AI_GATEWAY_TOKEN)
    : undefined;
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
  const siteDayLimit = positiveInteger(
    env.CHAT_SITE_DAILY_LIMIT,
    DEFAULT_SITE_DAY_LIMIT,
    MAX_SITE_DAY_LIMIT,
  );
  const visitorDayLimit = positiveInteger(
    env.CHAT_VISITOR_DAILY_LIMIT,
    DEFAULT_VISITOR_DAY_LIMIT,
    MAX_VISITOR_DAY_LIMIT,
  );
  const visitorMinuteLimit = positiveInteger(
    env.CHAT_VISITOR_MINUTE_LIMIT,
    DEFAULT_VISITOR_MINUTE_LIMIT,
    MAX_VISITOR_MINUTE_LIMIT,
  );
  const cooldownSeconds = positiveInteger(
    env.CHAT_COOLDOWN_SECONDS,
    DEFAULT_COOLDOWN_SECONDS,
    MAX_COOLDOWN_SECONDS,
  );
  let kvUrl: URL;
  try {
    kvUrl = new URL(kvUrlValue ?? "");
  } catch {
    return undefined;
  }
  if (
    !apiKey ||
    !isApprovedDeepSeekBaseUrl(baseUrl) ||
    (usesCloudflareGateway && !gatewayToken) ||
    !kvToken ||
    !salt ||
    utf8ByteLength(salt) < 32 ||
    kvUrl.protocol !== "https:" ||
    kvUrl.username !== "" ||
    kvUrl.password !== "" ||
    kvUrl.pathname !== "/" ||
    kvUrl.search !== "" ||
    kvUrl.hash !== "" ||
    kvUrl.href !== `${kvUrl.origin}/` ||
    !timeoutMs ||
    !maxTokens ||
    !siteDayLimit ||
    !visitorDayLimit ||
    !visitorMinuteLimit ||
    !cooldownSeconds ||
    visitorMinuteLimit > visitorDayLimit ||
    visitorDayLimit > siteDayLimit
  ) {
    return undefined;
  }
  return {
    apiKey,
    ...(gatewayToken === undefined ? {} : { gatewayToken }),
    baseUrl,
    kvUrl: kvUrl.origin,
    kvToken,
    salt,
    model,
    timeoutMs,
    maxTokens,
    siteDayLimit,
    visitorDayLimit,
    visitorMinuteLimit,
    cooldownMs: cooldownSeconds * 1_000,
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

export function createRuntime(options: RuntimeOptions): ChatRuntime {
  const config = parseConfig(options.env);
  if (!config) return disabledRuntime();

  try {
    const factories = options.factories ?? defaultFactories();
    const dependencies: ChatHandlerDependencies = {
      retriever: factories.createRetriever(generatedIndex),
      provider: factories.createProvider({
        apiKey: config.apiKey,
        ...(config.gatewayToken === undefined
          ? {}
          : { gatewayToken: config.gatewayToken }),
        baseUrl: config.baseUrl,
        model: config.model,
        timeoutMs: config.timeoutMs,
        maxTokens: config.maxTokens,
      }),
      rateLimit: factories.createRateLimitStore({
        url: config.kvUrl,
        token: config.kvToken,
        cooldownMs: config.cooldownMs,
        minuteLimit: config.visitorMinuteLimit,
        visitorDayLimit: config.visitorDayLimit,
        siteDayLimit: config.siteDayLimit,
      }),
      rateLimitSalt: config.salt,
      profileFacts: structuredProfileFacts(generatedIndex),
      ipAddress: options.ipAddress ?? (() => undefined),
      clock: options.clock ?? Date.now,
      requestId: options.requestId ?? (() => globalThis.crypto.randomUUID()),
      metrics: options.metrics ?? noopMetrics,
      providerFailure: options.providerFailure ?? (() => {}),
    };
    return {
      enabled: true,
      handle: (request) => handleChat(request, dependencies),
    };
  } catch {
    return disabledRuntime();
  }
}
