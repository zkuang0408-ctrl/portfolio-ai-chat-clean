import type {
  ChatProvider,
  ProviderEvent,
  ProviderInput,
} from "./chat-types";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_TOKENS = 700;

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
  readonly baseUrl?: string;
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

const TIMEOUT_REASON = Symbol("deepseek-timeout");

function safeAbortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}

function isTokenCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
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

function readUsage(payload: CompletionChunk): ProviderEvent | undefined {
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

function parseDataEvent(data: string):
  | { readonly done: true; readonly events: readonly ProviderEvent[] }
  | { readonly done: false; readonly events: readonly ProviderEvent[] } {
  if (data.trim() === "[DONE]") {
    return { done: true, events: [{ type: "done" }] };
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
  const events: ProviderEvent[] = [];
  const text = readDeltaText(payload);
  if (text !== undefined && text.length > 0) {
    events.push({ type: "delta", text });
  }
  const usage = readUsage(payload);
  if (usage !== undefined) {
    events.push(usage);
  }
  return { done: false, events };
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

function createCompositeSignal(externalSignal: AbortSignal, timeoutMs: number): {
  readonly signal: AbortSignal;
  readonly didTimeout: () => boolean;
  readonly cleanup: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromExternal = () => controller.abort(safeAbortReason(externalSignal));

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
    return Promise.reject(safeAbortReason(signal));
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(safeAbortReason(signal));
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

export class DeepSeekProvider implements ChatProvider {
  readonly #apiKey: string;
  readonly #endpoint: string;
  readonly #model: string;
  readonly #timeoutMs: number;
  readonly #maxTokens: number;
  readonly #fetch: typeof fetch;

  constructor(options: DeepSeekProviderOptions) {
    if (options.apiKey.trim().length === 0) {
      throw new Error("DeepSeek API key is required");
    }
    const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    const model = options.model ?? DEFAULT_MODEL;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    if (baseUrl.length === 0 || model.trim().length === 0) {
      throw new Error("DeepSeek provider configuration is invalid");
    }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error("DeepSeek provider timeout is invalid");
    }
    if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0) {
      throw new Error("DeepSeek provider token limit is invalid");
    }

    this.#apiKey = options.apiKey;
    this.#endpoint = `${baseUrl}/chat/completions`;
    this.#model = model;
    this.#timeoutMs = timeoutMs;
    this.#maxTokens = maxTokens;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async *stream(
    input: ProviderInput,
    externalSignal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    const composite = createCompositeSignal(externalSignal, this.#timeoutMs);
    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
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
          user_id: input.userId,
        }),
        signal: composite.signal,
      });
    } catch {
      composite.cleanup();
      if (externalSignal.aborted) {
        throw safeAbortReason(externalSignal);
      }
      if (composite.didTimeout()) {
        throw new DeepSeekProviderError("timeout", true);
      }
      throw new DeepSeekProviderError("network", true);
    }

    if (!response.ok) {
      composite.cleanup();
      throw httpError(response.status);
    }
    if (response.body === null) {
      composite.cleanup();
      throw new DeepSeekProviderError("malformed_response", false);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let dataLines: string[] = [];

    const dispatch = (): ReturnType<typeof parseDataEvent> | undefined => {
      if (dataLines.length === 0) {
        return undefined;
      }
      const result = parseDataEvent(dataLines.join("\n"));
      dataLines = [];
      return result;
    };

    const consumeLine = (rawLine: string): ReturnType<typeof dispatch> => {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
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
      dataLines.push(value);
      return undefined;
    };

    try {
      while (true) {
        const read = await readWithSignal(reader, composite.signal);
        if (read.done) {
          buffer += decoder.decode();
          break;
        }
        buffer += decoder.decode(read.value, { stream: true });

        let newline = buffer.indexOf("\n");
        while (newline !== -1) {
          const result = consumeLine(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          if (result !== undefined) {
            for (const event of result.events) {
              yield event;
            }
            if (result.done) {
              return;
            }
          }
          newline = buffer.indexOf("\n");
        }
      }

      if (buffer.length > 0) {
        const result = consumeLine(buffer);
        if (result !== undefined) {
          for (const event of result.events) {
            yield event;
          }
          if (result.done) {
            return;
          }
        }
      }
      const trailing = dispatch();
      if (trailing !== undefined) {
        for (const event of trailing.events) {
          yield event;
        }
        if (trailing.done) {
          return;
        }
      }
      throw new DeepSeekProviderError("stream_interrupted", true);
    } catch (error) {
      if (error instanceof DeepSeekProviderError) {
        throw error;
      }
      if (externalSignal.aborted) {
        throw safeAbortReason(externalSignal);
      }
      if (composite.didTimeout()) {
        throw new DeepSeekProviderError("timeout", true);
      }
      throw new DeepSeekProviderError("stream_interrupted", true);
    } finally {
      composite.cleanup();
      void reader.cancel().catch(() => undefined);
    }
  }
}
