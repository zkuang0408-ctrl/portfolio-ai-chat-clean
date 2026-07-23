import { expect, test, vi } from "vitest";

import { projects, type ProjectPageAsset } from "../content/portfolio";
import {
  createImageReader,
  startProjectReaders,
  type ImageReaderDependencies,
} from "./image-reader";

const project = projects[0]!;

function createRoot(expectedPages = project.pdf.pageCount): HTMLElement {
  const root = document.createElement("figure");
  root.dataset.projectReader = "";
  root.dataset.projectId = project.id;
  root.dataset.expectedPages = String(expectedPages);
  root.tabIndex = 0;
  root.innerHTML = `
    <div data-reader-stage>
      <picture data-page-picture>
        <source data-page-mobile media="(max-width: 760px)" srcset="${project.pdf.pages[0]!.mobile}">
        <img data-page-image src="${project.pdf.pages[0]!.desktop}" alt="">
      </picture>
      <p data-reader-status>Loading project</p>
      <div data-reader-error hidden>
        <button data-reader-retry>Retry</button>
      </div>
      <button data-page-action="previous"></button>
      <button data-page-action="next"></button>
    </div>
    <strong data-current-page>01</strong>
    <span data-total-pages>${expectedPages}</span>
  `;
  return root;
}

function dependencies(
  overrides: Partial<ImageReaderDependencies> = {},
): ImageReaderDependencies {
  return {
    load: vi.fn(async () => undefined),
    preload: vi.fn(),
    awaitVisibleImage: vi.fn(async () => undefined),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function dispatchPointer(
  target: Element,
  type: string,
  values: {
    pointerId?: number;
    pointerType: string;
    clientX: number;
    clientY: number;
  },
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: values.pointerId ?? 1 },
    pointerType: { value: values.pointerType },
    clientX: { value: values.clientX },
    clientY: { value: values.clientY },
  });
  target.dispatchEvent(event);
  return event;
}

test("initializes the rendered first page without loading it twice", async () => {
  const root = createRoot();
  const deps = dependencies();
  const reader = createImageReader(root, deps);
  const image = root.querySelector<HTMLImageElement>("[data-page-image]")!;

  await reader.initialize();

  expect(deps.awaitVisibleImage).toHaveBeenCalledWith(image);
  expect(deps.load).not.toHaveBeenCalled();
  expect(deps.preload).toHaveBeenCalledOnce();
  expect(deps.preload).toHaveBeenCalledWith(project.pdf.pages[1]);
  expect(root.dataset.readerState).toBe("ready");
});

test("loads only the requested page and preloads only its successor", async () => {
  const root = createRoot();
  const deps = dependencies();
  const reader = createImageReader(root, deps);
  await reader.initialize();
  vi.mocked(deps.load).mockClear();
  vi.mocked(deps.preload).mockClear();

  await reader.goTo(2);

  expect(deps.load).toHaveBeenCalledTimes(1);
  expect(deps.load).toHaveBeenCalledWith(project.pdf.pages[1]);
  expect(deps.preload).toHaveBeenCalledTimes(1);
  expect(deps.preload).toHaveBeenCalledWith(project.pdf.pages[2]);
  expect(root.querySelector("[data-current-page]")?.textContent).toBe("02");
  expect(
    root.querySelector<HTMLImageElement>("[data-page-image]")?.getAttribute("src"),
  ).toBe(project.pdf.pages[1]?.desktop);
});

test("ignores a stale page load after a later navigation completes", async () => {
  const root = createRoot();
  const first = deferred<void>();
  const load = vi
    .fn<(asset: ProjectPageAsset) => Promise<void>>()
    .mockImplementationOnce(() => first.promise)
    .mockResolvedValueOnce(undefined);
  const reader = createImageReader(root, dependencies({ load }));
  await reader.initialize();

  const pageTwo = reader.goTo(2);
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  await reader.goTo(3);
  first.resolve();
  await pageTwo;

  expect(root.querySelector("[data-current-page]")?.textContent).toBe("03");
  expect(
    root.querySelector<HTMLImageElement>("[data-page-image]")?.getAttribute("src"),
  ).toBe(project.pdf.pages[2]?.desktop);
});

