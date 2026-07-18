import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { PdfReaderDependencies } from "./portfolio/pdf-reader";

const startPortrait = vi.hoisted(() =>
  vi.fn().mockResolvedValue(() => undefined),
);
const loadPdfDocument = vi.hoisted(() => vi.fn());
const stopReaders = vi.hoisted(() => vi.fn());
const startProjectReaders = vi.hoisted(() =>
  vi.fn((_root: ParentNode, _dependencies: PdfReaderDependencies) => stopReaders),
);

vi.mock("./particles/controller", () => ({ startPortrait }));
vi.mock("./portfolio/pdf-reader", () => ({ startProjectReaders }));
vi.mock("./portfolio/pdf-runtime", () => ({ loadPdfDocument }));

beforeEach(() => {
  vi.resetModules();
  startPortrait.mockClear();
  loadPdfDocument.mockClear();
  stopReaders.mockClear();
  startProjectReaders.mockClear();
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("renders the editorial homepage in the app root", async () => {
  document.body.innerHTML = '<div id="app"></div>';

  await import("./main");

  const app = document.querySelector<HTMLDivElement>("#app");

  expect(app?.querySelector(".hero")).not.toBeNull();
  expect(app?.querySelector("#hero-title")?.textContent).toContain("Crafting");
  expect(app?.querySelectorAll('nav [aria-disabled="true"]')).toHaveLength(0);
  expect(app?.querySelectorAll("nav a")).toHaveLength(3);
  expect(app?.querySelector(".portfolio-content")).not.toBeNull();
  expect(app?.querySelectorAll("#projects article")).toHaveLength(6);
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

test("starts project readers after rendering their markup with browser dependencies", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const requestFrame = vi.fn(function (
    this: Window,
    _callback: FrameRequestCallback,
  ) {
    expect(this).toBe(window);
    return 17;
  });
  const cancelFrame = vi.fn(function (this: Window, _frameId: number) {
    expect(this).toBe(window);
  });
  const matchMedia = vi.fn(
    (query: string) =>
      ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
      }) as MediaQueryList,
  );
  vi.stubGlobal("requestAnimationFrame", requestFrame);
  vi.stubGlobal("cancelAnimationFrame", cancelFrame);
  vi.stubGlobal("matchMedia", matchMedia);

  let readerCountAtStartup = 0;
  startProjectReaders.mockImplementationOnce((root: ParentNode) => {
    readerCountAtStartup = root.querySelectorAll("[data-project-reader]").length;
    return stopReaders;
  });

  await import("./main");

  const portfolioRoot =
    document.querySelector<HTMLElement>("#app > .portfolio-content");
  expect(portfolioRoot).not.toBeNull();
  expect(readerCountAtStartup).toBe(6);
  expect(startProjectReaders).toHaveBeenCalledOnce();
  expect(startProjectReaders.mock.calls[0]?.[0]).toBe(portfolioRoot);

  const dependencies = startProjectReaders.mock.calls[0]?.[1];
  expect(dependencies?.loadDocument).toBe(loadPdfDocument);

  const stage = document.createElement("div");
  Object.defineProperty(stage, "clientWidth", { value: 864 });
  expect(dependencies?.measureWidth(stage)).toBe(864);
  expect(dependencies?.outputScale()).toBe(window.devicePixelRatio || 1);

  const callback = vi.fn();
  expect(dependencies?.requestFrame(callback)).toBe(17);
  dependencies?.cancelFrame?.(17);
  expect(requestFrame).toHaveBeenCalledWith(callback);
  expect(cancelFrame).toHaveBeenCalledWith(17);

  expect(dependencies?.reducedMotion()).toBe(true);
  expect(matchMedia).toHaveBeenCalledWith(
    "(prefers-reduced-motion: reduce)",
  );
});

test("cleans project readers up once on pagehide", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  vi.stubGlobal("requestAnimationFrame", vi.fn());
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false }) as MediaQueryList),
  );

  await import("./main");

  window.dispatchEvent(new Event("pagehide"));
  window.dispatchEvent(new Event("pagehide"));

  expect(stopReaders).toHaveBeenCalledOnce();
  expect(startPortrait).toHaveBeenCalledOnce();
});

test("throws a clear error when the app root is missing", async () => {
  await expect(import("./main")).rejects.toThrow("Missing #app root element.");
  expect(startPortrait).not.toHaveBeenCalled();
  expect(startProjectReaders).not.toHaveBeenCalled();
});
