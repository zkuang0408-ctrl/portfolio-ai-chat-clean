import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { ImageReaderDependencies } from "./portfolio/image-reader";

const startPortrait = vi.hoisted(() =>
  vi.fn().mockResolvedValue(() => undefined),
);
const stopReaders = vi.hoisted(() => vi.fn());
const startProjectReaders = vi.hoisted(() =>
  vi.fn(
    (_root: ParentNode, _dependencies: ImageReaderDependencies) => stopReaders,
  ),
);
const stopChat = vi.hoisted(() => vi.fn());
const startPortfolioChat = vi.hoisted(() =>
  vi.fn((_elements: unknown, _dependencies: unknown) => stopChat),
);
const navigateToSource = vi.hoisted(() => vi.fn());
const stopChatPresentation = vi.hoisted(() => vi.fn());
const startChatPresentation = vi.hoisted(() =>
  vi.fn((_elements: unknown, _dependencies: unknown) => stopChatPresentation),
);
const stopSectionState = vi.hoisted(() => vi.fn());
const startSectionState = vi.hoisted(() =>
  vi.fn((_navigation: HTMLElement, _content: ParentNode) => stopSectionState),
);

vi.mock("./particles/controller", () => ({ startPortrait }));
vi.mock("./portfolio/image-reader", () => ({ startProjectReaders }));
vi.mock("./chat/chat-controller", () => ({ startPortfolioChat }));
vi.mock("./chat/chat-presentation", () => ({ startChatPresentation }));
vi.mock("./navigation/section-state", () => ({ startSectionState }));
vi.mock("./chat/source-navigation", () => ({ navigateToSource }));

beforeEach(() => {
  window.dispatchEvent(
    new PageTransitionEvent("pagehide", { persisted: false }),
  );
  vi.resetModules();
  startPortrait.mockClear();
  stopReaders.mockClear();
  startProjectReaders.mockClear();
  startPortfolioChat.mockClear();
  stopChat.mockClear();
  startChatPresentation.mockClear();
  stopChatPresentation.mockClear();
  startSectionState.mockClear();
  stopSectionState.mockClear();
  navigateToSource.mockClear();
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("renders the editorial homepage in the app root", async () => {
  document.body.innerHTML = '<div id="app"></div>';

  await import("./main");

  const app = document.querySelector<HTMLDivElement>("#app");

  expect(app?.firstElementChild?.matches("[data-site-nav]")).toBe(true);
  expect(app?.querySelector("[data-site-nav]")?.classList).toContain("site-nav");
  expect(app?.querySelector(".hero")).not.toBeNull();
  expect(app?.querySelector("#hero-title")?.textContent).toContain("Crafting");
  expect(app?.querySelectorAll('nav [aria-disabled="true"]')).toHaveLength(0);
  expect(app?.querySelectorAll("[data-site-nav] nav a")).toHaveLength(3);
  expect(app?.querySelector(".hero nav")).toBeNull();
  expect(app?.querySelector(".portfolio-content")).not.toBeNull();
  expect(app?.querySelectorAll("#projects article")).toHaveLength(6);
  expect(app?.querySelector<HTMLImageElement>(".portrait-base")?.src).toMatch(
    /\/portrait-resume-retouched-v1\.png(?:\?.*)?$/,
  );
  expect(startPortrait).toHaveBeenCalledOnce();
  expect(startPortrait).toHaveBeenCalledWith({
    canvas: app?.querySelector(".portrait-canvas"),
    portraitBase: app?.querySelector(".portrait-base"),
    portraitStage: app?.querySelector(".portrait-stage"),
  });
  expect(startPortfolioChat).toHaveBeenCalledOnce();
  expect(startPortfolioChat.mock.calls[0]?.[0]).toEqual(
    expect.objectContaining({ root: app?.querySelector("[data-chat-root]") }),
  );
  const chatDependencies = startPortfolioChat.mock.calls[0]?.[1] as {
    navigateToSource(source: unknown): void;
  };
  const source = { sourceId: "inkseat" };
  chatDependencies.navigateToSource(source);
  expect(navigateToSource).toHaveBeenCalledWith(
    app?.querySelector(".portfolio-content"),
    source,
    expect.objectContaining({ document, open: expect.any(Function) }),
  );
  expect(startChatPresentation).toHaveBeenCalledOnce();
  expect(startChatPresentation.mock.calls[0]?.[0]).toEqual(
    expect.objectContaining({ root: app?.querySelector("[data-chat-root]") }),
  );
  expect(startChatPresentation.mock.calls[0]?.[1]).toEqual(
    expect.objectContaining({
      trigger: app?.querySelector("[data-open-chat]"),
      window,
    }),
  );
  expect(startSectionState).toHaveBeenCalledWith(
    app?.querySelector("[data-site-nav]"),
    app,
  );
});

test.each([
  ["zh-CN", "zh"],
  ["en-US", "en"],
  ["fr-FR", "en"],
])("selects chat locale from navigator language %s", async (language, locale) => {
  document.body.innerHTML = '<div id="app"></div>';
  vi.spyOn(window.navigator, "language", "get").mockReturnValue(language);

  await import("./main");

  expect(startPortfolioChat.mock.calls[0]?.[1]).toEqual(
    expect.objectContaining({ locale }),
  );
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
  expect(dependencies?.load).toEqual(expect.any(Function));
  expect(dependencies?.preload).toEqual(expect.any(Function));
  expect(dependencies?.awaitVisibleImage).toEqual(expect.any(Function));
});

test("preserves chat and readers in BFCache and cleans both once on terminal pagehide", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  vi.stubGlobal("requestAnimationFrame", vi.fn());
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false }) as MediaQueryList),
  );

  await import("./main");

  window.dispatchEvent(
    new PageTransitionEvent("pagehide", { persisted: true }),
  );
  expect(stopReaders).not.toHaveBeenCalled();
  expect(stopChat).not.toHaveBeenCalled();

  window.dispatchEvent(
    new PageTransitionEvent("pagehide", { persisted: false }),
  );
  window.dispatchEvent(
    new PageTransitionEvent("pagehide", { persisted: false }),
  );

  expect(stopReaders).toHaveBeenCalledOnce();
  expect(stopChat).toHaveBeenCalledOnce();
  expect(stopChatPresentation).toHaveBeenCalledOnce();
  expect(stopSectionState).toHaveBeenCalledOnce();
  expect(startPortrait).toHaveBeenCalledOnce();
});

test("throws a clear error when the app root is missing", async () => {
  await expect(import("./main")).rejects.toThrow("Missing #app root element.");
  expect(startPortrait).not.toHaveBeenCalled();
  expect(startProjectReaders).not.toHaveBeenCalled();
});

test("does not dereference a throwing sessionStorage getter directly", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });

  await expect(import("./main")).resolves.toBeDefined();

  const dependencies = startPortfolioChat.mock.calls[0]?.[1] as {
    storage: { getItem(key: string): string | null };
  };
  expect(() => dependencies.storage.getItem("test")).not.toThrow();
});
