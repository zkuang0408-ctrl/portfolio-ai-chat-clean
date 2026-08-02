import { beforeEach, expect, test, vi } from "vitest";

import { renderNavigation } from "./render-navigation";
import { startSectionState } from "./section-state";

let observerCallback: IntersectionObserverCallback;
const observe = vi.fn();
const disconnect = vi.fn();

class ObserverStub {
  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback;
  }

  observe = observe;
  disconnect = disconnect;
}

function entry(target: Element, ratio: number): IntersectionObserverEntry {
  return {
    target,
    intersectionRatio: ratio,
    isIntersecting: ratio > 0,
  } as IntersectionObserverEntry;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  observe.mockClear();
  disconnect.mockClear();
});

test("observes each navigable section and marks the most visible link", () => {
  const app = document.querySelector<HTMLElement>("#app")!;
  const navigation = renderNavigation(app);
  app.insertAdjacentHTML(
    "beforeend",
    '<section id="resume"></section><section id="projects"></section><section id="contact"></section>',
  );

  const cleanup = startSectionState(navigation.root, app, {
    IntersectionObserver: ObserverStub as unknown as typeof IntersectionObserver,
  });

  expect(observe).toHaveBeenCalledTimes(3);
  const resume = app.querySelector("#resume")!;
  const projects = app.querySelector("#projects")!;
  observerCallback(
    [entry(resume, 0.2), entry(projects, 0.7)],
    {} as IntersectionObserver,
  );

  expect(navigation.root.querySelector('a[href="#projects"]')?.getAttribute("aria-current"))
    .toBe("location");
  expect(navigation.root.querySelector('a[href="#resume"]')?.hasAttribute("aria-current"))
    .toBe(false);
  cleanup();
  expect(disconnect).toHaveBeenCalledOnce();
});

test("click feedback updates immediately while smooth scrolling catches up", () => {
  const app = document.querySelector<HTMLElement>("#app")!;
  const navigation = renderNavigation(app);
  app.insertAdjacentHTML(
    "beforeend",
    '<section id="resume"></section><section id="projects"></section><section id="contact"></section>',
  );
  const cleanup = startSectionState(navigation.root, app, {
    IntersectionObserver: ObserverStub as unknown as typeof IntersectionObserver,
  });

  navigation.root.querySelector<HTMLAnchorElement>('a[href="#contact"]')?.click();
  expect(navigation.root.querySelector('a[href="#contact"]')?.getAttribute("aria-current"))
    .toBe("location");
  cleanup();
});
