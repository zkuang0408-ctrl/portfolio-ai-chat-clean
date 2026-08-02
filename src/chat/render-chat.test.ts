import { expect, test } from "vitest";

import { CHAT_CONTENT } from "./content";
import { renderChat } from "./render-chat";

test("renders the approved Chinese assistant copy and four balanced recommendations", () => {
  const root = document.createElement("aside");

  const elements = renderChat(root, "zh");

  expect(root.querySelector("[data-chat-label]")?.textContent).toBe(
    "ASK SHIKUANG · AI",
  );
  expect(root.querySelector("[data-chat-intro]")?.textContent).toContain("AI");
  expect(root.querySelector("[data-chat-intro]")?.textContent).toContain(
    "依据",
  );
  expect(
    Array.from(elements.recommendations, (button) => button.textContent),
  ).toEqual(CHAT_CONTENT.zh.recommendations);
  expect(elements.recommendations).toHaveLength(4);
});

test("localizes the assistant content and recommendation prompts in English", () => {
  const root = document.createElement("aside");

  const elements = renderChat(root, "en");

  expect(root.querySelector("[data-chat-intro]")?.textContent).toContain(
    "AI portfolio assistant",
  );
  expect(root.querySelector("[data-chat-intro]")?.textContent).toContain(
    "grounded",
  );
  expect(
    Array.from(elements.recommendations, (button) => button.textContent),
  ).toEqual(CHAT_CONTENT.en.recommendations);
  expect(elements.input.placeholder).toBe(CHAT_CONTENT.en.placeholder);
  expect(root.lang).toBe("en");
});

test("marks Chinese content with a specific document language", () => {
  const root = document.createElement("aside");

  renderChat(root, "zh");

  expect(root.lang).toBe("zh-CN");
});

test("returns scoped typed controls for the future browser controller", () => {
  const root = document.createElement("aside");

  const elements = renderChat(root, "zh");

  expect(elements.root).toBe(root);
  expect(elements.form).toBe(root.querySelector("form"));
  expect(elements.input).toBeInstanceOf(HTMLTextAreaElement);
  expect(elements.send).toBeInstanceOf(HTMLButtonElement);
  expect(elements.transcript).toBe(root.querySelector("[data-chat-transcript]"));
  expect(elements.sources).toBe(root.querySelector("[data-chat-sources]"));
  expect(elements.status).toBe(root.querySelector("[data-chat-status]"));
  expect(elements.recommendations.every((button) => root.contains(button))).toBe(
    true,
  );
});

test("provides accessible live, composer, status, and source regions", () => {
  const root = document.createElement("aside");

  const elements = renderChat(root, "zh");

  expect(elements.transcript.getAttribute("aria-live")).toBe("polite");
  expect(elements.input.getAttribute("aria-label")).toBe(
    CHAT_CONTENT.zh.inputLabel,
  );
  expect(elements.send.getAttribute("aria-label")).toBe(
    CHAT_CONTENT.zh.sendLabel,
  );
  expect(elements.sources.getAttribute("aria-label")).toBe(
    CHAT_CONTENT.zh.sourcesLabel,
  );
  expect(elements.status.textContent).toContain("AI");
});

test("renders a persistent collapsible assistant shell without a modal", () => {
  const root = document.createElement("aside");

  const elements = renderChat(root, "zh");

  expect(elements.panel.classList.contains("chat-scroll-region")).toBe(true);
  expect(root.querySelector('[role="dialog"]')).toBeNull();
  expect(root.querySelector("dialog")).toBeNull();
  expect(elements.orb.getAttribute("aria-expanded")).toBe("false");
  expect(elements.orb.getAttribute("aria-controls")).toBe(elements.panel.id);
  expect(elements.panel.getAttribute("aria-hidden")).toBe("true");
  expect(elements.collapse.getAttribute("aria-label")).toContain("收起");
  expect(elements.panel.contains(elements.form)).toBe(true);
});
