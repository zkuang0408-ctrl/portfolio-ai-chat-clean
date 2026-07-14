import { beforeEach, expect, test, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = "";
});

test("renders the portfolio loading state in the app root", async () => {
  document.body.innerHTML = '<div id="app"></div>';

  await import("./main");

  expect(document.querySelector<HTMLDivElement>("#app")?.textContent).toBe(
    "Loading portfolio…",
  );
});

test("throws a clear error when the app root is missing", async () => {
  await expect(import("./main")).rejects.toThrow("Missing #app root element.");
});
