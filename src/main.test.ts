import { beforeEach, expect, test, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = "";
});

test("renders the editorial homepage in the app root", async () => {
  document.body.innerHTML = '<div id="app"></div>';

  await import("./main");

  const app = document.querySelector<HTMLDivElement>("#app");

  expect(app?.querySelector(".hero")).not.toBeNull();
  expect(app?.querySelector("#hero-title")?.textContent).toContain("Crafting");
  expect(app?.querySelectorAll('nav [aria-disabled="true"]')).toHaveLength(3);
  expect(app?.querySelectorAll("nav a")).toHaveLength(0);
  expect(app?.querySelector<HTMLImageElement>(".portrait-base")?.src).toContain(
    "portrait.png",
  );
});

test("throws a clear error when the app root is missing", async () => {
  await expect(import("./main")).rejects.toThrow("Missing #app root element.");
});
