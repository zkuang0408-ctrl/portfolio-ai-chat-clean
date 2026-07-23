import type { Retriever, SearchResult } from "../retrieval/retriever.js";
import type {
  ChatLocale,
  ChatProvider,
  ChatStreamEvent,
  PublicChatError,
  PublicChatErrorCode,
  PublicChatSource,
  SourceMarker,
} from "./chat-types.js";
import { createCitationParser } from "./citations.js";
import {
  DeepSeekProviderError,
  type DeepSeekProviderErrorCategory,
} from "./deepseek-provider.js";
import { buildGroundedPrompt } from "./prompt.js";
import type { RateLimitStore } from "./rate-limit.js";
import { deriveVisitorKey } from "./rate-limit.js";
import {
  ChatValidationError,
  MAX_CHAT_BODY_BYTES,
  parseChatBody,
  validateChatRequestContext,
} from "./validation.js";

export type ChatMetricStatus =
  | "success"
  | "no_result"
  | "rejected"
  | "rate_limited"
  | "failure";

export interface ChatMetric {
  readonly status: ChatMetricStatus;
  readonly latencyMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly retrievalCount: number;
}

export interface ChatMetricsSink {
  record(metric: ChatMetric): void | Promise<void>;
}

export interface ChatHandlerDependencies {
  readonly retriever: Retriever;
  readonly provider: ChatProvider;
  readonly rateLimit: RateLimitStore;
  readonly rateLimitSalt: string;
  readonly profileFacts: readonly string[];
  readonly ipAddress: (request: Request) => string | undefined;
  readonly clock: () => number;
  readonly requestId: () => string;
  metrics: ChatMetricsSink;
  readonly providerFailure: (
    category: DeepSeekProviderErrorCategory | "unknown",
  ) => void;
}

const encoder = new TextEncoder();
const EMPTY_METRIC_COUNTS = {
  inputTokens: 0,
  outputTokens: 0,
  retrievalCount: 0,
} as const;

const PUBLIC_MESSAGES: Readonly<Record<PublicChatErrorCode, string>> = {
  method_not_allowed: "Only POST requests are supported.",
  cross_origin_request: "This request origin is not allowed.",
  unsupported_content_type: "The request must use application/json.",
  body_too_large: "The request is too large.",
  invalid_body: "The request could not be read.",
  empty_message: "Please enter a question.",
  message_too_long: "The question is too long.",
  invalid_session_id: "The chat session is invalid.",
  invalid_history: "The chat history is invalid.",
  invalid_history_role: "The chat history is invalid.",
  history_message_too_long: "The chat history is too long.",
  invalid_locale: "The requested language is not supported.",
  rate_limited: "Too many requests. Please try again later.",
  chat_disabled: "The portfolio assistant is temporarily unavailable.",
  upstream_unavailable: "The portfolio assistant could not finish that answer. Please try again.",
  internal_error: "The portfolio assistant is temporarily unavailable.",
};

function errorPayload(
  code: PublicChatErrorCode,
  retryable: boolean,
): PublicChatError {
  return { code, message: PUBLIC_MESSAGES[code], retryable };
}

function jsonError(
  code: PublicChatErrorCode,
  status: number,
  retryable = false,
  headers: HeadersInit = {},
): Response {
  return Response.json(
    { error: errorPayload(code, retryable) },
    {
      status,
      headers: {
        "cache-control": "no-store",
        ...headers,
      },
    },
  );
}

function elapsed(clock: () => number, startedAt: number): number {
  const duration = clock() - startedAt;
  return Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : 0;
}

function recordMetric(
  sink: ChatMetricsSink,
  metric: ChatMetric,
): void {
  try {
    void Promise.resolve(sink.record(metric)).catch(() => {});
  } catch {
    // Observability must never change the public assistant outcome.
  }
}

function cancelStreamBestEffort(
  stream: ReadableStream<Uint8Array> | null,
): void {
  if (stream === null) return;
  try {
    void stream.cancel().catch(() => {});
  } catch {
    // Request cleanup must not replace the stable public outcome.
  }
}

function cancelReaderBestEffort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): void {
  try {
    void reader.cancel().catch(() => {});
  } catch {
    // Request cleanup must not replace the stable public outcome.
  }
}

function contentLength(request: Request): number | null | undefined {
  const value = request.headers.get("content-length");
  if (value === null) return null;
  if (!/^\d+$/.test(value)) return Number.NaN;
  return Number(value);
}

async function readBody(request: Request): Promise<{
  readonly text: string;
  readonly bodyBytes: number;
}> {
  if (request.body === null) return { text: "", bodyBytes: 0 };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bodyBytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      bodyBytes += item.value.byteLength;
      if (bodyBytes > MAX_CHAT_BODY_BYTES) {
        throw new ChatValidationError("body_too_large", 413);
      }
      chunks.push(item.value);
    }
  } catch (error) {
    cancelReaderBestEffort(reader);
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The validation outcome remains stable if stream cleanup fails.
    }
  }

  const bytes = new Uint8Array(bodyBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      bodyBytes,
    };
  } catch {
    throw new ChatValidationError("invalid_body", 400);
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ChatValidationError("invalid_body", 400);
  }
}

