import { beforeEach, expect, test, vi } from "vitest";

import { renderChat } from "./render-chat";
import { startChatPresentation } from "./chat-presentation";

class VisualViewportStub extends EventTarget {
  height: number;
  offsetTop: number;

  constructor(height: number, offsetTop = 0) {
    super();
    this.height = height;
    this.offsetTop = offsetTop;
  }

  setGeometry({ height, offsetTop }: { height: number; offsetTop: number }) {
    this.height = height;
    this.offsetTop = offsetTop;
  }
}

function installVisualViewport(viewport: VisualViewportStub) {
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });
}

function setup(options: { collapseDurationMs?: number; initialDock?: "left" | "right" } = {}) {
  const root = document.createElement("aside");
  const trigger = document.createElement("button");
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  document.body.append(root, trigger);
  if (options.initialDock) root.dataset.chatDock = options.initialDock;
  const elements = renderChat(root, "zh");
  const cleanup = startChatPresentation(elements, {
    trigger,
    window,
    scrollIdleMs: 250,
    collapseDurationMs: options.collapseDurationMs,
  });
  return { root, trigger, elements, cleanup };
}

function pointerEvent(
  type: string,
  init: {
    pointerId: number;
    clientX: number;
    clientY: number;
    button?: number;
    pointerType?: string;
  },
): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    button: { value: init.button ?? 0 },
    clientX: { value: init.clientX },
    clientY: { value: init.clientY },
    pointerId: { value: init.pointerId },
    pointerType: { value: init.pointerType ?? "mouse" },
  });
  return event;
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1_024 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined });
});

test("opens from the orb or site navigation and collapses without replacing chat DOM", () => {
  vi.useFakeTimers();
  const { root, trigger, elements, cleanup } = setup({ collapseDurationMs: 360 });
  const form = elements.form;

  expect(root.dataset.chatPresentation).toBe("guide");
  elements.orb.click();
  expect(root.dataset.chatPresentation).toBe("expanded");
  expect(elements.orb.getAttribute("aria-expanded")).toBe("true");
  expect(elements.panel.getAttribute("aria-hidden")).toBe("false");

  elements.collapse.click();
  expect(root.dataset.chatPresentation).toBe("collapsing");
  vi.advanceTimersByTime(360);
  expect(root.dataset.chatPresentation).toBe("collapsed");
  trigger.click();
  expect(root.dataset.chatPresentation).toBe("expanding");
  vi.advanceTimersByTime(20);
  expect(root.dataset.chatPresentation).toBe("expanded");
  expect(elements.form).toBe(form);
  cleanup();
});

test("opens the full panel from the compact mobile guide without submitting", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  const { root, elements, cleanup } = setup({ collapseDurationMs: 0 });
  const submit = vi.fn();
  elements.form.addEventListener("submit", submit);

  elements.mobileGuideAction.click();

  expect(root.dataset.chatPresentation).toBe("expanded");
  expect(elements.orb.getAttribute("aria-expanded")).toBe("true");
  expect(elements.panel.getAttribute("aria-hidden")).toBe("false");
  expect(submit).not.toHaveBeenCalled();
  cleanup();
});

test("collapses a guide-opened mobile panel toward the current orb dock", () => {
  vi.useFakeTimers();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(390);
  const { root, elements, cleanup } = setup();
  vi.spyOn(elements.panel, "getBoundingClientRect").mockReturnValue({
    x: 12,
    y: 100,
    top: 100,
    right: 378,
    bottom: 700,
    left: 12,
    width: 366,
    height: 600,
    toJSON: () => ({}),
  } as DOMRect);

  elements.mobileGuideAction.click();
  elements.collapse.click();

  expect(root.dataset.chatPresentation).toBe("collapsing");
  expect(root.dataset.chatTransition).toBe("closing");
  expect(elements.panel.style.getPropertyValue("--chat-panel-shift-x")).toBe("-151px");
  expect(elements.panel.style.getPropertyValue("--chat-panel-shift-y")).toBe("-228px");
  cleanup();
});

