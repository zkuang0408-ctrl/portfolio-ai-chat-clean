import { expect, test, vi } from "vitest";

import type { ClientChatSource } from "./sse";
import { ACTIVATE_PROJECT_EVENT } from "../portfolio/project-activation";
import {
  OPEN_PROJECT_PAGE_EVENT,
  navigateToSource,
  type OpenProjectPageDetail,
  type SourceNavigationBrowser,
} from "./source-navigation";

function source(
  overrides: Partial<ClientChatSource> = {},
): ClientChatSource {
  return {
    id: "S1",
    sourceId: "inkseat",
    projectId: "inkseat",
    page: 8,
    title: "INKSeat",
    citationLabel: "INKSEAT · P.08",
    publicHref: "/untrusted.pdf#page=999",
    ...overrides,
  };
}

function setup(): {
  browser: SourceNavigationBrowser;
  open: ReturnType<typeof vi.fn>;
  portfolioRoot: HTMLElement;
} {
  const portfolioRoot = document.createElement("main");
  portfolioRoot.innerHTML = `
    <section id="resume"></section>
    <article id="project-inkseat"></article>
    <article id="project-emovue"></article>
  `;
  const open = vi.fn();
  return {
    browser: { document, open },
    open,
    portfolioRoot,
  };
}

test("scrolls to a trusted project and dispatches its exact PDF page", () => {
  const { browser, portfolioRoot } = setup();
  const project = portfolioRoot.querySelector<HTMLElement>("#project-inkseat")!;
  const order: string[] = [];
  const scrollIntoView = vi.fn((_options?: ScrollIntoViewOptions) => {
    order.push("scroll");
  });
  project.scrollIntoView = scrollIntoView;
  const received: OpenProjectPageDetail[] = [];
  portfolioRoot.addEventListener(ACTIVATE_PROJECT_EVENT, (event) => {
    order.push(
      `activate:${(event as CustomEvent<{ projectId: string }>).detail.projectId}`,
    );
  });
  portfolioRoot.addEventListener(OPEN_PROJECT_PAGE_EVENT, (event) => {
    const detail = (event as CustomEvent<OpenProjectPageDetail>).detail;
    received.push(detail);
    order.push(`page:${detail.page}`);
  });

  navigateToSource(portfolioRoot, source(), browser);

  expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  expect(scrollIntoView.mock.calls[0]?.[0]).not.toHaveProperty("behavior");
  expect(received).toEqual([{ projectId: "inkseat", page: 8 }]);
  expect(order).toEqual(["activate:inkseat", "scroll", "page:8"]);
});

test("scrolls an owner-confirmed project source without a page to the project only", () => {
  const { browser, portfolioRoot } = setup();
  const project = portfolioRoot.querySelector<HTMLElement>("#project-inkseat")!;
  const scrollIntoView = vi.fn();
  project.scrollIntoView = scrollIntoView;
  const listener = vi.fn();
  const activations: Array<{ projectId: string }> = [];
  portfolioRoot.addEventListener(ACTIVATE_PROJECT_EVENT, (event) => {
    activations.push((event as CustomEvent<{ projectId: string }>).detail);
  });
  portfolioRoot.addEventListener(OPEN_PROJECT_PAGE_EVENT, listener);

  navigateToSource(portfolioRoot, source({ page: undefined }), browser);

  expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  expect(activations).toEqual([{ projectId: "inkseat" }]);
  expect(listener).not.toHaveBeenCalled();
  expect(browser.open).not.toHaveBeenCalled();
});

test("does nothing when an owner-confirmed project source without a page has no project element", () => {
  const { browser, portfolioRoot } = setup();
  portfolioRoot.querySelector("#project-inkseat")!.remove();
  const listener = vi.fn();
  portfolioRoot.addEventListener(OPEN_PROJECT_PAGE_EVENT, listener);

  navigateToSource(portfolioRoot, source({ page: undefined }), browser);

  expect(listener).not.toHaveBeenCalled();
  expect(browser.open).not.toHaveBeenCalled();
});

