import { CHAT_CONTENT, type ChatLocale } from "./content";

export interface ChatElements {
  readonly root: HTMLElement;
  readonly form: HTMLFormElement;
  readonly input: HTMLTextAreaElement;
  readonly send: HTMLButtonElement;
  readonly transcript: HTMLElement;
  readonly sources: HTMLElement;
  readonly status: HTMLElement;
  readonly recommendations: readonly HTMLButtonElement[];
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  element.className = className;
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

export function renderChat(root: HTMLElement, locale: ChatLocale): ChatElements {
  const content = CHAT_CONTENT[locale];
  root.replaceChildren();
  root.classList.add("hero-chat", "chat-scroll-region");
  root.lang = locale === "zh" ? "zh-CN" : "en";
  root.setAttribute("aria-label", content.transcriptLabel);

  const heading = createElement("div", "chat-heading");
  const accent = createElement("span", "chat-accent");
  accent.setAttribute("aria-hidden", "true");
  const label = createElement("p", "chat-label", content.assistantLabel);
  label.dataset.chatLabel = "";
  heading.append(accent, label);

  const intro = createElement("p", "chat-intro", content.intro);
  intro.dataset.chatIntro = "";

  const recommendationGroup = createElement("div", "chat-recommendations");
  recommendationGroup.setAttribute("aria-label", content.recommendationsLabel);
  const recommendations = content.recommendations.map((question) => {
    const button = createElement("button", "chat-recommendation", question);
    button.type = "button";
    button.dataset.chatRecommendation = question;
    recommendationGroup.append(button);
    return button;
  });

  const transcript = createElement("div", "chat-transcript");
  transcript.dataset.chatTranscript = "";
  transcript.setAttribute("aria-label", content.transcriptLabel);
  transcript.setAttribute("aria-live", "polite");
  transcript.setAttribute("aria-relevant", "additions text");

  const sources = createElement("div", "chat-sources");
  sources.dataset.chatSources = "";
  sources.setAttribute("aria-label", content.sourcesLabel);

  const form = createElement("form", "chat-composer");
  form.dataset.chatForm = "";
  const input = createElement("textarea", "chat-input");
  input.dataset.chatInput = "";
  input.rows = 2;
  input.maxLength = 600;
  input.placeholder = content.placeholder;
  input.setAttribute("aria-label", content.inputLabel);
  input.setAttribute("autocomplete", "off");
  const send = createElement("button", "chat-send", content.sendText);
  send.dataset.chatSend = "";
  send.type = "submit";
  send.setAttribute("aria-label", content.sendLabel);
  form.append(input, send);

  const status = createElement("p", "chat-status", content.disclosure);
  status.dataset.chatStatus = "";
  status.setAttribute("role", "status");

  root.append(
    heading,
    intro,
    recommendationGroup,
    transcript,
    sources,
    form,
    status,
  );

  return {
    root,
    form,
    input,
    send,
    transcript,
    sources,
    status,
    recommendations,
  };
}