test("materializes the mobile panel from the docked orb before focusing the composer", () => {
  vi.useFakeTimers();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(390);
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const { root, elements, cleanup } = setup();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));
  vi.advanceTimersByTime(260);
  expect(root.dataset.chatPresentation).toBe("collapsed");
  vi.spyOn(elements.orb, "getBoundingClientRect").mockReturnValue({
    x: 16,
    y: 144,
    top: 144,
    right: 72,
    bottom: 200,
    left: 16,
    width: 56,
    height: 56,
    toJSON: () => ({}),
  } as DOMRect);
  vi.spyOn(elements.panel, "getBoundingClientRect").mockReturnValue({
    x: 12,
    y: 100,
    top: 100,
    right: 378,
    bottom: 700,
    left: 12,
    width: 366,
    height: 600,
    toJSON: () => ({}),
  } as DOMRect);

  elements.orb.click();

  expect(root.dataset.chatPresentation).toBe("expanding");
  expect(root.dataset.chatTransition).toBe("opening");
  expect(elements.panel.style.getPropertyValue("--chat-panel-shift-x")).toBe("-151px");
  expect(elements.panel.style.getPropertyValue("--chat-panel-shift-y")).toBe("-228px");
  expect(document.activeElement).not.toBe(elements.input);

  frames.shift()?.(0);
  expect(root.dataset.chatPresentation).toBe("expanding");
  frames.shift()?.(16);
  expect(root.dataset.chatPresentation).toBe("expanded");
  expect(root.dataset.chatTransition).toBe("opening");
  vi.advanceTimersByTime(319);
  expect(document.activeElement).not.toBe(elements.input);
  vi.advanceTimersByTime(1);
  expect(root.dataset.chatTransition).toBeUndefined();
  expect(document.activeElement).toBe(elements.input);
  cleanup();
});

test("cancels delayed mobile focus when closing interrupts the opening transition", () => {
  vi.useFakeTimers();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(390);
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const { root, elements, cleanup } = setup();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));
  elements.orb.click();
  frames.shift()?.(0);
  frames.shift()?.(16);
  expect(root.dataset.chatTransition).toBe("opening");

  elements.collapse.click();

  expect(root.dataset.chatPresentation).toBe("collapsing");
  expect(root.dataset.chatTransition).toBe("closing");
  vi.advanceTimersByTime(259);
  expect(root.dataset.chatPresentation).toBe("collapsing");
  vi.advanceTimersByTime(1);
  expect(root.dataset.chatPresentation).toBe("collapsed");
  expect(root.dataset.chatTransition).toBeUndefined();
  expect(document.activeElement).not.toBe(elements.input);
  cleanup();
});

test("expands from the docked ball through a mirrored scale state", () => {
  vi.useFakeTimers();
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const { root, trigger, elements, cleanup } = setup({ collapseDurationMs: 380 });
  Object.defineProperty(elements.panel, "offsetHeight", {
    configurable: true,
    value: 556,
  });
  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));
  vi.advanceTimersByTime(380);
  expect(root.dataset.chatPresentation).toBe("collapsed");

  trigger.click();
  expect(root.dataset.chatPresentation).toBe("expanding");
  expect(root.style.getPropertyValue("--chat-dock-y")).toBe("438px");
  expect(elements.panel.getAttribute("aria-hidden")).toBe("false");
  frames.shift()?.(0);
  expect(root.dataset.chatPresentation).toBe("expanded");
  cleanup();
});

test("opens immediately from the dock when reduced motion is requested", () => {
  const originalMatchMedia = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList)),
  });
  const { root, trigger, cleanup } = setup();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));
  expect(root.dataset.chatPresentation).toBe("collapsed");

  trigger.click();
  expect(root.dataset.chatPresentation).toBe("expanded");
  cleanup();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
});

test("starts as a discoverable hero guide before it collapses into the dock", () => {
  vi.useFakeTimers();
  const { root, cleanup } = setup({ collapseDurationMs: 360 });

  expect(root.dataset.chatPresentation).toBe("guide");
  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));
  expect(root.dataset.chatPresentation).toBe("collapsing");
  vi.advanceTimersByTime(360);
  expect(root.dataset.chatPresentation).toBe("collapsed");
  cleanup();
});

test("docks the particle ball on the left on its first collapse", () => {
  vi.useFakeTimers();
  const { root, cleanup } = setup({ collapseDurationMs: 360 });

  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));
  vi.advanceTimersByTime(360);

  expect(root.dataset.chatDock).toBe("left");
  expect(root.style.getPropertyValue("--chat-dock-x")).toBe("54px");
  cleanup();
});

test("starts the docked particle orb in the upper-left safe zone", () => {
  const { root, cleanup } = setup();

  expect(root.dataset.chatDock).toBe("left");
  expect(root.style.getPropertyValue("--chat-dock-x")).toBe("54px");
  expect(root.style.getPropertyValue("--chat-dock-y")).toBe("172px");
  cleanup();
});

