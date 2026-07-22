export type ClientChatLocale = "zh" | "en";

export type ClientSourceMarker =
  | "S1"
  | "S2"
  | "S3"
  | "S4"
  | "S5"
  | "S6"
  | "S7"
  | "S8";

export interface ClientChatSource {
  readonly id: ClientSourceMarker;
  readonly sourceId: string;
  readonly projectId?: string;
  readonly page?: number;
  readonly title: string;
  readonly citationLabel: string;
  readonly publicHref: string;
}

export type ClientPublicErrorCode =
  | "method_not_allowed"
  | "cross_origin_request"
  | "unsupported_content_type"
  | "body_too_large"
  | "invalid_body"
  | "empty_message"
  | "message_too_long"
  | "invalid_session_id"
  | "invalid_history"
  | "invalid_history_role"
  | "history_message_too_long"
  | "invalid_locale"
  | "rate_limited"
  | "chat_disabled"
  | "upstream_unavailable"
  | "internal_error";

export type ClientChatStreamEvent =
  | { readonly type: "start"; readonly data: { readonly locale: ClientChatLocale } }
  | { readonly type: "delta"; readonly data: { readonly text: string } }
  | { readonly type: "sources"; readonly data: { readonly sources: readonly ClientChatSource[] } }
  | { readonly type: "done"; readonly data: { readonly inputTokens?: number; readonly outputTokens?: number } }
  | {
      readonly type: "error";
      readonly data: {
        readonly code: ClientPublicErrorCode;
        readonly message: string;
        readonly retryable: boolean;
      };
    };

const MAX_EVENT_BYTES = 64 * 1024;
const MAX_DELTA_CODE_POINTS = 16 * 1024;
const MAX_TEXT_CODE_POINTS = 1_024;
const SOURCE_MARKERS = new Set([
  "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8",
]);
const ERROR_CODES = new Set([
  "method_not_allowed",
  "cross_origin_request",
  "unsupported_content_type",
  "body_too_large",
  "invalid_body",
  "empty_message",
  "message_too_long",
  "invalid_session_id",
  "invalid_history",
  "invalid_history_role",
  "history_message_too_long",
  "invalid_locale",
  "rate_limited",
  "chat_disabled",
  "upstream_unavailable",
  "internal_error",
]);

export class SseProtocolError extends Error {
  constructor() {
    super("Invalid portfolio chat event stream.");
    this.name = "SseProtocolError";
  }
}

function fail(): never {
  throw new SseProtocolError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function isShortString(value: unknown, maximum = MAX_TEXT_CODE_POINTS): value is string {
  return typeof value === "string" && Array.from(value).length <= maximum;
}

function isVisibleShortString(value: unknown): value is string {
  return isShortString(value) && value.replace(/[\s\p{Cf}]/gu, "").length > 0;
}

function isOptionalTokenCount(value: unknown): value is number | undefined {
  return value === undefined ||
    (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

function parseSource(value: unknown): ClientChatSource {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "id", "sourceId", "projectId", "page", "title", "citationLabel", "publicHref",
  ])) fail();
  if (
    typeof value.id !== "string" ||
    !SOURCE_MARKERS.has(value.id) ||
    !isVisibleShortString(value.sourceId) ||
    !isVisibleShortString(value.title) ||
    !isVisibleShortString(value.citationLabel) ||
    !isVisibleShortString(value.publicHref) ||
    (value.projectId !== undefined && !isVisibleShortString(value.projectId)) ||
    (value.page !== undefined &&
      !(typeof value.page === "number" && Number.isSafeInteger(value.page) && value.page > 0))
  ) fail();
  return {
    id: value.id as ClientSourceMarker,
    sourceId: value.sourceId,
    ...(value.projectId === undefined ? {} : { projectId: value.projectId }),
    ...(value.page === undefined ? {} : { page: value.page }),
    title: value.title,
    citationLabel: value.citationLabel,
    publicHref: value.publicHref,
  };
}

function parseEvent(type: string, data: unknown): ClientChatStreamEvent {
  if (!isRecord(data)) fail();
  if (type === "start") {
    if (!hasOnlyKeys(data, ["locale"]) || (data.locale !== "zh" && data.locale !== "en")) fail();
    return { type, data: { locale: data.locale } };
  }
  if (type === "delta") {
    if (!hasOnlyKeys(data, ["text"]) || !isShortString(data.text, MAX_DELTA_CODE_POINTS) || data.text.length === 0) fail();
    return { type, data: { text: data.text } };
  }
  if (type === "sources") {
    if (!hasOnlyKeys(data, ["sources"]) || !Array.isArray(data.sources) || data.sources.length > 8) fail();
    const sources = data.sources.map(parseSource);
    if (new Set(sources.map(({ id }) => id)).size !== sources.length) fail();
    return { type, data: { sources } };
  }
  if (type === "done") {
    if (
      !hasOnlyKeys(data, ["inputTokens", "outputTokens"]) ||
      !isOptionalTokenCount(data.inputTokens) ||
      !isOptionalTokenCount(data.outputTokens)
    ) fail();
    return {
      type,
      data: {
        ...(data.inputTokens === undefined ? {} : { inputTokens: data.inputTokens }),
        ...(data.outputTokens === undefined ? {} : { outputTokens: data.outputTokens }),
      },
    };
  }
  if (type === "error") {
    if (
      !hasOnlyKeys(data, ["code", "message", "retryable"]) ||
      typeof data.code !== "string" ||
      !ERROR_CODES.has(data.code) ||
      !isShortString(data.message) ||
      typeof data.retryable !== "boolean"
    ) fail();
    return {
      type,
      data: {
        code: data.code as ClientPublicErrorCode,
        message: data.message,
        retryable: data.retryable,
      },
    };
  }
  return fail();
}

function parseBlock(block: string): ClientChatStreamEvent {
  let type: string | undefined;
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event" && type === undefined) type = value;
    else if (field === "data") dataLines.push(value);
    else fail();
  }
  if (!type || dataLines.length === 0) fail();
  let data: unknown;
  try {
    data = JSON.parse(dataLines.join("\n"));
  } catch {
    return fail();
  }
  return parseEvent(type, data);
}

export async function* parseSse(
  body: ReadableStream<Uint8Array> | null,
): AsyncGenerator<ClientChatStreamEvent> {
  if (body === null) fail();
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      try {
        buffer += decoder.decode(item.value, { stream: true });
      } catch {
        fail();
      }
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (new TextEncoder().encode(block).byteLength > MAX_EVENT_BYTES) fail();
        if (block.length > 0) yield parseBlock(block);
        boundary = buffer.indexOf("\n\n");
      }
      if (new TextEncoder().encode(buffer).byteLength > MAX_EVENT_BYTES) fail();
    }
    try {
      buffer += decoder.decode();
    } catch {
      fail();
    }
    buffer = buffer.replace(/\r\n/g, "\n");
    if (buffer.trim().length > 0) fail();
  } finally {
    reader.releaseLock();
  }
}