test.each([
  source({ sourceId: "unknown", projectId: "unknown" }),
  source({ sourceId: "inkseat", projectId: "emovue" }),
  source({ page: 0 }),
  source({ page: -2 }),
  source({ page: 1.5 }),
  source({ page: Number.NaN }),
])("ignores unknown, mismatched, or invalid project sources", (untrusted) => {
  const { browser, portfolioRoot } = setup();
  const project = portfolioRoot.querySelector<HTMLElement>("#project-inkseat")!;
  const scrollIntoView = vi.fn();
  project.scrollIntoView = scrollIntoView;
  const listener = vi.fn();
  portfolioRoot.addEventListener(OPEN_PROJECT_PAGE_EVENT, listener);

  navigateToSource(portfolioRoot, untrusted, browser);

  expect(listener).not.toHaveBeenCalled();
  expect(browser.open).not.toHaveBeenCalled();
  expect(scrollIntoView).not.toHaveBeenCalled();
});

test.each([
  source({ sourceId: "unknown", projectId: "unknown", page: undefined }),
  source({ sourceId: "inkseat", projectId: "emovue", page: undefined }),
])("ignores unknown or mismatched project sources without a page", (untrusted) => {
  const { browser, portfolioRoot } = setup();
  const project = portfolioRoot.querySelector<HTMLElement>("#project-inkseat")!;
  const scrollIntoView = vi.fn();
  project.scrollIntoView = scrollIntoView;
  const listener = vi.fn();
  portfolioRoot.addEventListener(OPEN_PROJECT_PAGE_EVENT, listener);

  navigateToSource(portfolioRoot, untrusted, browser);

  expect(scrollIntoView).not.toHaveBeenCalled();
  expect(listener).not.toHaveBeenCalled();
  expect(browser.open).not.toHaveBeenCalled();
});

test("allows an oversized trusted page for the reader to bound", () => {
  const { browser, portfolioRoot } = setup();
  portfolioRoot.querySelector<HTMLElement>("#project-inkseat")!.scrollIntoView = vi.fn();
  const listener = vi.fn();
  portfolioRoot.addEventListener(OPEN_PROJECT_PAGE_EVENT, listener);

  navigateToSource(portfolioRoot, source({ page: 99 }), browser);

  expect(listener).toHaveBeenCalledOnce();
  expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
    projectId: "inkseat",
    page: 99,
  });
});

test.each([undefined, 1])(
  "scrolls the trusted profile source page %s to Resume without forcing motion",
  (page) => {
    const { browser, portfolioRoot } = setup();
    const about = portfolioRoot.querySelector<HTMLElement>("#resume")!;
    const scrollIntoView = vi.fn();
    about.scrollIntoView = scrollIntoView;

    navigateToSource(
      portfolioRoot,
      source({
        sourceId: "profile",
        projectId: undefined,
        page,
        publicHref: "https://evil.test",
      }),
      browser,
    );

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(scrollIntoView.mock.calls[0]?.[0]).not.toHaveProperty("behavior");
    expect(browser.open).not.toHaveBeenCalled();
  },
);

test("opens only the fixed sanitized resume with noopener semantics", () => {
  const { browser, open, portfolioRoot } = setup();
  const popup = { opener: {} as unknown };
  open.mockReturnValue(popup);

  navigateToSource(
    portfolioRoot,
    source({ sourceId: "resume", projectId: undefined, page: 1, publicHref: "javascript:alert(1)" }),
    browser,
  );

  expect(open).toHaveBeenCalledWith(
    "/documents/zhao-shikuang-resume-public.pdf#page=1",
    "_blank",
    "noopener,noreferrer",
  );
  expect(popup.opener).toBeNull();
});

test("ignores lookalike profile and resume records", () => {
  const { browser, portfolioRoot } = setup();
  const listener = vi.fn();
  portfolioRoot.addEventListener(OPEN_PROJECT_PAGE_EVENT, listener);

  navigateToSource(portfolioRoot, source({ sourceId: "resume-copy" }), browser);
  navigateToSource(portfolioRoot, source({ sourceId: "profile-copy" }), browser);

  expect(browser.open).not.toHaveBeenCalled();
  expect(listener).not.toHaveBeenCalled();
});