test("keeps the guide open for incidental scroll and collapses after the threshold", () => {
  vi.useFakeTimers();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  const { root, cleanup } = setup({ collapseDurationMs: 360 });

  Object.defineProperty(window, "scrollY", { configurable: true, value: 80 });
  window.dispatchEvent(new Event("scroll"));
  expect(root.dataset.chatPresentation).toBe("guide");

  Object.defineProperty(window, "scrollY", { configurable: true, value: 180 });
  window.dispatchEvent(new Event("scroll"));
  expect(root.dataset.chatPresentation).toBe("collapsing");
  vi.advanceTimersByTime(360);
  expect(root.dataset.chatPresentation).toBe("collapsed");
  cleanup();
});

test("does not interpret the click emitted after a drag as an expand request", () => {
  vi.useFakeTimers();
  const { root, elements, cleanup } = setup();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));
  vi.runOnlyPendingTimers();

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

test("keeps a 12px touch drift as an orb tap on mobile", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(390);
  const { root, elements, cleanup } = setup({ collapseDurationMs: 0 });
  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));
  expect(root.dataset.chatPresentation).toBe("collapsed");

  elements.orb.dispatchEvent(pointerEvent("pointerdown", {
    pointerId: 1,
    pointerType: "touch",
    clientX: 44,
    clientY: 172,
  }));
  elements.orb.dispatchEvent(pointerEvent("pointermove", {
    pointerId: 1,
    pointerType: "touch",
    clientX: 56,
    clientY: 172,
  }));
  elements.orb.dispatchEvent(pointerEvent("pointerup", {
    pointerId: 1,
    pointerType: "touch",
    clientX: 56,
    clientY: 172,
  }));
  elements.orb.dispatchEvent(pointerEvent("click", {
    pointerId: 1,
    pointerType: "touch",
    clientX: 56,
    clientY: 172,
  }));

  expect(root.dataset.chatDragging).toBeUndefined();
  expect(root.dataset.chatPresentation).toBe("expanding");
  cleanup();
});

test("opens on touch release even when the browser omits a compatibility click", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 430 });
  const { root, elements, cleanup } = setup({ collapseDurationMs: 0 });
  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));

  elements.orb.dispatchEvent(pointerEvent("pointerdown", {
    pointerId: 1,
    pointerType: "touch",
    clientX: 44,
    clientY: 172,
  }));
  elements.orb.dispatchEvent(pointerEvent("pointermove", {
    pointerId: 1,
    pointerType: "touch",
    clientX: 56,
    clientY: 172,
  }));
  elements.orb.dispatchEvent(pointerEvent("pointerup", {
    pointerId: 1,
    pointerType: "touch",
    clientX: 56,
    clientY: 172,
  }));

  expect(root.dataset.chatPresentation).toBe("expanding");
  elements.orb.click();
  expect(root.dataset.chatPresentation).toBe("expanding");
  cleanup();
});

test("exposes mobile orb press feedback for the full trusted-pointer lifetime", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  const { elements, cleanup } = setup({ collapseDurationMs: 0 });

  elements.orb.dispatchEvent(pointerEvent("pointerdown", {
    pointerId: 1,
    pointerType: "touch",
    clientX: 44,
    clientY: 172,
  }));
  expect(elements.orb.dataset.chatPressed).toBe("true");

  elements.orb.dispatchEvent(pointerEvent("pointerup", {
    pointerId: 1,
    pointerType: "touch",
    clientX: 44,
    clientY: 172,
  }));
  expect(elements.orb.dataset.chatPressed).toBeUndefined();

  elements.orb.dispatchEvent(pointerEvent("pointerdown", {
    pointerId: 2,
    pointerType: "touch",
    clientX: 44,
    clientY: 172,
  }));
  elements.orb.dispatchEvent(pointerEvent("pointercancel", {
    pointerId: 2,
    pointerType: "touch",
    clientX: 44,
    clientY: 172,
  }));
  expect(elements.orb.dataset.chatPressed).toBeUndefined();
  cleanup();
});

