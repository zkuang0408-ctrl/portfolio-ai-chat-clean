import type {
  ChatProvider,
  ProviderEvent,
  ProviderInput,
} from "./chat-types";

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_TOKENS = 700;
const MAX_API_KEY_CHARS = 4_096;
const MAX_MODEL_CHARS = 128;
const MAX_TIMEOUT_MS = 120_000;
const MAX_TOKEN_LIMIT = 4_096;

export const MAX_SSE_LINE_CHARS = 4_096;
export const MAX_SSE_EVENT_CHARS = 8_192;
export const MAX_OUTPUT_CODE_POINTS = 8_192;
export const MAX_SSE_STREAM_BYTES = 65_536;

export type DeepSeekProviderErrorCategory =
  | "authentication"
  | "balance"
  | "rate_limited"
  | "upstream"
  | "network"
  | "timeout"
  | "malformed_response"
  | "stream_interrupted";

export class DeepSeekProviderError extends Error {
  readonly category: DeepSeekProviderErrorCategory;
  readonly retryable: boolean;

  constructor(category: DeepSeekProviderErrorCategory, retryable: boolean) {
    super(`AI provider failure: ${category}`);
    this.name = "DeepSeekProviderError";
    this.category = category;
    this.retryable = retryable;
  }
}

export interface DeepSeekProviderOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly maxTokens?: number;
  readonly fetch?: typeof fetch;
}

interface UsagePayload {
  readonly prompt_tokens?: unknown;
  readonly completion_tokens?: unknown;
  readonly prompt_cache_hit_tokens?: unknown;
}

interface CompletionChunk {
  readonly choices?: unknown;
  readonly usage?: UsagePayload | null;
}

interface ParsedDataEvent {
  readonly done: boolean;
  readonly delta?: string;
  readonly usage?: Extract<ProviderEvent, { readonly type: "usage" }>;
}

interface CompositeAbort {
  readonly signal: AbortSignal;
  readonly didTimeout: () => boolean;
  readonly cleanup: () => void;
}

const TIMEOUT_REASON = Symbol("deepseek-timeout");

function sanitizedAbortError(): DOMException {
  return new DOMException("The operation was aborted", "AbortError");
}

function abortFailure(
  externalSignal: AbortSignal,
  composite: CompositeAbort,
): DOMException | DeepSeekProviderError | undefined {
  if (externalSignal.aborted) {
    return sanitizedAbortError();
  }
  if (composite.didTimeout()) {
    return new DeepSeekProviderError("timeout", true);
  }
  return undefined;
}

function isTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function readDeltaText(payload: CompletionChunk): string | undefined {
  if (payload.choices === undefined) {
    return undefined;
  }
  if (!Array.isArray(payload.choices)) {
    throw new DeepSeekProviderError("malformed_response", false);
  }

  const first = payload.choices[0];
  if (first === undefined) {
    return undefined;
  }
  if (typeof first !== "object" || first === null || !("delta" in first)) {
    throw new DeepSeekProviderError("malformed_response", false);
  }
  const delta = first.delta;
  if (typeof delta !== "object" || delta === null) {
    throw new DeepSeekProviderError("malformed_response", false);
  }
  if (!("content" in delta) || delta.content === null) {
    return undefined;
  }
  if (typeof delta.content !== "string") {
    throw new DeepSeekProviderError("malformed_response", false);
  }
  return delta.content;
}

function readUsage(
  payload: CompletionChunk,
): Extract<ProviderEvent, { readonly type: "usage" }> | undefined {
  if (payload.usage === undefined || payload.usage === null) {
    return undefined;
  }
  if (typeof payload.usage !== "object") {
    throw new DeepSeekProviderError("malformed_response", false);
  }

  const {
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    prompt_cache_hit_tokens: cacheHitTokens,
  } = payload.usage;
  if (!isTokenCount(inputTokens) || !isTokenCount(outputTokens)) {
    throw new DeepSeekProviderError("malformed_response", false);
  }
  if (cacheHitTokens !== undefined && !isTokenCount(cacheHitTokens)) {
    throw new DeepSeekProviderError("malformed_response", false);
  }

  return cacheHitTokens === undefined
    ? { type: "usage", inputTokens, outputTokens }
    : { type: "usage", inputTokens, outputTokens, cacheHitTokens };
}

function parseDataEvent(data: string): ParsedDataEvent {
  if (data.trim() === "[DONE]") {
    return { done: true };
  }

  let unknownPayload: unknown;
  try {
    unknownPayload = JSON.parse(data);
  } catch {
    throw new DeepSeekProviderError("malformed_response", false);
  }
  if (typeof unknownPayload !== "object" || unknownPayload === null) {
    throw new DeepSeekProviderError("malformed_response", false);
  }

  const payload = unknownPayload as CompletionChunk;
  const delta = readDeltaText(payload);
  const usage = readUsage(payload);
  return {
    done: false,
    ...(delta === undefined || delta.length === 0 ? {} : { delta }),
    ...(usage === undefined ? {} : { usage }),
  };
}

