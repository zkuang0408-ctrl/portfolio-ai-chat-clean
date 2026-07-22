import { CHAT_CONTENT, type ChatLocale } from "./content";
import { renderChat } from "./render-chat";
import {
  appendCompletedTurn,
  getOrCreateSessionId,
  loadChatHistory,
  type ChatStorage,
  type ClientChatMessage,
} from "./session";
import {
  isClientPublicErrorCode,
  parseSse,
  SseProtocolError,
  type ClientChatSource,
  type ClientPublicErrorCode,
} from "./sse";

export interface PortfolioChatDependencies {
  readonly fetch: typeof globalThis.fetch;
  readonly storage: ChatStorage;
  readonly locale: ChatLocale;
  readonly navigateToSource: (source: ClientChatSource) => void;
  readonly createSessionId?: () => string;
}

const COPY = {
  zh: {
    loading: "正在查找作品依据……",
    followUp: "回答完成，你还可以继续提问。",
    retry: "重试",
    errors: {
      rate_limited: "请求较多，请稍后再试。",
      chat_disabled: "AI 助手暂时不可用。",
      upstream_unavailable: "AI 暂时无法完成回答，请重试。",
      default: "回答时出现问题，请重试。",
    },
  },
  en: {
    loading: "Finding portfolio evidence…",
    followUp: "Answer complete. You can ask a follow-up question.",
    retry: "Retry",
    errors: {
      rate_limited: "You’ve reached the request limit. Please try again later.",
      chat_disabled: "The AI assistant is temporarily unavailable.",
      upstream_unavailable: "The AI couldn’t complete that answer. Please retry.",
      default: "Something went wrong while answering. Please retry.",
    },
  },
} as const;

class PublicStreamError extends Error {
  readonly code: ClientPublicErrorCode;

  constructor(code: ClientPublicErrorCode) {
    super(code);
    this.name = "PublicStreamError";
    this.code = code;
  }
}

function appendMessage(
  transcript: HTMLElement,
  role: "user" | "assistant",
  content: string,
): HTMLParagraphElement {
  const message = document.createElement("p");
  message.className = `chat-message chat-message--${role}`;
  message.dataset.chatMessage = role;
  message.textContent = content;
  transcript.append(message);
  transcript.scrollTop = transcript.scrollHeight;
  return message;
}

function renderHistory(
  transcript: HTMLElement,
  history: readonly ClientChatMessage[],
): void {
  for (const message of history) {
    appendMessage(transcript, message.role, message.content);
  }
}

function errorCopy(locale: ChatLocale, code?: ClientPublicErrorCode): string {
  const errors = COPY[locale].errors;
  if (code === "rate_limited") return errors.rate_limited;
  if (code === "chat_disabled") return errors.chat_disabled;
  if (code === "upstream_unavailable") return errors.upstream_unavailable;
  return errors.default;
}