test("treats touch movement beyond 12px as a deliberate drag", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(390);
  const { root, elements, cleanup } = setup({ collapseDurationMs: 0 });
  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));

  elements.orb.dispatchEvent(pointerEvent("pointerdown", {
    pointerId: 1,
    pointerType: "touch",
    clientX: 44,
    clientY: 172,
  }));
  elements.orb.dispatchEvent(pointerEvent("pointermove", {
    pointerId: 1,
    pointerType: "touch",
    clientX: 57,
    clientY: 172,
  }));
  expect(root.dataset.chatDragging).toBe("true");
  elements.orb.dispatchEvent(pointerEvent("pointerup", {
    pointerId: 1,
    pointerType: "touch",
    clientX: 57,
    clientY: 172,
  }));
  elements.orb.click();

  expect(root.dataset.chatPresentation).toBe("collapsed");
  cleanup();
});

test("keeps the mobile panel open while its input owns focus", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  const { root, elements, cleanup } = setup({ collapseDurationMs: 0 });
  elements.mobileGuideAction.click();
  elements.input.focus();

  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));

  expect(root.dataset.chatPresentation).toBe("expanded");
  cleanup();
});

test("does not collapse while an assistant presentation transition is active", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  const { root, cleanup } = setup({ collapseDurationMs: 0 });
  root.dataset.chatTransition = "opening";

  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));

  expect(root.dataset.chatPresentation).toBe("guide");
  cleanup();
});

test("tracks the particle ball freely during drag and docks only after release", () => {
  vi.useFakeTimers();
  const { root, elements, cleanup } = setup({ collapseDurationMs: 360 });
  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));
  vi.advanceTimersByTime(360);
  const startX = Number.parseFloat(root.style.getPropertyValue("--chat-dock-x"));
  const startY = Number.parseFloat(root.style.getPropertyValue("--chat-dock-y"));

  elements.orb.dispatchEvent(new MouseEvent("pointerdown", {
    bubbles: true,
    button: 0,
    clientX: startX,
    clientY: startY,
  }));
  elements.orb.dispatchEvent(new MouseEvent("pointermove", {
    bubbles: true,
    clientX: 400,
    clientY: 300,
  }));

  expect(root.dataset.chatDragging).toBe("true");
  expect(root.style.getPropertyValue("--chat-dock-x")).toBe("400px");
  expect(root.style.getPropertyValue("--chat-dock-y")).toBe("300px");

  elements.orb.dispatchEvent(new MouseEvent("pointerup", {
    bubbles: true,
    clientX: 400,
    clientY: 300,
  }));

  expect(root.dataset.chatDragging).toBeUndefined();
  expect(root.dataset.chatDock).toBe("left");
  expect(root.style.getPropertyValue("--chat-dock-x")).toBe("54px");
  cleanup();
});

test("uses a 28px radius for mobile drag and release docking", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(390);
  const { root, elements, cleanup } = setup({ collapseDurationMs: 0 });

  expect(root.style.getPropertyValue("--chat-dock-x")).toBe("44px");
  elements.collapse.click();
  elements.orb.dispatchEvent(pointerEvent("pointerdown", {
    pointerId: 1,
    clientX: 44,
    clientY: 172,
  }));
  elements.orb.dispatchEvent(pointerEvent("pointermove", {
    pointerId: 1,
    clientX: 340,
    clientY: 300,
  }));
  expect(root.style.getPropertyValue("--chat-dock-x")).toBe("340px");
  elements.orb.dispatchEvent(pointerEvent("pointerup", {
    pointerId: 1,
    clientX: 340,
    clientY: 300,
  }));
  expect(root.dataset.chatDock).toBe("right");
  expect(root.style.getPropertyValue("--chat-dock-x")).toBe("346px");
  cleanup();
});

test("keeps one pointer in control of a particle-ball drag", () => {
  vi.useFakeTimers();
  const { root, elements, cleanup } = setup({ collapseDurationMs: 0 });
  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));
  const startX = Number.parseFloat(root.style.getPropertyValue("--chat-dock-x"));
  const startY = Number.parseFloat(root.style.getPropertyValue("--chat-dock-y"));

  elements.orb.dispatchEvent(pointerEvent("pointerdown", {
    pointerId: 1,
    clientX: startX,
    clientY: startY,
  }));
  elements.orb.dispatchEvent(pointerEvent("pointermove", {
    pointerId: 2,
    clientX: 500,
    clientY: 320,
  }));
  expect(root.dataset.chatDragging).toBeUndefined();
  expect(root.style.getPropertyValue("--chat-dock-x")).toBe("54px");

  elements.orb.dispatchEvent(pointerEvent("pointermove", {
    pointerId: 1,
    clientX: 400,
    clientY: 300,
  }));
  expect(root.dataset.chatDragging).toBe("true");
  elements.orb.dispatchEvent(pointerEvent("pointerup", {
    pointerId: 2,
    clientX: 500,
    clientY: 320,
  }));
  expect(root.dataset.chatDragging).toBe("true");

  elements.orb.dispatchEvent(pointerEvent("pointerup", {
    pointerId: 1,
    clientX: 400,
    clientY: 300,
  }));
  expect(root.dataset.chatDragging).toBeUndefined();
  cleanup();
});