function httpError(status: number): DeepSeekProviderError {
  if (status === 401) {
    return new DeepSeekProviderError("authentication", false);
  }
  if (status === 402) {
    return new DeepSeekProviderError("balance", false);
  }
  if (status === 429) {
    return new DeepSeekProviderError("rate_limited", true);
  }
  return new DeepSeekProviderError("upstream", status >= 500);
}

function createCompositeSignal(
  externalSignal: AbortSignal,
  timeoutMs: number,
): CompositeAbort {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromExternal = () => controller.abort(sanitizedAbortError());

  if (externalSignal.aborted) {
    abortFromExternal();
  } else {
    externalSignal.addEventListener("abort", abortFromExternal, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(TIMEOUT_REASON);
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal.removeEventListener("abort", abortFromExternal);
    },
  };
}

function readWithSignal(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    reader.read().then(
      (result) => {
        cleanup();
        resolve(result);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (body === null) {
    return;
  }
  try {
    await body.cancel();
  } catch {
    // Cancellation is best-effort and provider errors stay sanitized.
  }
}

async function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // Cancellation is best-effort and provider errors stay sanitized.
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A failed release must not replace the normalized provider outcome.
    }
  }
}

function isEventStream(response: Response): boolean {
  const contentType = response.headers.get("content-type");
  if (contentType === null) {
    return false;
  }
  return contentType.split(";", 1)[0]?.trim().toLowerCase() === "text/event-stream";
}

function extractLine(
  buffer: string,
  endOfStream: boolean,
): { readonly line: string; readonly rest: string } | undefined {
  for (let index = 0; index < buffer.length; index += 1) {
    const character = buffer[index];
    if (character === "\n") {
      return { line: buffer.slice(0, index), rest: buffer.slice(index + 1) };
    }
    if (character === "\r") {
      if (index + 1 === buffer.length && !endOfStream) {
        return undefined;
      }
      const width = buffer[index + 1] === "\n" ? 2 : 1;
      return {
        line: buffer.slice(0, index),
        rest: buffer.slice(index + width),
      };
    }
  }
  if (endOfStream && buffer.length > 0) {
    return { line: buffer, rest: "" };
  }
  return undefined;
}

function assertCurrentLineBound(buffer: string): void {
  const length = buffer.endsWith("\r") ? buffer.length - 1 : buffer.length;
  if (length > MAX_SSE_LINE_CHARS) {
    throw new DeepSeekProviderError("malformed_response", false);
  }
}

function codePointLength(value: string): number {
  return [...value].length;
}

export class DeepSeekProvider implements ChatProvider {
  readonly #apiKey: string;
  readonly #model: string;
  readonly #timeoutMs: number;
  readonly #maxTokens: number;
  readonly #fetch: typeof fetch;

  constructor(options: DeepSeekProviderOptions) {
    const apiKey = options.apiKey.trim();
    const model = (options.model ?? DEFAULT_MODEL).trim();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    const valid =
      apiKey.length > 0 &&
      apiKey.length <= MAX_API_KEY_CHARS &&
      model.length > 0 &&
      model.length <= MAX_MODEL_CHARS &&
      /^[\x21-\x7e]+$/.test(model) &&
      Number.isSafeInteger(timeoutMs) &&
      timeoutMs > 0 &&
      timeoutMs <= MAX_TIMEOUT_MS &&
      Number.isSafeInteger(maxTokens) &&
      maxTokens > 0 &&
      maxTokens <= MAX_TOKEN_LIMIT;
    if (!valid) {
      throw new Error("DeepSeek provider configuration is invalid");
    }

    this.#apiKey = apiKey;
    this.#model = model;
    this.#timeoutMs = timeoutMs;
    this.#maxTokens = maxTokens;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async *stream(
    input: ProviderInput,
    externalSignal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    const userId = input.userId.trim();
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(userId)) {
      throw new DeepSeekProviderError("malformed_response", false);
    }

