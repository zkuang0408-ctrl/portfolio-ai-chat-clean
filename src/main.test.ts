import { beforeEach, expect, test, vi } from "vitest";

const startPortrait = vi.hoisted(() =>
  vi.fn().mockResolvedValue(() => undefined),
);

vi.mock("./particles/controller", () => ({ startPortrait }));

beforeEach(() => {
  vi.resetModules();
  startPortrait.mockClear();
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
  expect(app?.querySelector<HTMLImageElement>(".portrait-base")?.src).toMatch(
    /\/portrait(?:-[^./]+)?\.webp(?:\?.*)?$/,
  );
  expect(startPortrait).toHaveBeenCalledOnce();
  expect(startPortrait).toHaveBeenCalledWith({
    canvas: app?.querySelector(".portrait-canvas"),
    portraitBase: app?.querySelector(".portrait-base"),
    portraitStage: app?.querySelector(".portrait-stage"),
  });
});

test("throws a clear error when the app root is missing", async () => {
  await expect(import("./main")).rejects.toThrow("Missing #app root element.");
  expect(startPortrait).not.toHaveBeenCalled();
});
