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

  expect(root.dataset.chatPresentation).toBe("guide");
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

test("starts as a discoverable hero guide before it collapses into the dock", () => {
  const { root, cleanup } = setup();

  expect(root.dataset.chatPresentation).toBe("guide");
  Object.defineProperty(window, "scrollY", { configurable: true, value: 120 });
  window.dispatchEvent(new Event("scroll"));
  expect(root.dataset.chatPresentation).toBe("collapsed");
  cleanup();
});

test("does not interpret the click emitted after a drag as an expand request", () => {
  const { root, elements, cleanup } = setup();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 120 });
  window.dispatchEvent(new Event("scroll"));

  elements.orb.dispatchEvent(new MouseEvent("pointerdown", {
    bubbles: true,
    button: 0,
    clientX: 1200,
    clientY: 640,
  }));
  elements.orb.dispatchEvent(new MouseEvent("pointermove", {
    bubbles: true,
    clientX: 24,
    clientY: 320,
  }));
  elements.orb.dispatchEvent(new MouseEvent("pointerup", {
    bubbles: true,
    clientX: 24,
    clientY: 320,
  }));
  elements.orb.click();

  expect(root.dataset.chatPresentation).toBe("collapsed");
  expect(root.dataset.chatDock).toBe("left");
  cleanup();
});

test("collapses on scroll and does not reopen when scrolling stops", () => {
  vi.useFakeTimers();
  const { root, elements, cleanup } = setup();
  elements.orb.click();

  Object.defineProperty(window, "scrollY", { configurable: true, value: 120 });
  window.dispatchEvent(new Event("scroll"));
  expect(root.dataset.chatPresentation).toBe("collapsed");
  expect(root.dataset.chatScrolling).toBe("true");

  vi.advanceTimersByTime(250);
  expect(root.dataset.chatScrolling).toBeUndefined();
  expect(root.dataset.chatPresentation).toBe("collapsed");
  cleanup();
});

test("rebuilds the homepage guide after returning to the hero top", () => {
  const { root, cleanup } = setup();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 120 });
  window.dispatchEvent(new Event("scroll"));
  expect(root.dataset.chatPresentation).toBe("collapsed");

  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  window.dispatchEvent(new Event("scroll"));

  expect(root.dataset.chatPresentation).toBe("guide");
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