function serializeEvent(event: ChatStreamEvent): Uint8Array {
  return encoder.encode(
    `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`,
  );
}

function noResultCopy(locale: ChatLocale): string {
  return locale === "zh"
    ? "暂时没有找到足够的作品集资料来回答这个问题。你可以换个问法，或查看相关作品与公开简历。"
    : "I could not find enough portfolio evidence to answer that question. Try another wording, or explore the projects and public resume.";
}

function sseResponse(
  stream: ReadableStream<Uint8Array>,
): Response {
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-content-type-options": "nosniff",
    },
  });
}

function sourcesForIds(
  sources: readonly PublicChatSource[],
  ids: readonly SourceMarker[],
): readonly PublicChatSource[] {
  const byId = new Map(sources.map((source) => [source.id, source]));
  return ids
    .map((id) => byId.get(id))
    .filter((source): source is PublicChatSource => source !== undefined);
}

function createAnswerStream(input: {
  readonly locale: ChatLocale;
  readonly results: readonly SearchResult[];
  readonly visitorKey: string;
  readonly message: string;
  readonly history: Parameters<typeof buildGroundedPrompt>[0]["history"];
  readonly requestSignal: AbortSignal;
  readonly dependencies: ChatHandlerDependencies;
  readonly startedAt: number;
}): ReadableStream<Uint8Array> {
  let cancelled = false;
  let lifecycleFinished = false;
  const upstreamController = new AbortController();
  const abortUpstream = () => {
    if (!upstreamController.signal.aborted) {
      upstreamController.abort(new DOMException("The operation was aborted", "AbortError"));
    }
  };
  const abortFromRequest = () => abortUpstream();
  if (input.requestSignal.aborted) {
    abortUpstream();
  } else {
    input.requestSignal.addEventListener("abort", abortFromRequest, { once: true });
  }
  const finishLifecycle = () => {
    if (lifecycleFinished) return;
    lifecycleFinished = true;
    input.requestSignal.removeEventListener("abort", abortFromRequest);
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent): boolean => {
        if (cancelled) return false;
        try {
          controller.enqueue(serializeEvent(event));
          return true;
        } catch {
          cancelled = true;
          abortUpstream();
          return false;
        }
      };
      const close = () => {
        if (cancelled) return;
        try {
          controller.close();
        } catch {
          cancelled = true;
          abortUpstream();
        }
      };

      send({ type: "start", data: { locale: input.locale } });

      if (input.results.length === 0) {
        send({ type: "delta", data: { text: noResultCopy(input.locale) } });
        send({ type: "sources", data: { sources: [] } });
        send({ type: "done", data: {} });
        recordMetric(input.dependencies.metrics, {
          status: "no_result",
          latencyMs: elapsed(input.dependencies.clock, input.startedAt),
          ...EMPTY_METRIC_COUNTS,
        });
        close();
        finishLifecycle();
        return;
      }

      const prompt = buildGroundedPrompt({
        locale: input.locale,
        message: input.message,
        history: input.history,
        profileFacts: input.dependencies.profileFacts,
        results: input.results,
      });
      const allowedIds = new Set(prompt.sources.map(({ id }) => id));
      let inputTokens = 0;
      let outputTokens = 0;
      let visibleDeltaSent = false;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const parser = createCitationParser(allowedIds);
        let sawDone = false;
        let attemptHasMeaningfulText = false;
        let leadingVisible = "";
        let attemptInputTokens = 0;
        let attemptOutputTokens = 0;
        try {
          for await (const event of input.dependencies.provider.stream(
            {
              system: prompt.system,
              messages: prompt.messages,
              userId: input.visitorKey,
            },
            upstreamController.signal,
          )) {
            if (event.type === "delta") {
              const visible = parser.push(event.text);
              if (!attemptHasMeaningfulText) {
                leadingVisible += visible;
                if (hasMeaningfulText(leadingVisible)) {
                  attemptHasMeaningfulText = true;
                  visibleDeltaSent = true;
                  send({ type: "delta", data: { text: leadingVisible } });
                  leadingVisible = "";
                }
              } else if (visible.length > 0) {
                visibleDeltaSent = true;
                send({ type: "delta", data: { text: visible } });
              }
            } else if (event.type === "usage") {
              attemptInputTokens = event.inputTokens;
              attemptOutputTokens = event.outputTokens;
            } else {
              sawDone = true;
              break;
            }
          }
          if (!sawDone) throw new Error("provider stream ended without done");

          const finished = parser.finish();
          if (!attemptHasMeaningfulText) {
            leadingVisible += finished.text;
            if (hasMeaningfulText(leadingVisible)) {
              attemptHasMeaningfulText = true;
              visibleDeltaSent = true;
              send({ type: "delta", data: { text: leadingVisible } });
            }
          } else if (finished.text.length > 0) {
            send({ type: "delta", data: { text: finished.text } });
          }
          if (!attemptHasMeaningfulText) throw new EmptyProviderAnswerError();
          inputTokens = attemptInputTokens;
          outputTokens = attemptOutputTokens;
          const cited = sourcesForIds(prompt.sources, finished.sourceIds);
          const publicSources = cited.length > 0 ? cited : prompt.sources.slice(0, 2);
          send({ type: "sources", data: { sources: publicSources } });
          send({
            type: "done",
            data: {
              ...(inputTokens > 0 ? { inputTokens } : {}),
              ...(outputTokens > 0 ? { outputTokens } : {}),
            },
          });
          recordMetric(input.dependencies.metrics, {
            status: "success",
            latencyMs: elapsed(input.dependencies.clock, input.startedAt),
            inputTokens,
            outputTokens,
            retrievalCount: input.results.length,
          });
          close();
          finishLifecycle();
          return;
        } catch (error) {
          if (
            attempt === 0 &&
            !visibleDeltaSent &&
            isRetryableBeforeVisibleOutput(error) &&
            !upstreamController.signal.aborted &&
            !cancelled
          ) {
            continue;
          }

          try {
            input.dependencies.providerFailure(
              error instanceof DeepSeekProviderError
                ? error.category
                : "unknown",
            );
          } catch {
            // Diagnostics must never change the visitor-facing response.
          }
          if (!cancelled && !upstreamController.signal.aborted) {
            send({
              type: "error",
              data: errorPayload("upstream_unavailable", true),
            });
          }
          recordMetric(input.dependencies.metrics, {
            status: "failure",
            latencyMs: elapsed(input.dependencies.clock, input.startedAt),
            inputTokens: 0,
            outputTokens: 0,
            retrievalCount: input.results.length,
          });
          close();
          finishLifecycle();
          return;
        }
      }
    },
    cancel() {
      cancelled = true;
      abortUpstream();
      finishLifecycle();
    },
  });
}