    const composite = createCompositeSignal(externalSignal, this.#timeoutMs);
    let response: Response;
    try {
      response = await this.#fetch(DEEPSEEK_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.#model,
          messages: [
            { role: "system", content: input.system },
            ...input.messages,
          ],
          thinking: { type: "disabled" },
          temperature: 0.2,
          max_tokens: this.#maxTokens,
          stream: true,
          stream_options: { include_usage: true },
          user_id: userId,
        }),
        signal: composite.signal,
      });
    } catch {
      composite.cleanup();
      const normalizedAbort = abortFailure(externalSignal, composite);
      if (normalizedAbort !== undefined) {
        throw normalizedAbort;
      }
      throw new DeepSeekProviderError("network", true);
    }

    try {
      const lateAbort = abortFailure(externalSignal, composite);
      if (lateAbort !== undefined) {
        await cancelBody(response.body);
        throw lateAbort;
      }
      if (!response.ok) {
        await cancelBody(response.body);
        throw httpError(response.status);
      }
      if (!isEventStream(response) || response.body === null) {
        await cancelBody(response.body);
        throw new DeepSeekProviderError("malformed_response", false);
      }

      let reader: ReadableStreamDefaultReader<Uint8Array>;
      try {
        reader = response.body.getReader();
      } catch {
        await cancelBody(response.body);
        throw new DeepSeekProviderError("malformed_response", false);
      }

      try {
        const decoder = new TextDecoder("utf-8", { fatal: true });
        let buffer = "";
        let dataLines: string[] = [];
        let dataChars = 0;
        let streamBytes = 0;
        let outputCodePoints = 0;
        let pendingUsage: Extract<ProviderEvent, { readonly type: "usage" }> | undefined;

        const dispatch = (): ParsedDataEvent | undefined => {
          if (dataLines.length === 0) {
            return undefined;
          }
          const result = parseDataEvent(dataLines.join("\n"));
          dataLines = [];
          dataChars = 0;
          return result;
        };

        const consumeLine = (line: string): ParsedDataEvent | undefined => {
          if (line.length > MAX_SSE_LINE_CHARS) {
            throw new DeepSeekProviderError("malformed_response", false);
          }
          if (line.length === 0) {
            return dispatch();
          }
          if (line.startsWith(":")) {
            return undefined;
          }
          const separator = line.indexOf(":");
          const field = separator === -1 ? line : line.slice(0, separator);
          if (field !== "data") {
            return undefined;
          }
          let value = separator === -1 ? "" : line.slice(separator + 1);
          if (value.startsWith(" ")) {
            value = value.slice(1);
          }
          dataChars += value.length + (dataLines.length === 0 ? 0 : 1);
          if (dataChars > MAX_SSE_EVENT_CHARS) {
            throw new DeepSeekProviderError("malformed_response", false);
          }
          dataLines.push(value);
          return undefined;
        };

        const emit = function* (result: ParsedDataEvent): Generator<ProviderEvent> {
          if (result.delta !== undefined) {
            outputCodePoints += codePointLength(result.delta);
            if (outputCodePoints > MAX_OUTPUT_CODE_POINTS) {
              throw new DeepSeekProviderError("malformed_response", false);
            }
            yield { type: "delta", text: result.delta };
          }
          if (result.usage !== undefined) {
            pendingUsage = result.usage;
          }
          if (result.done) {
            if (pendingUsage !== undefined) {
              yield pendingUsage;
            }
            yield { type: "done" };
          }
        };

        const processBuffer = function* (
          endOfStream: boolean,
        ): Generator<ProviderEvent, boolean> {
          const nextLine = () =>
            extractLine(buffer, endOfStream) ??
            (!endOfStream && buffer === "\r" && dataLines.length > 0
              ? { line: "", rest: "" }
              : undefined);
          let extracted = nextLine();
          while (extracted !== undefined) {
            buffer = extracted.rest;
            const result = consumeLine(extracted.line);
            if (result !== undefined) {
              yield* emit(result);
              if (result.done) {
                return true;
              }
            }
            extracted = nextLine();
          }
          assertCurrentLineBound(buffer);
          return false;
        };

        while (true) {
          const read = await readWithSignal(reader, composite.signal);
          const midstreamAbort = abortFailure(externalSignal, composite);
          if (midstreamAbort !== undefined) {
            throw midstreamAbort;
          }
          if (read.done) {
            try {
              buffer += decoder.decode();
            } catch {
              throw new DeepSeekProviderError("malformed_response", false);
            }
            const processed = processBuffer(true);
            let step = processed.next();
            while (!step.done) {
              yield step.value;
              if (step.value.type !== "done") {
                const postYieldAbort = abortFailure(externalSignal, composite);
                if (postYieldAbort !== undefined) {
                  throw postYieldAbort;
                }
              }
              step = processed.next();
            }
            if (step.value) {
              return;
            }
            const trailing = dispatch();
            if (trailing !== undefined) {
              for (const event of emit(trailing)) {
                yield event;
                if (event.type !== "done") {
                  const postYieldAbort = abortFailure(externalSignal, composite);
                  if (postYieldAbort !== undefined) {
                    throw postYieldAbort;
                  }
                }
              }
              if (trailing.done) {
                return;
              }
            }
            throw new DeepSeekProviderError("stream_interrupted", true);
          }

          streamBytes += read.value.byteLength;
          if (streamBytes > MAX_SSE_STREAM_BYTES) {
            throw new DeepSeekProviderError("malformed_response", false);
          }
          try {
            buffer += decoder.decode(read.value, { stream: true });
          } catch {
            throw new DeepSeekProviderError("malformed_response", false);
          }
          const processed = processBuffer(false);
          let step = processed.next();
          while (!step.done) {
            yield step.value;
            if (step.value.type !== "done") {
              const postYieldAbort = abortFailure(externalSignal, composite);
              if (postYieldAbort !== undefined) {
                throw postYieldAbort;
              }
            }
            step = processed.next();
          }
          if (step.value) {
            return;
          }
        }
      } catch (error) {
        const normalizedAbort = abortFailure(externalSignal, composite);
        if (normalizedAbort !== undefined) {
          throw normalizedAbort;
        }
        if (error instanceof DeepSeekProviderError) {
          throw error;
        }
        throw new DeepSeekProviderError("stream_interrupted", true);
      } finally {
        await cancelReader(reader);
      }
    } finally {
      composite.cleanup();
    }
  }
}