test("does not suppress the next click after a cancelled drag", () => {
  const { root, elements, cleanup } = setup({ collapseDurationMs: 0 });
  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));

  elements.orb.dispatchEvent(pointerEvent("pointerdown", {
    pointerId: 1,
    clientX: 54,
    clientY: 172,
  }));
  elements.orb.dispatchEvent(pointerEvent("pointermove", {
    pointerId: 1,
    clientX: 400,
    clientY: 300,
  }));
  elements.orb.dispatchEvent(pointerEvent("pointercancel", {
    pointerId: 1,
    clientX: 400,
    clientY: 300,
  }));
  elements.orb.click();

  expect(root.dataset.chatPresentation).toBe("expanding");
  cleanup();
});

test("uses the layout viewport so the docked ball stays clear of desktop scrollbars", () => {
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1_000);
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1_024 });
  const { root, cleanup } = setup({ initialDock: "right" });

  expect(root.style.getPropertyValue("--chat-dock-x")).toBe("946px");
  cleanup();
});

test("nudges the expanded panel away from protected hero content", () => {
  const { root, elements, cleanup } = setup();
  const headline = document.createElement("div");
  headline.className = "hero-copy headline";
  document.body.append(headline);
  vi.spyOn(elements.panel, "getBoundingClientRect").mockReturnValue({
    x: 900,
    y: 500,
    top: 500,
    right: 1300,
    bottom: 900,
    left: 900,
    width: 400,
    height: 400,
    toJSON: () => ({}),
  } as DOMRect);
  vi.spyOn(headline, "getBoundingClientRect").mockReturnValue({
    x: 980,
    y: 760,
    top: 760,
    right: 1400,
    bottom: 900,
    left: 980,
    width: 420,
    height: 140,
    toJSON: () => ({}),
  } as DOMRect);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });

  const before = Number.parseFloat(root.style.getPropertyValue("--chat-dock-y"));
  elements.orb.click();
  const after = Number.parseFloat(root.style.getPropertyValue("--chat-dock-y"));

  expect(root.dataset.chatPresentation).toBe("expanded");
  expect(after).toBeLessThan(before);
  cleanup();
});

test("collapses on scroll and does not reopen when scrolling stops", () => {
  vi.useFakeTimers();
  const { root, elements, cleanup } = setup();
  elements.orb.click();

  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));
  expect(root.dataset.chatPresentation).toBe("collapsing");
  expect(root.dataset.chatScrolling).toBe("true");

  vi.advanceTimersByTime(250);
  expect(root.dataset.chatScrolling).toBeUndefined();
  vi.advanceTimersByTime(130);
  expect(root.dataset.chatPresentation).toBe("collapsed");
  cleanup();
});

test("rebuilds the homepage guide after returning to the hero top", () => {
  vi.useFakeTimers();
  const { root, cleanup } = setup();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));
  vi.runOnlyPendingTimers();
  expect(root.dataset.chatPresentation).toBe("collapsed");

  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  window.dispatchEvent(new Event("scroll"));

  expect(root.dataset.chatPresentation).toBe("guide");
  cleanup();
});

test("Escape collapses and cleanup removes all presentation listeners", () => {
  vi.useFakeTimers();
  const { root, trigger, elements, cleanup } = setup({ collapseDurationMs: 360 });
  trigger.click();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(root.dataset.chatPresentation).toBe("collapsing");
  vi.advanceTimersByTime(360);
  expect(root.dataset.chatPresentation).toBe("collapsed");

  cleanup();
  trigger.click();
  elements.orb.click();
  expect(root.dataset.chatPresentation).toBe("collapsed");
});

test("returns focus to the particle ball when the collapse control closes the panel", () => {
  const { root, elements, cleanup } = setup({ collapseDurationMs: 0 });
  elements.orb.click();
  elements.collapse.focus();

  elements.collapse.click();

  expect(root.dataset.chatPresentation).toBe("collapsed");
  expect(document.activeElement).toBe(elements.orb);
  cleanup();
});

