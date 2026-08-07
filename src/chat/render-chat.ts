import { CHAT_CONTENT, type ChatLocale } from "./content";

export interface ChatElements {
  readonly root: HTMLElement;
  readonly particleCanvas: HTMLCanvasElement;
  readonly headerParticleCanvas: HTMLCanvasElement;
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
  root.dataset.chatPresentation = "guide";
  root.lang = locale === "zh" ? "zh-CN" : "en";
  root.setAttribute("aria-label", content.transcriptLabel);

  const panelId = `${root.id}-panel`;
  const particleCanvas = createElement("canvas", "chat-particle-canvas");
  particleCanvas.dataset.chatParticleCanvas = "";
  particleCanvas.setAttribute("aria-hidden", "true");
  const orb = createElement("button", "chat-orb");
  orb.type = "button";
  orb.dataset.chatOrb = "";
  orb.setAttribute("aria-controls", panelId);
  orb.setAttribute("aria-expanded", "false");
  orb.setAttribute(
    "aria-label",
    locale === "zh" ? "打开赵实旷的 AI 助手" : "Open Shikuang Zhao's AI assistant",
  );

  const panel = createElement("section", "chat-panel chat-scroll-region");
  panel.id = panelId;
  panel.dataset.chatPanel = "";
  panel.setAttribute("aria-hidden", "false");

  const panelHeader = createElement("header", "chat-panel__header");
  const panelTitle = createElement(
    "p",
    "chat-panel__title",
    locale === "zh" ? "ASK SHIKUANG · AI" : "ASK SHIKUANG · AI",
  );
  const ballAnchor = createElement("span", "chat-ball-anchor");
  ballAnchor.dataset.chatBallAnchor = "";
  ballAnchor.setAttribute("aria-hidden", "true");
  const headerParticleCanvas = createElement(
    "canvas",
    "chat-header-particle-canvas",
  );
  headerParticleCanvas.dataset.chatHeaderParticleCanvas = "";
  headerParticleCanvas.setAttribute("aria-hidden", "true");
  ballAnchor.append(headerParticleCanvas);
  const collapse = createElement("button", "chat-collapse");
  collapse.type = "button";
  collapse.dataset.chatCollapse = "";
  collapse.setAttribute(
    "aria-label",
    locale === "zh" ? "收起 AI 助手" : "Collapse AI assistant",
  );
  collapse.innerHTML = '<span aria-hidden="true"></span>';
  panelHeader.append(ballAnchor, panelTitle, collapse);

  const heading = createElement("div", "chat-heading");
  const accent = createElement("span", "chat-accent");
  accent.setAttribute("aria-hidden", "true");
  const label = createElement("p", "chat-label", content.assistantLabel);
  label.dataset.chatLabel = "";
  heading.append(accent, label);

  const intro = createElement("p", "chat-intro", content.intro);
  intro.dataset.chatIntro = "";

  const guide = createElement("section", "chat-guide");
  guide.dataset.chatGuide = "";
  guide.setAttribute("aria-label", content.recommendationsLabel);

  const quickStart = createElement("p", "chat-section-label", content.quickStartLabel);
  const primaryDescription = createElement(
    "p",
    "chat-primary-description",
    content.quickStartDescription,
  );
  const primary = createElement(
    "button",
    "chat-recommendation chat-recommendation--primary",
    content.recommendations[0],
  );
  primary.type = "button";
  primary.dataset.chatRecommendation = content.recommendations[0];
  primary.dataset.chatPrimaryQuestion = "";

  const topicLabel = createElement("p", "chat-section-label", content.topicLabel);
  const topicList = createElement("div", "chat-recommendations");
  const topicQuestionIndexes: readonly (readonly number[])[] = [[1, 3], [2]];
  const recommendationByQuestion = new Map<string, HTMLButtonElement>([
    [content.recommendations[0], primary],
  ]);
  for (const [topicIndex, questionIndexes] of topicQuestionIndexes.entries()) {
    const topic = createElement("section", "chat-topic");
    topic.dataset.chatTopic = "";
    const topicHeading = createElement(
      "p",
      "chat-topic__title",
      content.topicLabels[topicIndex],
    );
    topic.append(topicHeading);
    for (const questionIndex of questionIndexes) {
      const question = content.recommendations[questionIndex]!;
      const button = createElement("button", "chat-recommendation", question);
      button.type = "button";
      button.dataset.chatRecommendation = question;
      topic.append(button);
      recommendationByQuestion.set(question, button);
    }
    topicList.append(topic);
  }
  guide.append(quickStart, primary, primaryDescription, topicLabel, topicList);

  const composerLabel = createElement("label", "chat-composer-label", content.composerLabel);
  composerLabel.dataset.chatComposerLabel = "";

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
  composerLabel.htmlFor = "portfolio-chat-input";
  input.id = "portfolio-chat-input";
  const send = createElement("button", "chat-send", content.sendText);
  send.dataset.chatSend = "";
  send.type = "submit";
  send.setAttribute("aria-label", content.sendLabel);
  form.append(composerLabel, input, send);

  const status = createElement("p", "chat-status", content.disclosure);
  status.dataset.chatStatus = "";
  status.setAttribute("role", "status");

  panel.append(
    panelHeader,
    heading,
    intro,
    guide,
    transcript,
    sources,
    form,
    status,
  );
  root.append(particleCanvas, orb, panel);

  return {
    root,
    particleCanvas,
    headerParticleCanvas,
    orb,
    panel,
    collapse,
    form,
    input,
    send,
    transcript,
    sources,
    status,
    recommendations: content.recommendations.map((question) => {
      const button = recommendationByQuestion.get(question);
      if (!button) throw new Error("Chat recommendation markup is incomplete.");
      return button;
    }),
  };
}
