import { expect, test } from "vitest";

import { renderHero } from "./render-hero";

test("renders the editorial hero beneath the persistent site navigation", () => {
  const root = document.createElement("div");

  renderHero(root, "/portrait.png");

  expect(root.textContent).toContain("赵实旷");
  expect(root.textContent).toContain("Crafting");
  expect(root.textContent).toContain("Through Objects");
  expect(root.querySelector("nav")).toBeNull();
  expect(root.querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true");
  expect(root.querySelector<HTMLImageElement>(".portrait-base")?.src).toContain(
    "/portrait.png",
  );
});

test("marks the sampling image as decorative and hidden from assistive technology", () => {
  const root = document.createElement("div");

  renderHero(root, "/portrait.png");

  const image = root.querySelector<HTMLImageElement>(".portrait-base");
  expect(image?.alt).toBe("");
  expect(image?.getAttribute("aria-hidden")).toBe("true");
});

test("provides a concise portrait failure status", () => {
  const root = document.createElement("div");

  renderHero(root, "/portrait.png");

  expect(root.querySelector(".portrait-error")?.textContent).toBe(
    "Portrait visualization unavailable.",
  );
});

test("mounts the permanent Chinese assistant and returns its scoped references", () => {
  const root = document.createElement("div");

  const hero = renderHero(root, "/portrait.png");

  expect(root.querySelector(".name")?.textContent).toBe("赵实旷.");
  expect(hero.chatRoot).toBe(root.querySelector("[data-chat-root]"));
  expect(hero.chat.root).toBe(hero.chatRoot);
  expect(hero.chatRoot.getAttribute("role")).not.toBe("dialog");
  expect(hero.chat.recommendations).toHaveLength(4);
  expect(hero.chat.send.getAttribute("aria-label")).toBe("发送问题");
});

test("can render the hero assistant in English without changing portrait consumers", () => {
  const root = document.createElement("div");

  const hero = renderHero(root, "/portrait.png", "en");

  expect(hero.canvas).toBeInstanceOf(HTMLCanvasElement);
  expect(hero.portraitBase).toBeInstanceOf(HTMLImageElement);
  expect(hero.portraitStage).toBeInstanceOf(HTMLElement);
  expect(hero.chat.input.getAttribute("aria-label")).toBe("Ask a question");
  expect(hero.chat.recommendations[0]?.textContent).toContain("one-minute");
});

test("keeps the portrait composition in a dedicated first-screen scene before chat", () => {
  const root = document.createElement("div");

  const hero = renderHero(root, "/portrait.png");
  const scene = root.querySelector<HTMLElement>(".hero-scene");

  expect(scene).not.toBeNull();
  expect(scene?.contains(hero.portraitStage)).toBe(true);
  expect(scene?.contains(hero.chatRoot)).toBe(false);
  expect(scene?.nextElementSibling).toBe(hero.chatRoot);
});