test("batches mobile keyboard viewport motion and keeps the expanded panel open", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
  const visualViewport = new VisualViewportStub(844);
  installVisualViewport(visualViewport);
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const { root, elements, cleanup } = setup({ collapseDurationMs: 0 });
  frames.splice(0);
  elements.mobileGuideAction.click();
  elements.input.focus();
  while (frames.length > 0) frames.shift()?.(0);

  visualViewport.setGeometry({ height: 520, offsetTop: 44 });
  visualViewport.dispatchEvent(new Event("resize"));
  visualViewport.dispatchEvent(new Event("scroll"));

  expect(frames).toHaveLength(1);
  frames.shift()?.(0);
  expect(root.dataset.chatKeyboard).toBe("active");
  expect(root.style.getPropertyValue("--chat-visual-top")).toBe("70px");
  expect(root.style.getPropertyValue("--chat-visual-bottom")).toBe("280px");
  expect(root.style.getPropertyValue("--chat-visual-height")).toBe("494px");

  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));
  expect(root.dataset.chatPresentation).toBe("expanded");
  cleanup();
});

test("tracks mobile viewport geometry from focus before keyboard activation", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
  const visualViewport = new VisualViewportStub(844);
  installVisualViewport(visualViewport);
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const { root, elements, cleanup } = setup({ collapseDurationMs: 0 });
  frames.splice(0);
  elements.mobileGuideAction.click();
  elements.input.focus();
  while (frames.length > 0) frames.shift()?.(0);

  visualViewport.setGeometry({ height: 800, offsetTop: 0 });
  visualViewport.dispatchEvent(new Event("resize"));
  frames.shift()?.(0);

  expect(root.dataset.chatKeyboard).toBeUndefined();
  expect(root.style.getPropertyValue("--chat-visual-top")).toBe("70px");
  expect(root.style.getPropertyValue("--chat-visual-bottom")).toBe("44px");
  expect(root.style.getPropertyValue("--chat-visual-height")).toBe("730px");
  cleanup();
});

test("restores keyboard-induced page displacement after the viewport settles", () => {
  vi.useFakeTimers();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
  const visualViewport = new VisualViewportStub(844);
  installVisualViewport(visualViewport);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  const scrollTo = vi.fn();
  Object.defineProperty(window, "scrollTo", { configurable: true, value: scrollTo });
  const { root, elements, cleanup } = setup({ collapseDurationMs: 0 });
  elements.mobileGuideAction.click();
  elements.input.focus();
  visualViewport.setGeometry({ height: 520, offsetTop: 44 });
  visualViewport.dispatchEvent(new Event("resize"));
  expect(root.dataset.chatKeyboard).toBe("active");

  Object.defineProperty(window, "scrollY", { configurable: true, value: 96 });
  elements.input.blur();
  visualViewport.setGeometry({ height: 844, offsetTop: 0 });
  visualViewport.dispatchEvent(new Event("resize"));
  expect(root.dataset.chatKeyboard).toBeUndefined();
  window.dispatchEvent(new Event("scroll"));
  expect(root.dataset.chatPresentation).toBe("expanded");

  vi.advanceTimersByTime(180);
  expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  expect(root.style.getPropertyValue("--chat-visual-bottom")).toBe("");
  expect(root.style.getPropertyValue("--chat-visual-height")).toBe("");
  cleanup();
});

test("does not activate mobile keyboard geometry on desktop", () => {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
  const visualViewport = new VisualViewportStub(520, 44);
  installVisualViewport(visualViewport);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  const { root, elements, cleanup } = setup({ collapseDurationMs: 0 });
  elements.input.focus();
  visualViewport.dispatchEvent(new Event("resize"));

  expect(root.dataset.chatKeyboard).toBeUndefined();
  cleanup();
});

test("does not schedule a keyboard frame for ordinary unfocused viewport resize", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
  const visualViewport = new VisualViewportStub(844);
  installVisualViewport(visualViewport);
  const frame = vi.spyOn(window, "requestAnimationFrame");
  const { root, cleanup } = setup({ collapseDurationMs: 0 });
  frame.mockClear();

  visualViewport.setGeometry({ height: 700, offsetTop: 0 });
  visualViewport.dispatchEvent(new Event("resize"));

  expect(frame).not.toHaveBeenCalled();
  expect(root.dataset.chatKeyboard).toBeUndefined();
  cleanup();
});
