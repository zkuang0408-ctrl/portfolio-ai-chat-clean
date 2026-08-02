import { beforeEach, expect, test, vi } from "vitest";

import { renderChat } from "./render-chat";
import { startChatPresentation } from "./chat-presentation";

function setup() {
  const root = document.createElement("aside");
  const trigger = document.createElement("button");
  document.body.append(root, trigger);
  const elements = renderChat(root, "zh");
  const cleanup = startChatPresentation(elements, {
    trigger,
    window,
    scrollIdleMs: 250,
  });
  return { root, trigger, elements, cleanup };
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

test("opens from the orb or site navigation and collapses without replacing chat DOM", () => {
  const { root, trigger, elements, cleanup } = setup();
  const form = elements.form;

  expect(root.dataset.chatPresentation).toBe("collapsed");
  elements.orb.click();
  expect(root.dataset.chatPresentation).toBe("expanded");
  expect(elements.orb.getAttribute("aria-expanded")).toBe("true");
  expect(elements.panel.getAttribute("aria-hidden")).toBe("false");

  elements.collapse.click();
  expect(root.dataset.chatPresentation).toBe("collapsed");
  trigger.click();
  expect(root.dataset.chatPresentation).toBe("expanded");
  expect(elements.form).toBe(form);
  cleanup();
});

test("collapses on scroll and does not reopen when scrolling stops", () => {
  vi.useFakeTimers();
  const { root, elements, cleanup } = setup();
  elements.orb.click();

  window.dispatchEvent(new Event("scroll"));
  expect(root.dataset.chatPresentation).toBe("collapsed");
  expect(root.dataset.chatScrolling).toBe("true");

  vi.advanceTimersByTime(250);
  expect(root.dataset.chatScrolling).toBeUndefined();
  expect(root.dataset.chatPresentation).toBe("collapsed");
  cleanup();
});

test("Escape collapses and cleanup removes all presentation listeners", () => {
  const { root, trigger, elements, cleanup } = setup();
  trigger.click();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(root.dataset.chatPresentation).toBe("collapsed");

  cleanup();
  trigger.click();
  elements.orb.click();
  expect(root.dataset.chatPresentation).toBe("collapsed");
});
