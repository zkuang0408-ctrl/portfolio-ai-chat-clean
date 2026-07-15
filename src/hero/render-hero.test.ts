import { expect, test } from "vitest";

import { renderHero } from "./render-hero";

test("renders the editorial hero with real section navigation", () => {
  const root = document.createElement("div");

  renderHero(root, "/portrait.png");

  expect(root.textContent).toContain("赵实旷");
  expect(root.textContent).toContain("Crafting");
  expect(root.textContent).toContain("Through Objects");
  expect(
    Array.from(root.querySelectorAll<HTMLAnchorElement>("nav a"), (link) =>
      link.getAttribute("href"),
    ),
  ).toEqual(["#about", "#projects", "#contact"]);
  expect(root.querySelectorAll('nav [aria-disabled="true"]')).toHaveLength(0);
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
