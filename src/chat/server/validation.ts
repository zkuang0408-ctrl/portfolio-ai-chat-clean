import type {
  ChatHistoryMessage,
  ChatLocale,
  ParsedChatBody,
  PublicChatErrorCode,
} from "./chat-types";

export const MAX_CHAT_MESSAGE_CODE_POINTS = 600;
export const MAX_CHAT_HISTORY_PAIRS = 10;
export const MAX_CHAT_BODY_BYTES = 32 * 1024;

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const SUPPORTED_LOCALES = new Map<string, ChatLocale>([
  ["zh", "zh"],
  ["zh-cn", "zh"],
  ["zh-hans", "zh"],
  ["zh-hant", "zh"],
  ["zh-tw", "zh"],
  ["zh-hk", "zh"],
  ["en", "en"],
  ["en-us", "en"],
  ["en-gb", "en"],
]);

export class ChatValidationError extends Error {
  readonly code: PublicChatErrorCode;
  readonly status: number;

  constructor(code: PublicChatErrorCode, status = 400) {
    super(code);
    this.name = "ChatValidationError";
    this.code = code;
    this.status = status;
  }
}

export interface ChatRequestContext {
  readonly requestUrl: string;
  readonly origin: string | null;
  readonly contentType: string | null;
  readonly contentLength?: number | null;
  readonly bodyBytes: number;
}

function fail(code: PublicChatErrorCode, status = 400): never {
  throw new ChatValidationError(code, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function hasVisibleContent(value: string): boolean {
  return value.replace(/[\s\p{Cf}]/gu, "").length > 0;
}

function parseLocale(value: unknown): ChatLocale {
  if (typeof value !== "string") {
    return fail("invalid_locale");
  }
  return SUPPORTED_LOCALES.get(value.toLowerCase()) ?? fail("invalid_locale");
}

function parseHistory(value: unknown): readonly ChatHistoryMessage[] {
  if (!Array.isArray(value)) {
    return fail("invalid_history");
  }

  const history: ChatHistoryMessage[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      return fail("invalid_history");
    }
    if (item.role !== "user" && item.role !== "assistant") {
      return fail("invalid_history_role");
    }
    const expectedRole = index % 2 === 0 ? "user" : "assistant";
    if (item.role !== expectedRole || typeof item.content !== "string") {
      return fail("invalid_history");
    }
    if (!hasVisibleContent(item.content)) {
      return fail("invalid_history");
    }
    if (codePointLength(item.content) > MAX_CHAT_MESSAGE_CODE_POINTS) {
      return fail("history_message_too_long");
    }
    history.push({ role: item.role, content: item.content });
  }

  if (history.length % 2 !== 0) {
    return fail("invalid_history");
  }

  return history.slice(-(MAX_CHAT_HISTORY_PAIRS * 2));
}

export function parseChatBody(value: unknown): ParsedChatBody {
  if (!isRecord(value)) {
    return fail("invalid_body");
  }
  if (typeof value.message !== "string") {
    return fail("invalid_body");
  }
  if (!hasVisibleContent(value.message)) {
    return fail("empty_message");
  }
  if (codePointLength(value.message) > MAX_CHAT_MESSAGE_CODE_POINTS) {
    return fail("message_too_long");
  }
  if (
    typeof value.sessionId !== "string" ||
    !SESSION_ID_PATTERN.test(value.sessionId)
  ) {
    return fail("invalid_session_id");
  }

  return {
    message: value.message,
    history: parseHistory(value.history),
    sessionId: value.sessionId,
    locale: parseLocale(value.locale),
  };
}

function isValidByteCount(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0;
}

export function validateChatRequestContext(
  context: ChatRequestContext,
): void {
  const mediaType = context.contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    fail("unsupported_content_type", 415);
  }

  if (!isValidByteCount(context.bodyBytes)) {
    fail("invalid_body");
  }
  if (
    context.contentLength !== undefined &&
    context.contentLength !== null &&
    !isValidByteCount(context.contentLength)
  ) {
    fail("invalid_body");
  }
  if (
    context.bodyBytes > MAX_CHAT_BODY_BYTES ||
    (context.contentLength !== undefined &&
      context.contentLength !== null &&
      context.contentLength > MAX_CHAT_BODY_BYTES)
  ) {
    fail("body_too_large", 413);
  }

  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(context.requestUrl).origin;
  } catch {
    return fail("invalid_body");
  }

  if (typeof context.origin !== "string" || context.origin !== expectedOrigin) {
    fail("cross_origin_request", 403);
  }
}
