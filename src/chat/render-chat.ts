import { CHAT_CONTENT, type ChatLocale } from "./content";

export interface ChatElements {
  readonly root: HTMLElement;
  readonly orb: HTMLButtonElement;
  readonly panel: HTMLElement;
  readonly collapse: HTMLButtonElement;
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
  root.classList.add("hero-chat", "portfolio-chat");
  root.id ||= "portfolio-chat";
  root.dataset.chatPresentation = "collapsed";
  root.lang = locale === "zh" ? "zh-CN" : "en";
  root.setAttribute("aria-label", content.transcriptLabel);

  const panelId = `${root.id}-panel`;
  const orb = createElement("button", "chat-orb");
  orb.type = "button";
  orb.dataset.chatOrb = "";
  orb.setAttribute("aria-controls", panelId);
  orb.setAttribute("aria-expanded", "false");
  orb.setAttribute(
    "aria-label",
    locale === "zh" ? "打开赵实旷的 AI 助手" : "Open Shikuang Zhao's AI assistant",
  );
  orb.innerHTML = `
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3.5c1.2 6.2 3.8 8.8 10 10-6.2 1.2-8.8 3.8-10 10-1.2-6.2-3.8-8.8-10-10 6.2-1.2 8.8-3.8 10-10Z" />
      <circle cx="25.5" cy="6.5" r="2.2" />
    </svg>
  `;

  const panel = createElement("section", "chat-panel chat-scroll-region");
  panel.id = panelId;
  panel.dataset.chatPanel = "";
  panel.setAttribute("aria-hidden", "true");

  const panelHeader = createElement("header", "chat-panel__header");
  const panelTitle = createElement(
    "p",
    "chat-panel__title",
    locale === "zh" ? "ASK SHIKUANG · AI" : "ASK SHIKUANG · AI",
  );
  const collapse = createElement("button", "chat-collapse");
  collapse.type = "button";
  collapse.dataset.chatCollapse = "";
  collapse.setAttribute(
    "aria-label",
    locale === "zh" ? "收起 AI 助手" : "Collapse AI assistant",
  );
  collapse.innerHTML = '<span aria-hidden="true"></span>';
  panelHeader.append(panelTitle, collapse);

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

  panel.append(
    panelHeader,
    heading,
    intro,
    recommendationGroup,
    transcript,
    sources,
    form,
    status,
  );
  root.append(orb, panel);

  return {
    root,
    orb,
    panel,
    collapse,
    form,
    input,
    send,
    transcript,
    sources,
    status,
    recommendations,
  };
}
