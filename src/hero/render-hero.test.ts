import { expect, test } from "vitest";

import { renderHero } from "./render-hero";

test("renders the editorial hero beneath the persistent site navigation", () => {
  const root = document.createElement("div");

  renderHero(root, "/portrait.png", "/portrait-mask.png");

  expect(root.textContent).toContain("赵实旷");
  expect(root.textContent).toContain("Crafting");
  expect(root.textContent).toContain("Through Objects");
  const headlineLines = Array.from(
    root.querySelectorAll<HTMLElement>("#hero-title > span"),
    (line) => line.textContent?.trim(),
  );
  expect(headlineLines).toEqual([
    "Crafting Future",
    "Through Objects & Systems.",
  ]);
  expect(root.querySelector("#hero-title")?.tagName).toBe("H1");
  expect(root.querySelector("nav")).toBeNull();
  expect(root.querySelector(".hero")?.id).toBe("top");
  expect(root.querySelector("[data-hero-supporting]")?.textContent).toBe(
    "从实体产品到智能系统，以研究、交互与原型塑造未来体验。",
  );
  expect(root.querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true");
  expect(root.querySelector<HTMLImageElement>(".portrait-base")?.src).toContain(
    "/portrait.png",
  );
});

test("marks the sampling image as decorative and hidden from assistive technology", () => {
  const root = document.createElement("div");

  renderHero(root, "/portrait.png", "/portrait-mask.png");

  const image = root.querySelector<HTMLImageElement>(".portrait-base");
  expect(image?.alt).toBe("");
  expect(image?.getAttribute("aria-hidden")).toBe("true");
  expect(image?.hidden).toBe(true);
});

test("renders a hidden decorative portrait mask for particle sampling", () => {
  const root = document.createElement("div");

  renderHero(root, "/portrait.png", "/portrait-particle-mask.png");

  const mask = root.querySelector<HTMLImageElement>(".portrait-mask");
  expect(mask?.src).toContain("/portrait-particle-mask.png");
  expect(mask?.alt).toBe("");
  expect(mask?.getAttribute("aria-hidden")).toBe("true");
  expect(mask?.hidden).toBe(true);
});

test("keeps the portrait failure status outside the image role until needed", () => {
  const root = document.createElement("div");

  const hero = renderHero(root, "/portrait.png", "/portrait-mask.png");
  const status = root.querySelector<HTMLElement>(".portrait-error");

  expect(status).toBe(hero.portraitError);
  expect(status?.getAttribute("role")).toBe("status");
  expect(status?.hidden).toBe(true);
  expect(status?.textContent).toBe("");
  expect(hero.portraitStage.contains(status)).toBe(false);
  expect(hero.portraitStage.nextElementSibling).toBe(status);
});

test("uses the supplied approved portrait only as a hidden particle source", () => {
  const root = document.createElement("div");

  renderHero(root, "/portrait-resume-retouched-v1.png", "/portrait-mask.png");

  const source = root.querySelector<HTMLImageElement>(".portrait-base");
  expect(source?.src).toContain("portrait-resume-retouched-v1.png");
  expect(source?.alt).toBe("");
  expect(source?.getAttribute("aria-hidden")).toBe("true");
  expect(root.querySelector(".portrait-stage")?.getAttribute("role")).toBe("img");
  expect(root.querySelector(".portrait-stage")?.getAttribute("aria-label")).toBe(
    "赵实旷的粒子肖像",
  );
});

test("mounts the permanent Chinese assistant and returns its scoped references", () => {
  const root = document.createElement("div");

  const hero = renderHero(root, "/portrait.png", "/portrait-mask.png");

  expect(hero.chatRoot).toBe(root.querySelector("[data-chat-root]"));
  expect(hero.chat.root).toBe(hero.chatRoot);
  expect(hero.chatRoot.getAttribute("role")).not.toBe("dialog");
  expect(hero.chat.recommendations).toHaveLength(4);
  expect(hero.chat.send.getAttribute("aria-label")).toBe("发送问题");
});

test("can render the hero assistant in English without changing portrait consumers", () => {
  const root = document.createElement("div");

  const hero = renderHero(root, "/portrait.png", "/portrait-mask.png", "en");

  expect(hero.canvas).toBeInstanceOf(HTMLCanvasElement);
  expect(hero.portraitBase).toBeInstanceOf(HTMLImageElement);
  expect(hero.portraitMask).toBeInstanceOf(HTMLImageElement);
  expect(hero.portraitStage).toBeInstanceOf(HTMLElement);
  expect(hero.portraitError).toBeInstanceOf(HTMLElement);
  expect(hero.chat.input.getAttribute("aria-label")).toBe("Ask a question");
  expect(hero.chat.recommendations[0]?.textContent).toContain("one-minute");
});

test("keeps the portrait composition in a dedicated first-screen scene before chat", () => {
  const root = document.createElement("div");

  const hero = renderHero(root, "/portrait.png", "/portrait-mask.png");
  const scene = root.querySelector<HTMLElement>(".hero-scene");

  expect(scene).not.toBeNull();
  expect(scene?.contains(hero.portraitStage)).toBe(true);
  expect(scene?.contains(hero.chatRoot)).toBe(false);
  expect(scene?.nextElementSibling).toBe(hero.chatRoot);
});
