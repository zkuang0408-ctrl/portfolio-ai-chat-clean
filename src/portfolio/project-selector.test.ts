import { expect, test, vi } from "vitest";

import { dispatchProjectActivation } from "./project-activation";
import { startProjectSelector } from "./project-selector";

function createRoot(): HTMLElement {
  const root = document.createElement("main");
  root.innerHTML = `
    <a href="#project-inkseat" data-project-selector="inkseat">INKSeat</a>
    <a href="#project-emovue" data-project-selector="emovue">EMOVUE</a>
    <article id="project-inkseat" data-project-chapter="inkseat"></article>
    <article id="project-emovue" data-project-chapter="emovue"></article>
  `;
  root.querySelectorAll<HTMLElement>("[data-project-chapter]").forEach((item) => {
    item.scrollIntoView = vi.fn();
  });
  return root;
}

function selector(root: HTMLElement, id: string): HTMLElement {
  return root.querySelector(`[data-project-selector="${id}"]`)!;
}

function chapter(root: HTMLElement, id: string): HTMLElement {
  return root.querySelector(`[data-project-chapter="${id}"]`)!;
}

test("initializes INKSeat as the only visible mounted chapter", () => {
  const root = createRoot();
  const cleanup = startProjectSelector(root);

  expect(selector(root, "inkseat").getAttribute("aria-current")).toBe("true");
  expect(chapter(root, "inkseat").hidden).toBe(false);
  expect(chapter(root, "inkseat").hasAttribute("aria-hidden")).toBe(false);
  expect(chapter(root, "emovue").hidden).toBe(true);
  expect(chapter(root, "emovue").getAttribute("aria-hidden")).toBe("true");
  expect(root.querySelectorAll("[data-project-chapter]")).toHaveLength(2);
  cleanup();
});

test("switches forward and backward without scrolling", () => {
  const root = createRoot();
  const scrollInkseat = vi.fn();
  const scrollEmovue = vi.fn();
  chapter(root, "inkseat").scrollIntoView = scrollInkseat;
  chapter(root, "emovue").scrollIntoView = scrollEmovue;
  const cleanup = startProjectSelector(root);

  selector(root, "emovue").click();
  expect(chapter(root, "inkseat").hidden).toBe(true);
  expect(chapter(root, "emovue").hidden).toBe(false);
  expect(chapter(root, "emovue").dataset.projectTransition).toBe("forward");

  chapter(root, "emovue").dispatchEvent(new Event("animationend"));
  selector(root, "inkseat").click();
  expect(chapter(root, "inkseat").dataset.projectTransition).toBe("backward");
  expect(selector(root, "inkseat").getAttribute("aria-current")).toBe("true");
  expect(scrollInkseat).not.toHaveBeenCalled();
  expect(scrollEmovue).not.toHaveBeenCalled();
  cleanup();
});

test("does not restart the transition for an already active selector", () => {
  const root = createRoot();
  const cleanup = startProjectSelector(root);
  selector(root, "emovue").click();
  chapter(root, "emovue").dispatchEvent(new Event("animationend"));

  selector(root, "emovue").click();

  expect(chapter(root, "emovue").hasAttribute("data-project-transition")).toBe(false);
  cleanup();
});

test("external activation switches immediately and cleanup removes all listeners", () => {
  const root = createRoot();
  const cleanup = startProjectSelector(root);

  dispatchProjectActivation(root, "emovue");
  expect(chapter(root, "emovue").hidden).toBe(false);
  expect(chapter(root, "emovue").hasAttribute("data-project-transition")).toBe(false);

  cleanup();
  selector(root, "inkseat").click();
  dispatchProjectActivation(root, "inkseat");
  expect(chapter(root, "emovue").hidden).toBe(false);
  chapter(root, "emovue").dataset.projectTransition = "forward";
  chapter(root, "emovue").dispatchEvent(new Event("animationend"));
  expect(chapter(root, "emovue").dataset.projectTransition).toBe("forward");
});