async function publicCodeFromResponse(response: Response): Promise<ClientPublicErrorCode | undefined> {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") return undefined;
  try {
    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    const error = (value as Record<string, unknown>).error;
    if (typeof error !== "object" || error === null || Array.isArray(error)) return undefined;
    const code = (error as Record<string, unknown>).code;
    return isClientPublicErrorCode(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

function sentenceBoundary(value: string): number {
  let boundary = 0;
  const pattern = /[。！？.!?\n]+(?:["'”’）)\]]*)\s*/gu;
  for (const match of value.matchAll(pattern)) {
    boundary = (match.index ?? 0) + match[0].length;
  }
  return boundary;
}

export function startPortfolioChat(
  chatRoot: HTMLElement,
  dependencies: PortfolioChatDependencies,
): () => void {
  const content = CHAT_CONTENT[dependencies.locale];
  const elements = renderChat(chatRoot, dependencies.locale);
  const history = loadChatHistory(dependencies.storage);
  renderHistory(elements.transcript, history);

  let destroyed = false;
  let activeController: AbortController | undefined;
  let lastRetry: (() => void) | undefined;
  const sourceByButton = new WeakMap<HTMLButtonElement, ClientChatSource>();

  const setBusy = (busy: boolean) => {
    elements.send.disabled = busy;
    elements.input.disabled = busy;
    for (const button of elements.recommendations) button.disabled = busy;
  };

  const showError = (code: ClientPublicErrorCode | undefined, retry: () => void) => {
    elements.status.replaceChildren();
    elements.status.append(document.createTextNode(`${errorCopy(dependencies.locale, code)} `));
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.chatRetry = "";
    button.textContent = COPY[dependencies.locale].retry;
    elements.status.append(button);
    lastRetry = retry;
  };

  const renderSources = (sources: readonly ClientChatSource[]) => {
    elements.sources.replaceChildren();
    for (const source of sources) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.chatSource = source.id;
      button.textContent = source.citationLabel;
      sourceByButton.set(button, source);
      elements.sources.append(button);
    }
  };

  const sendQuestion = async (rawQuestion: string, renderUser: boolean): Promise<void> => {
    const question = rawQuestion.trim();
    if (destroyed || activeController !== undefined || question.length === 0) return;

    const requestHistory = loadChatHistory(dependencies.storage);
    if (renderUser) appendMessage(elements.transcript, "user", question);
    const answerElement = appendMessage(elements.transcript, "assistant", "");
    elements.sources.replaceChildren();
    elements.status.textContent = COPY[dependencies.locale].loading;
    lastRetry = undefined;
    setBusy(true);
    const controller = new AbortController();
    activeController = controller;
    let answer = "";
    let renderedLength = 0;

    const flush = (all = false) => {
      const boundary = all ? answer.length : sentenceBoundary(answer);
      if (boundary > renderedLength) {
        answerElement.append(document.createTextNode(answer.slice(renderedLength, boundary)));
        renderedLength = boundary;
        elements.transcript.scrollTop = elements.transcript.scrollHeight;
      }
    };

    const retry = () => {
      if (destroyed || activeController !== undefined) return;
      void sendQuestion(question, false);
    };

    try {
      const sessionId = getOrCreateSessionId(
        dependencies.storage,
        dependencies.createSessionId,
      );
      const response = await dependencies.fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: question,
          history: requestHistory,
          sessionId,
          locale: dependencies.locale,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new PublicStreamError(
          (await publicCodeFromResponse(response)) ?? "upstream_unavailable",
        );
      }

      let phase: "awaiting-start" | "streaming" | "sources-seen" | "done" =
        "awaiting-start";
      for await (const streamEvent of parseSse(response.body)) {
        if (streamEvent.type === "start") {
          if (
            phase !== "awaiting-start" ||
            streamEvent.data.locale !== dependencies.locale
          ) throw new SseProtocolError();
          phase = "streaming";
        } else if (streamEvent.type === "delta") {
          if (phase !== "streaming") throw new SseProtocolError();
          answer += streamEvent.data.text;
          flush();
        } else if (streamEvent.type === "sources") {
          if (phase !== "streaming") throw new SseProtocolError();
          renderSources(streamEvent.data.sources);
          phase = "sources-seen";
        } else if (streamEvent.type === "done") {
          if (phase !== "sources-seen") throw new SseProtocolError();
          phase = "done";
        } else {
          if (phase !== "streaming") throw new SseProtocolError();
          throw new PublicStreamError(streamEvent.data.code);
        }
      }
      if (phase !== "done" || answer.replace(/[\s\p{Cf}]/gu, "").length === 0) {
        throw new SseProtocolError();
      }
      flush(true);
      appendCompletedTurn(dependencies.storage, question, answer);
      elements.status.textContent = COPY[dependencies.locale].followUp;
      elements.input.value = "";
    } catch (error) {
      controller.abort();
      if (destroyed) return;
      flush(true);
      elements.sources.replaceChildren();
      if (answer.replace(/[\s\p{Cf}]/gu, "").length === 0) {
        answerElement.remove();
      }
      const code = error instanceof PublicStreamError ? error.code : undefined;
      showError(code, retry);
    } finally {
      if (activeController === controller) activeController = undefined;
      if (!destroyed) setBusy(false);
    }
  };

  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    void sendQuestion(elements.input.value, true);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    void sendQuestion(elements.input.value, true);
  };
  const recommendationListeners = elements.recommendations.map((button) => {
    const listener = () => {
      const question = button.dataset.chatRecommendation ?? button.textContent ?? "";
      elements.input.value = question;
      void sendQuestion(question, true);
    };
    button.addEventListener("click", listener);
    return { button, listener };
  });
  const onSourceClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const source = sourceByButton.get(target);
    if (source) dependencies.navigateToSource(source);
  };
  const onStatusClick = (event: MouseEvent) => {
    const target = event.target;
    if (target instanceof HTMLButtonElement && target.matches("[data-chat-retry]")) {
      lastRetry?.();
    }
  };

  elements.form.addEventListener("submit", onSubmit);
  elements.input.addEventListener("keydown", onKeyDown);
  elements.sources.addEventListener("click", onSourceClick);
  elements.status.addEventListener("click", onStatusClick);

  return () => {
    if (destroyed) return;
    destroyed = true;
    activeController?.abort();
    activeController = undefined;
    elements.form.removeEventListener("submit", onSubmit);
    elements.input.removeEventListener("keydown", onKeyDown);
    elements.sources.removeEventListener("click", onSourceClick);
    elements.status.removeEventListener("click", onStatusClick);
    for (const { button, listener } of recommendationListeners) {
      button.removeEventListener("click", listener);
    }
  };
}
