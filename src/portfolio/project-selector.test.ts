import { expect, test, vi } from "vitest";

import { startProjectSelector } from "./project-selector";

function createRoot(): HTMLElement {
  const root = document.createElement("main");
  root.innerHTML = `
    <a href="#project-inkseat" data-project-selector="inkseat">INKSeat</a>
    <a href="#project-emovue" data-project-selector="emovue">EMOVUE</a>
    <article id="project-inkseat" data-project-chapter="inkseat"></article>
    <article id="project-emovue" data-project-chapter="emovue"></article>
  `;
  return root;
}

test("maps selector activation to its matching chapter", () => {
  const root = createRoot();
  const scrollIntoView = vi.fn();
  const cleanup = startProjectSelector(root, { scrollIntoView });

  root.querySelector<HTMLElement>('[data-project-selector="emovue"]')?.click();

  expect(scrollIntoView).toHaveBeenCalledWith(
    root.querySelector('[data-project-chapter="emovue"]'),
  );
  expect(
    root.querySelector('[data-project-selector="emovue"]')?.getAttribute("aria-current"),
  ).toBe("true");
  cleanup();
});

test("updates active state from visible chapters without stealing focus", () => {
  const root = createRoot();
  let callback: IntersectionObserverCallback = () => undefined;
  const disconnect = vi.fn();
  class FakeIntersectionObserver {
    constructor(value: IntersectionObserverCallback) {
      callback = value;
    }
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = disconnect;
  }
  const activeElementBefore = document.activeElement;
  const cleanup = startProjectSelector(root, {
    IntersectionObserver: FakeIntersectionObserver,
  });
  const emovue = root.querySelector<HTMLElement>('[data-project-chapter="emovue"]')!;

  callback(
    [{ target: emovue, isIntersecting: true, intersectionRatio: 0.7 } as unknown as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );

  expect(
    root.querySelector('[data-project-selector="emovue"]')?.getAttribute("aria-current"),
  ).toBe("true");
  expect(document.activeElement).toBe(activeElementBefore);
  cleanup();
  expect(disconnect).toHaveBeenCalledOnce();
});
