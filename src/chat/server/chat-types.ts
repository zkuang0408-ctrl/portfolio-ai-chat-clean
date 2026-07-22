export type ChatLocale = "zh" | "en";

export type ChatHistoryRole = "user" | "assistant";

export interface ChatHistoryMessage {
  readonly role: ChatHistoryRole;
  readonly content: string;
}

export interface ParsedChatBody {
  readonly message: string;
  readonly history: readonly ChatHistoryMessage[];
  readonly sessionId: string;
  readonly locale: ChatLocale;
}

export type SourceMarker =
  | "S1"
  | "S2"
  | "S3"
  | "S4"
  | "S5"
  | "S6"
  | "S7"
  | "S8";

export interface PublicChatSource {
  readonly id: SourceMarker;
  readonly sourceId: string;
  readonly projectId?: string;
  readonly page?: number;
  readonly title: string;
  readonly citationLabel: string;
  readonly publicHref: string;
}

export interface ProviderInput {
  readonly system: string;
  readonly messages: readonly ChatHistoryMessage[];
  readonly userId: string;
}

export type ProviderEvent =
  | { readonly type: "delta"; readonly text: string }
  | {
      readonly type: "usage";
      readonly inputTokens: number;
      readonly outputTokens: number;
      readonly cacheHitTokens?: number;
    }
  | { readonly type: "done" };

export interface ChatProvider {
  stream(
    input: ProviderInput,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent>;
}

export type PublicChatErrorCode =
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

export interface PublicChatError {
  readonly code: PublicChatErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export type ChatStreamEvent =
  | {
      readonly type: "start";
      readonly data: { readonly locale: ChatLocale };
    }
  | { readonly type: "delta"; readonly data: { readonly text: string } }
  | {
      readonly type: "sources";
      readonly data: { readonly sources: readonly PublicChatSource[] };
    }
  | {
      readonly type: "done";
      readonly data: {
        readonly inputTokens?: number;
        readonly outputTokens?: number;
      };
    }
  | { readonly type: "error"; readonly data: PublicChatError };