class EmptyProviderAnswerError extends Error {}

function hasMeaningfulText(value: string): boolean {
  return value.replace(/[\s\p{Cf}]/gu, "").length > 0;
}

function isRetryableBeforeVisibleOutput(error: unknown): boolean {
  if (error instanceof DeepSeekProviderError) return error.retryable;
  if (error instanceof DOMException && error.name === "AbortError") return false;
  return true;
}

export async function handleChat(
  request: Request,
  dependencies: ChatHandlerDependencies,
): Promise<Response> {
  const startedAt = dependencies.clock();
  if (request.method !== "POST") {
    cancelStreamBestEffort(request.body);
    recordMetric(dependencies.metrics, {
      status: "rejected",
      latencyMs: elapsed(dependencies.clock, startedAt),
      ...EMPTY_METRIC_COUNTS,
    });
    return jsonError("method_not_allowed", 405, false, { allow: "POST" });
  }

  try {
    const declaredLength = contentLength(request);
    validateChatRequestContext({
      requestUrl: request.url,
      origin: request.headers.get("origin"),
      contentType: request.headers.get("content-type"),
      contentLength: declaredLength,
      bodyBytes: 0,
    });
    const body = await readBody(request);
    validateChatRequestContext({
      requestUrl: request.url,
      origin: request.headers.get("origin"),
      contentType: request.headers.get("content-type"),
      contentLength: declaredLength,
      bodyBytes: body.bodyBytes,
    });
    const parsed = parseChatBody(parseJson(body.text));
    const rawIp = dependencies.ipAddress(request);
    if (typeof rawIp !== "string" || rawIp.length === 0) {
      throw new Error("visitor identity unavailable");
    }
    const visitorKey = await deriveVisitorKey(
      rawIp,
      dependencies.rateLimitSalt,
    );
    const rate = await dependencies.rateLimit.consume({
      visitorKey,
      now: startedAt,
      requestId: dependencies.requestId(),
    });
    if (!rate.allowed) {
      recordMetric(dependencies.metrics, {
        status: "rate_limited",
        latencyMs: elapsed(dependencies.clock, startedAt),
        ...EMPTY_METRIC_COUNTS,
      });
      return jsonError("rate_limited", 429, true, {
        "retry-after": String(Math.max(1, Math.ceil((rate.resetAt - startedAt) / 1_000))),
      });
    }

    const results = await dependencies.retriever.search(parsed.message, {
      locale: parsed.locale,
      limit: 8,
    });
    return sseResponse(
      createAnswerStream({
        locale: parsed.locale,
        results,
        visitorKey,
        message: parsed.message,
        history: parsed.history,
        requestSignal: request.signal,
        dependencies,
        startedAt,
      }),
    );
  } catch (error) {
    const validation = error instanceof ChatValidationError ? error : undefined;
    cancelStreamBestEffort(request.body);
    recordMetric(dependencies.metrics, {
      status: validation ? "rejected" : "failure",
      latencyMs: elapsed(dependencies.clock, startedAt),
      ...EMPTY_METRIC_COUNTS,
    });
    return validation
      ? jsonError(validation.code, validation.status)
      : jsonError("internal_error", 500, true);
  }
}