test("bounds navigation and keeps controls in sync", async () => {
  const root = createRoot();
  const reader = createImageReader(root, dependencies());
  await reader.initialize();

  expect(
    root.querySelector<HTMLButtonElement>('[data-page-action="previous"]')
      ?.disabled,
  ).toBe(true);
  await reader.goTo(999);

  expect(root.querySelector("[data-current-page]")?.textContent).toBe("18");
  expect(
    root.querySelector<HTMLButtonElement>('[data-page-action="next"]')?.disabled,
  ).toBe(true);
});

test("supports keyboard arrows and touch swipes", async () => {
  const root = createRoot();
  const reader = createImageReader(root, dependencies());
  await reader.initialize();

  const keyboard = new KeyboardEvent("keydown", {
    key: "ArrowRight",
    bubbles: true,
    cancelable: true,
  });
  root.dispatchEvent(keyboard);
  await vi.waitFor(() =>
    expect(root.querySelector("[data-current-page]")?.textContent).toBe("02"),
  );
  expect(keyboard.defaultPrevented).toBe(true);

  dispatchPointer(root, "pointerdown", {
    pointerType: "touch",
    clientX: 200,
    clientY: 100,
  });
  const swipe = dispatchPointer(root, "pointerup", {
    pointerType: "touch",
    clientX: 80,
    clientY: 105,
  });
  await vi.waitFor(() =>
    expect(root.querySelector("[data-current-page]")?.textContent).toBe("03"),
  );
  expect(swipe.defaultPrevented).toBe(true);
});

test("retries the failed target page", async () => {
  const root = createRoot();
  const load = vi
    .fn<(asset: ProjectPageAsset) => Promise<void>>()
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValueOnce(undefined);
  const reader = createImageReader(root, dependencies({ load }));
  await reader.initialize();

  await expect(reader.goTo(2)).rejects.toThrow("network");
  expect(root.dataset.readerState).toBe("error");
  root.querySelector<HTMLButtonElement>("[data-reader-retry]")?.click();

  await vi.waitFor(() => expect(root.dataset.readerState).toBe("ready"));
  expect(root.querySelector("[data-current-page]")?.textContent).toBe("02");
  expect(load).toHaveBeenCalledTimes(2);
});

test("source navigation initializes a lazy reader and opens its cited page", async () => {
  const portfolio = document.createElement("main");
  const root = createRoot();
  portfolio.append(root);
  const load = vi.fn(async () => undefined);
  const awaitVisibleImage = vi.fn(async () => undefined);
  const unobserve = vi.fn();
  class FakeIntersectionObserver {
    constructor(_callback: IntersectionObserverCallback) {}
    observe = vi.fn();
    unobserve = unobserve;
    disconnect = vi.fn();
  }
  const cleanup = startProjectReaders(
    portfolio,
    dependencies({
      load,
      awaitVisibleImage,
      IntersectionObserver: FakeIntersectionObserver,
    }),
  );

  portfolio.dispatchEvent(
    new CustomEvent("portfolio:open-project-page", {
      detail: { projectId: project.id, page: 8 },
    }),
  );

  await vi.waitFor(() =>
    expect(root.querySelector("[data-current-page]")?.textContent).toBe("08"),
  );
  expect(awaitVisibleImage).toHaveBeenCalledOnce();
  expect(load).toHaveBeenCalledWith(project.pdf.pages[7]);
  expect(unobserve).toHaveBeenCalledWith(root);
  cleanup();
});

test("cleanup removes source navigation and blocks pending interaction", async () => {
  const portfolio = document.createElement("main");
  const root = createRoot();
  portfolio.append(root);
  const load = vi.fn(async () => undefined);
  const cleanup = startProjectReaders(
    portfolio,
    dependencies({
      load,
      IntersectionObserver: class {
        constructor(_callback: IntersectionObserverCallback) {}
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    }),
  );

  cleanup();
  portfolio.dispatchEvent(
    new CustomEvent("portfolio:open-project-page", {
      detail: { projectId: project.id, page: 8 },
    }),
  );
  root
    .querySelector<HTMLButtonElement>('[data-page-action="next"]')
    ?.click();
  await Promise.resolve();

  expect(load).not.toHaveBeenCalled();
  expect(root.querySelector("[data-current-page]")?.textContent).toBe("01");
});
