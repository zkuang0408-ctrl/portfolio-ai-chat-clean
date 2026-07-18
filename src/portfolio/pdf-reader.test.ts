import { beforeEach, expect, test, vi } from "vitest";

import {
  createPdfReader,
  startProjectReaders,
  type PdfDocumentLike,
  type PdfPageLike,
  type PdfReaderDependencies,
  type PdfRenderTaskLike,
} from "./pdf-reader";

function createRoot(expectedPages = 18): HTMLElement {
  const root = document.createElement("figure");
  root.dataset.projectReader = "";
  root.dataset.pdfUrl = "/projects/pdfs/inkseat.pdf";
  root.dataset.expectedPages = String(expectedPages);
  root.tabIndex = 0;
  root.innerHTML = `
    <div data-reader-stage>
      <canvas data-pdf-canvas></canvas>
      <p data-reader-status>Loading project</p>
      <div data-reader-error hidden>
        <button data-reader-retry>Retry</button>
        <a href="${root.dataset.pdfUrl}" target="_blank">Open original PDF</a>
      </div>
      <button data-page-action="previous"></button>
      <button data-page-action="next"></button>
    </div>
    <strong data-current-page>01</strong>
    <span data-total-pages>${expectedPages}</span>
  `;
  return root;
}

function createPage(
  renderTask: PdfRenderTaskLike = {
    cancel: vi.fn(),
    promise: Promise.resolve(),
  },
): PdfPageLike {
  return {
    getViewport: ({ scale }) => ({
      width: 960 * scale,
      height: 540 * scale,
    }),
    render: vi.fn(() => renderTask),
  };
}

function createDependencies(
  loadDocument: PdfReaderDependencies["loadDocument"],
  overrides: Partial<PdfReaderDependencies> = {},
): PdfReaderDependencies {
  return {
    loadDocument,
    measureWidth: () => 960,
    outputScale: () => 2,
    requestFrame: (callback) => {
      callback(0);
      return 0;
    },
    reducedMotion: () => false,
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

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function dispatchPointer(
  target: Element,
  type: string,
  values: { pointerId?: number; pointerType: string; clientX: number; clientY: number },
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

beforeEach(() => {
  const context = {} as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
});

test("lazily loads and renders the first page at device output scale", async () => {
  const root = createRoot();
  const render = vi.fn(() => ({
    cancel: vi.fn(),
    promise: Promise.resolve(),
  }));
  const getPage = vi.fn(async () => ({
    getViewport: ({ scale }: { scale: number }) => ({
      width: 960 * scale,
      height: 540 * scale,
    }),
    render,
  }));
  const loadDocument = vi.fn(async () => ({ numPages: 18, getPage }));
  const reader = createPdfReader(root, createDependencies(loadDocument));

  expect(loadDocument).not.toHaveBeenCalled();

  await reader.initialize();

  const canvas = root.querySelector<HTMLCanvasElement>("[data-pdf-canvas]");
  expect(loadDocument).toHaveBeenCalledWith("/projects/pdfs/inkseat.pdf");
  expect(getPage).toHaveBeenCalledWith(1);
  expect(root.dataset.readerState).toBe("ready");
  expect(root.querySelector("[data-current-page]")?.textContent).toBe("01");
  expect(canvas?.width).toBe(1920);
  expect(canvas?.height).toBe(1080);
  expect(canvas?.style.width).toBe("960px");
  expect(canvas?.style.height).toBe("540px");
  expect(render).toHaveBeenCalledWith(
    expect.objectContaining({ transform: [2, 0, 0, 2, 0, 0] }),
  );
});

test("initialization is idempotent and fetches the document once", async () => {
  const root = createRoot();
  const page = createPage();
  const loadDocument = vi.fn(async () => ({
    numPages: 18,
    getPage: vi.fn(async () => page),
  }));
  const reader = createPdfReader(root, createDependencies(loadDocument));

  await Promise.all([reader.initialize(), reader.initialize()]);
  await reader.initialize();

  expect(loadDocument).toHaveBeenCalledTimes(1);
});

test("a retried load cannot be overwritten by stale initialization", async () => {
  const root = createRoot(2);
  const firstLoad = deferred<PdfDocumentLike>();
  const staleDocument: PdfDocumentLike = {
    numPages: 5,
    getPage: vi.fn(async () => createPage()),
  };
  const currentDocument: PdfDocumentLike = {
    numPages: 2,
    getPage: vi.fn(async () => createPage()),
  };
  const loadDocument = vi
    .fn<PdfReaderDependencies["loadDocument"]>()
    .mockImplementationOnce(() => firstLoad.promise)
    .mockResolvedValueOnce(currentDocument);
  const reader = createPdfReader(root, createDependencies(loadDocument));

  const staleInitialization = reader.initialize();
  await reader.retry();
  firstLoad.resolve(staleDocument);
  await staleInitialization;

  expect(loadDocument).toHaveBeenCalledTimes(2);
  expect(root.querySelector("[data-total-pages]")?.textContent).toBe("02");
  expect(root.dataset.pageCountMismatch).toBeUndefined();
  expect(staleDocument.getPage).not.toHaveBeenCalled();
  expect(currentDocument.getPage).toHaveBeenCalledWith(1);
  expect(root.dataset.readerState).toBe("ready");
});

test("uses the PDF page count and surfaces an expected-count mismatch non-fatally", async () => {
  const root = createRoot(18);
  const page = createPage();
  const loadDocument = vi.fn(async () => ({
    numPages: 20,
    getPage: vi.fn(async () => page),
  }));
  const reader = createPdfReader(root, createDependencies(loadDocument));

  await reader.initialize();

  expect(root.dataset.readerState).toBe("ready");
  expect(root.dataset.pageCountMismatch).toBe("18:20");
  expect(root.querySelector("[data-total-pages]")?.textContent).toBe("20");
});

test("does not commit the authoritative total before the first render succeeds", async () => {
  const root = createRoot(18);
  const renderFailure = new Error("page unavailable");
  const loadDocument = vi.fn(async () => ({
    numPages: 20,
    getPage: vi.fn(async () => {
      throw renderFailure;
    }),
  }));
  const reader = createPdfReader(root, createDependencies(loadDocument));

  await expect(reader.initialize()).rejects.toBe(renderFailure);

  expect(root.dataset.readerState).toBe("error");
  expect(root.querySelector("[data-current-page]")?.textContent).toBe("01");
  expect(root.querySelector("[data-total-pages]")?.textContent).toBe("18");
  expect(root.dataset.pageCountMismatch).toBeUndefined();
});

test("destroyed rendering cannot commit authoritative page metadata", async () => {
  const root = createRoot(18);
  const renderCompletion = deferred<unknown>();
  const renderTask = {
    cancel: vi.fn(),
    promise: renderCompletion.promise,
  };
  const page = createPage(renderTask);
  const reader = createPdfReader(
    root,
    createDependencies(
      vi.fn(async () => ({
        numPages: 20,
        getPage: vi.fn(async () => page),
      })),
    ),
  );

  const initialization = reader.initialize();
  await flushPromises();
  reader.destroy();
  renderCompletion.resolve(undefined);
  await initialization;

  expect(renderTask.cancel).toHaveBeenCalledTimes(1);
  expect(root.querySelector("[data-current-page]")?.textContent).toBe("01");
  expect(root.querySelector("[data-total-pages]")?.textContent).toBe("18");
  expect(root.dataset.pageCountMismatch).toBeUndefined();
  expect(root.dataset.readerState).not.toBe("ready");
});

test("goTo clamps pages and renders the resulting page", async () => {
  const root = createRoot(5);
  const pages = Array.from({ length: 5 }, () => createPage());
  const getPage = vi.fn(async (pageNumber: number) => pages[pageNumber - 1]!);
  const loadDocument = vi.fn(async () => ({ numPages: 5, getPage }));
  const reader = createPdfReader(root, createDependencies(loadDocument));

  await reader.initialize();
  await reader.goTo(3);
  expect(root.querySelector("[data-current-page]")?.textContent).toBe("03");
  expect(pages[2]?.render).toHaveBeenCalledTimes(1);

  await reader.goTo(99);
  expect(root.querySelector("[data-current-page]")?.textContent).toBe("05");
  expect(pages[4]?.render).toHaveBeenCalledTimes(1);
  expect(
    root.querySelector<HTMLButtonElement>('[data-page-action="next"]')?.disabled,
  ).toBe(true);
});

test("cancels active rendering and prevents stale completion from committing UI", async () => {
  const root = createRoot(3);
  const firstCompletion = deferred<unknown>();
  const firstTask = {
    cancel: vi.fn(),
    promise: firstCompletion.promise,
  };
  const pages = [createPage(firstTask), createPage(), createPage()];
  const document: PdfDocumentLike = {
    numPages: 3,
    getPage: vi.fn(async (pageNumber) => pages[pageNumber - 1]!),
  };
  const reader = createPdfReader(
    root,
    createDependencies(vi.fn(async () => document)),
  );

  const initialization = reader.initialize();
  await flushPromises();
  await reader.goTo(2);

  expect(firstTask.cancel).toHaveBeenCalledTimes(1);
  expect(root.querySelector("[data-current-page]")?.textContent).toBe("02");

  firstCompletion.resolve(undefined);
  await initialization;

  expect(root.querySelector("[data-current-page]")?.textContent).toBe("02");
  expect(root.dataset.readerState).toBe("ready");
});

test("failed navigation restores controls to the retained current-page boundary", async () => {
  const root = createRoot(2);
  const failure = new Error("page 2 failed");
  const pages = [
    createPage(),
    createPage({ cancel: vi.fn(), promise: Promise.reject(failure) }),
  ];
  const reader = createPdfReader(
    root,
    createDependencies(
      vi.fn(async () => ({
        numPages: 2,
        getPage: vi.fn(async (pageNumber) => pages[pageNumber - 1]!),
      })),
    ),
  );
  await reader.initialize();

  await expect(reader.goTo(2)).rejects.toBe(failure);

  const previous = root.querySelector<HTMLButtonElement>(
    '[data-page-action="previous"]',
  )!;
  const next = root.querySelector<HTMLButtonElement>(
    '[data-page-action="next"]',
  )!;
  expect(root.querySelector("[data-current-page]")?.textContent).toBe("01");
  expect(previous.disabled).toBe(true);
  expect(previous.getAttribute("aria-disabled")).toBe("true");
  expect(next.disabled).toBe(false);
  expect(next.getAttribute("aria-disabled")).toBe("false");
});

test.each([
  { backingWidth: 960, outputScale: 0, transform: undefined },
  { backingWidth: 1920, outputScale: 3, transform: [2, 0, 0, 2, 0, 0] },
  { backingWidth: 960, outputScale: Number.NaN, transform: undefined },
])(
  "clamps output scale $outputScale to the supported range",
  async ({ backingWidth, outputScale, transform }) => {
    const root = createRoot();
    const page = createPage();
    const loadDocument = vi.fn(async () => ({
      numPages: 18,
      getPage: vi.fn(async () => page),
    }));
    const reader = createPdfReader(
      root,
      createDependencies(loadDocument, { outputScale: () => outputScale }),
    );

    await reader.initialize();

    const canvas = root.querySelector<HTMLCanvasElement>("[data-pdf-canvas]");
    expect(canvas?.width).toBe(backingWidth);
    const renderOptions = vi.mocked(page.render).mock.calls[0]?.[0];
    if (!transform) {
      expect(renderOptions).not.toHaveProperty("transform");
    } else {
      expect(renderOptions?.transform).toEqual(transform);
    }
  },
);

test.each([
  {
    expectedError:
      "PDF reader render dimension error: base viewport width must be positive and finite",
    getViewport: ({ scale }: { scale: number }) => ({
      width: 0 * scale,
      height: 540 * scale,
    }),
    measureWidth: () => 960,
    scenario: "a zero-width base viewport",
  },
  {
    expectedError:
      "PDF reader render dimension error: measured width must be positive and finite",
    getViewport: ({ scale }: { scale: number }) => ({
      width: 960 * scale,
      height: 540 * scale,
    }),
    measureWidth: () => Number.NaN,
    scenario: "a non-finite measured width",
  },
  {
    expectedError:
      "PDF reader render dimension error: scaled viewport dimensions must be positive and finite",
    getViewport: ({ scale }: { scale: number }) =>
      scale === 1
        ? { width: 480, height: 270 }
        : { width: Number.POSITIVE_INFINITY, height: 0 },
    measureWidth: () => 960,
    scenario: "invalid final viewport dimensions",
  },
])(
  "rejects $scenario before mutating or rendering the canvas",
  async ({ expectedError, getViewport, measureWidth }) => {
    const root = createRoot();
    const render = vi.fn(() => ({
      cancel: vi.fn(),
      promise: Promise.resolve(),
    }));
    const page: PdfPageLike = { getViewport, render };
    const reader = createPdfReader(
      root,
      createDependencies(
        vi.fn(async () => ({
          numPages: 18,
          getPage: vi.fn(async () => page),
        })),
        { measureWidth },
      ),
    );
    const canvas = root.querySelector<HTMLCanvasElement>("[data-pdf-canvas]")!;
    const initialSize = {
      height: canvas.height,
      styleHeight: canvas.style.height,
      styleWidth: canvas.style.width,
      width: canvas.width,
    };

    await expect(reader.initialize()).rejects.toThrow(expectedError);

    expect(render).not.toHaveBeenCalled();
    expect(canvas.width).toBe(initialSize.width);
    expect(canvas.height).toBe(initialSize.height);
    expect(canvas.style.width).toBe(initialSize.styleWidth);
    expect(canvas.style.height).toBe(initialSize.styleHeight);
    expect(root.dataset.readerState).toBe("error");
    expect(root.dataset.readerState).not.toBe("ready");
  },
);

test("prefetches only adjacent in-range pages without rendering them", async () => {
  const root = createRoot(3);
  const pages = [createPage(), createPage(), createPage()];
  const getPage = vi.fn(async (pageNumber: number) => {
    if (pageNumber === 3) {
      throw new Error("prefetch failed");
    }
    return pages[pageNumber - 1]!;
  });
  const reader = createPdfReader(
    root,
    createDependencies(vi.fn(async () => ({ numPages: 3, getPage }))),
  );

  await reader.initialize();
  await flushPromises();
  expect(getPage.mock.calls.map(([pageNumber]) => pageNumber)).toEqual([1, 2]);
  expect(pages[1]?.render).not.toHaveBeenCalled();

  getPage.mockClear();
  await reader.goTo(2);
  await flushPromises();

  expect(getPage.mock.calls.map(([pageNumber]) => pageNumber)).toEqual([2, 1, 3]);
  expect(pages[0]?.render).toHaveBeenCalledTimes(1);
  expect(pages[1]?.render).toHaveBeenCalledTimes(1);
  expect(root.dataset.readerState).toBe("ready");
});

test.each([
  ["PDF URL", (root: HTMLElement) => delete root.dataset.pdfUrl],
  ["reader stage", (root: HTMLElement) => root.querySelector("[data-reader-stage]")?.remove()],
  ["PDF canvas", (root: HTMLElement) => root.querySelector("[data-pdf-canvas]")?.remove()],
  ["previous-page control", (root: HTMLElement) => root.querySelector('[data-page-action="previous"]')?.remove()],
  ["next-page control", (root: HTMLElement) => root.querySelector('[data-page-action="next"]')?.remove()],
  ["reader error region", (root: HTMLElement) => root.querySelector("[data-reader-error]")?.remove()],
  ["reader retry control", (root: HTMLElement) => root.querySelector("[data-reader-retry]")?.remove()],
])("throws a clear setup error when %s is missing", (expected, removeRequired) => {
  const root = createRoot();
  removeRequired(root);

  expect(() =>
    createPdfReader(
      root,
      createDependencies(vi.fn(async () => ({ numPages: 1, getPage: vi.fn() }))),
    ),
  ).toThrow(`PDF reader setup error: missing ${expected}`);
});

test("button navigation updates counters and disables boundaries without wrapping", async () => {
  const root = createRoot(2);
  const getPage = vi.fn(async (_pageNumber: number) => createPage());
  createPdfReader(
    root,
    createDependencies(vi.fn(async () => ({ numPages: 2, getPage }))),
  );
  const previous = root.querySelector<HTMLButtonElement>('[data-page-action="previous"]')!;
  const next = root.querySelector<HTMLButtonElement>('[data-page-action="next"]')!;

  expect(previous.disabled).toBe(true);
  expect(previous.getAttribute("aria-disabled")).toBe("true");
  previous.click();
  expect(getPage).not.toHaveBeenCalled();

  root.querySelector<HTMLButtonElement>("[data-reader-retry]")!.click();
  await vi.waitFor(() => expect(root.dataset.readerState).toBe("ready"));
  next.click();
  await vi.waitFor(() => expect(root.querySelector("[data-current-page]")?.textContent).toBe("02"));
  expect(next.disabled).toBe(true);
  expect(next.getAttribute("aria-disabled")).toBe("true");
  next.click();
  await flushPromises();
  expect(getPage.mock.calls.filter(([page]) => page === 2)).toHaveLength(2);

  previous.click();
  await vi.waitFor(() => expect(root.querySelector("[data-current-page]")?.textContent).toBe("01"));
});

test("arrow keys navigate only the focused ready reader and prevent only effective navigation", async () => {
  const first = createRoot(2);
  const second = createRoot(2);
  const firstReader = createPdfReader(
    first,
    createDependencies(vi.fn(async () => ({ numPages: 2, getPage: vi.fn(async () => createPage()) }))),
  );
  createPdfReader(
    second,
    createDependencies(vi.fn(async () => ({ numPages: 2, getPage: vi.fn(async () => createPage()) }))),
  );
  await firstReader.initialize();

  const unrelated = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  first.dispatchEvent(unrelated);
  expect(unrelated.defaultPrevented).toBe(false);
  const boundary = new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true });
  first.dispatchEvent(boundary);
  expect(boundary.defaultPrevented).toBe(false);
  const unready = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
  second.dispatchEvent(unready);
  expect(unready.defaultPrevented).toBe(false);

  const effective = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
  first.dispatchEvent(effective);
  expect(effective.defaultPrevented).toBe(true);
  await vi.waitFor(() => expect(first.querySelector("[data-current-page]")?.textContent).toBe("02"));
  expect(second.querySelector("[data-current-page]")?.textContent).toBe("01");

  const childArrow = new KeyboardEvent("keydown", {
    key: "ArrowLeft",
    bubbles: true,
    cancelable: true,
  });
  first.querySelector('[data-page-action="next"]')!.dispatchEvent(childArrow);
  expect(childArrow.defaultPrevented).toBe(false);
  await flushPromises();
  expect(first.querySelector("[data-current-page]")?.textContent).toBe("02");
});

test("load failure is isolated, exposes retry and preserves the original PDF link", async () => {
  const failedRoot = createRoot(2);
  const readyRoot = createRoot(2);
  const originalHref = failedRoot.querySelector<HTMLAnchorElement>("[data-reader-error] a")!.href;
  const failure = new Error("offline");
  const failedReader = createPdfReader(failedRoot, createDependencies(vi.fn(async () => { throw failure; })));
  const readyReader = createPdfReader(
    readyRoot,
    createDependencies(vi.fn(async () => ({ numPages: 2, getPage: vi.fn(async () => createPage()) }))),
  );

  await expect(failedReader.initialize()).rejects.toBe(failure);
  await readyReader.initialize();

  expect(failedRoot.dataset.readerState).toBe("error");
  expect(failedRoot.querySelector<HTMLElement>("[data-reader-error]")!.hidden).toBe(false);
  expect(failedRoot.querySelector("[data-reader-status]")?.textContent).toBe("Project unavailable");
  expect(failedRoot.querySelector("[data-reader-error] a")?.getAttribute("href")).toBe("/projects/pdfs/inkseat.pdf");
  expect(failedRoot.querySelector<HTMLAnchorElement>("[data-reader-error] a")!.href).toBe(originalHref);
  expect(readyRoot.dataset.readerState).toBe("ready");
  expect(readyRoot.querySelector<HTMLElement>("[data-reader-error]")!.hidden).toBe(true);
});

test("retry clears only its own error and repeated retry keeps the newest load authoritative", async () => {
  const root = createRoot(2);
  const other = createRoot(2);
  other.querySelector<HTMLElement>("[data-reader-error]")!.hidden = false;
  const stale = deferred<PdfDocumentLike>();
  const current: PdfDocumentLike = { numPages: 3, getPage: vi.fn(async () => createPage()) };
  const loadDocument = vi
    .fn<PdfReaderDependencies["loadDocument"]>()
    .mockRejectedValueOnce(new Error("first"))
    .mockImplementationOnce(() => stale.promise)
    .mockResolvedValueOnce(current);
  const reader = createPdfReader(root, createDependencies(loadDocument));
  await expect(reader.initialize()).rejects.toThrow("first");

  const retry = root.querySelector<HTMLButtonElement>("[data-reader-retry]")!;
  retry.click();
  retry.click();
  await vi.waitFor(() => expect(root.dataset.readerState).toBe("ready"));
  stale.resolve({ numPages: 9, getPage: vi.fn(async () => createPage()) });
  await flushPromises();

  expect(loadDocument).toHaveBeenCalledTimes(3);
  expect(root.querySelector("[data-total-pages]")?.textContent).toBe("03");
  expect(root.querySelector<HTMLElement>("[data-reader-error]")!.hidden).toBe(true);
  expect(other.querySelector<HTMLElement>("[data-reader-error]")!.hidden).toBe(false);
});

test("touch and pen horizontal swipes navigate while mouse and vertical gestures are ignored", async () => {
  const root = createRoot(3);
  const reader = createPdfReader(
    root,
    createDependencies(vi.fn(async () => ({ numPages: 3, getPage: vi.fn(async () => createPage()) }))),
  );
  await reader.initialize();

  dispatchPointer(root, "pointerdown", { pointerType: "mouse", clientX: 100, clientY: 0 });
  const mouseUp = dispatchPointer(root, "pointerup", { pointerType: "mouse", clientX: 0, clientY: 0 });
  expect(mouseUp.defaultPrevented).toBe(false);
  dispatchPointer(root, "pointerdown", { pointerType: "touch", clientX: 100, clientY: 0 });
  const vertical = dispatchPointer(root, "pointerup", { pointerType: "touch", clientX: 80, clientY: 90 });
  expect(vertical.defaultPrevented).toBe(false);
  expect(root.querySelector("[data-current-page]")?.textContent).toBe("01");

  dispatchPointer(root, "pointerdown", { pointerType: "touch", clientX: 100, clientY: 10 });
  const next = dispatchPointer(root, "pointerup", { pointerType: "touch", clientX: 20, clientY: 15 });
  expect(next.defaultPrevented).toBe(true);
  await vi.waitFor(() => expect(root.querySelector("[data-current-page]")?.textContent).toBe("02"));
  dispatchPointer(root, "pointerdown", { pointerType: "pen", clientX: 10, clientY: 10 });
  dispatchPointer(root, "pointerup", { pointerType: "pen", clientX: 90, clientY: 15 });
  await vi.waitFor(() => expect(root.querySelector("[data-current-page]")?.textContent).toBe("01"));
});

test("resize rerenders the current page at the newly measured width", async () => {
  const root = createRoot(3);
  let width = 960;
  const pages = [createPage(), createPage(), createPage()];
  const reader = createPdfReader(
    root,
    createDependencies(
      vi.fn(async () => ({ numPages: 3, getPage: vi.fn(async (number) => pages[number - 1]!) })),
      { measureWidth: () => width },
    ),
  );
  await reader.initialize();
  await reader.goTo(2);
  width = 480;
  await reader.resize();

  expect(root.querySelector("[data-current-page]")?.textContent).toBe("02");
  expect(root.querySelector<HTMLCanvasElement>("[data-pdf-canvas]")?.style.width).toBe("480px");
  expect(pages[1]?.render).toHaveBeenCalledTimes(2);

  await reader.resize();
  expect(pages[1]?.render).toHaveBeenCalledTimes(2);
});

test("transition frames are skipped for reduced motion and otherwise toggle minimal state classes", async () => {
  const reducedRoot = createRoot(1);
  const reducedFrame = vi.fn(() => 1);
  const reduced = createPdfReader(
    reducedRoot,
    createDependencies(vi.fn(async () => ({ numPages: 1, getPage: vi.fn(async () => createPage()) })), {
      reducedMotion: () => true,
      requestFrame: reducedFrame,
    }),
  );
  await reduced.initialize();
  expect(reducedFrame).not.toHaveBeenCalled();
  expect(reducedRoot.classList.contains("is-ready")).toBe(false);

  const root = createRoot(1);
  const callbacks: FrameRequestCallback[] = [];
  const reader = createPdfReader(
    root,
    createDependencies(vi.fn(async () => ({ numPages: 1, getPage: vi.fn(async () => createPage()) })), {
      requestFrame: (callback) => (callbacks.push(callback), callbacks.length),
    }),
  );
  await reader.initialize();
  callbacks.splice(0).forEach((callback) => callback(0));
  expect(root.classList.contains("is-rendering")).toBe(false);
  expect(root.classList.contains("is-ready")).toBe(true);
});

test("destroy removes interaction listeners, cancels work and blocks queued transition callbacks", async () => {
  const root = createRoot(2);
  const completion = deferred<unknown>();
  const task = { cancel: vi.fn(), promise: completion.promise };
  const callbacks: FrameRequestCallback[] = [];
  const reader = createPdfReader(
    root,
    createDependencies(vi.fn(async () => ({ numPages: 2, getPage: vi.fn(async () => createPage(task)) })), {
      requestFrame: (callback) => (callbacks.push(callback), callbacks.length),
    }),
  );
  const initializing = reader.initialize();
  await flushPromises();
  reader.destroy();
  root.querySelector<HTMLButtonElement>('[data-page-action="next"]')!.click();
  root.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  dispatchPointer(root, "pointerdown", { pointerType: "touch", clientX: 100, clientY: 0 });
  dispatchPointer(root, "pointerup", { pointerType: "touch", clientX: 0, clientY: 0 });
  callbacks.forEach((callback) => callback(0));
  completion.resolve(undefined);
  await initializing;

  expect(task.cancel).toHaveBeenCalledTimes(1);
  expect(root.querySelector("[data-current-page]")?.textContent).toBe("01");
  expect(root.classList.contains("is-ready")).toBe(false);
});

test("destroy cancels queued transition frames with the browser fallback", async () => {
  const cancelAnimationFrame = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
  try {
    const root = createRoot(1);
    let frameId = 40;
    const reader = createPdfReader(
      root,
      createDependencies(
        vi.fn(async () => ({
          numPages: 1,
          getPage: vi.fn(async () => createPage()),
        })),
        { requestFrame: () => ++frameId },
      ),
    );
    await reader.initialize();

    reader.destroy();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(41);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("lazy manager independently initializes six readers and coalesces resize notifications", async () => {
  const portfolio = document.createElement("main");
  const roots = Array.from({ length: 6 }, () => createRoot(2));
  roots.forEach((root) => portfolio.append(root));
  let intersectionCallback!: IntersectionObserverCallback;
  const unobserve = vi.fn();
  const intersectionDisconnect = vi.fn();
  class FakeIntersectionObserver {
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      intersectionCallback = callback;
      expect(options?.rootMargin).toBe("600px 0px");
    }
    observe = vi.fn();
    unobserve = unobserve;
    disconnect = intersectionDisconnect;
  }
  let resizeCallback!: ResizeObserverCallback;
  const resizeObserve = vi.fn();
  const resizeDisconnect = vi.fn();
  class FakeResizeObserver {
    constructor(callback: ResizeObserverCallback) { resizeCallback = callback; }
    observe = resizeObserve;
    unobserve = vi.fn();
    disconnect = resizeDisconnect;
  }
  const frames: FrameRequestCallback[] = [];
  const loadDocument = vi.fn(async () => ({ numPages: 2, getPage: vi.fn(async () => createPage()) }));
  const cleanup = startProjectReaders(portfolio, {
    ...createDependencies(loadDocument, { requestFrame: (callback) => (frames.push(callback), frames.length) }),
    IntersectionObserver: FakeIntersectionObserver,
    ResizeObserver: FakeResizeObserver,
    cancelFrame: vi.fn(),
  });

  expect(loadDocument).not.toHaveBeenCalled();
  intersectionCallback(
    roots.map(
      (target) =>
        ({ isIntersecting: true, target }) as unknown as IntersectionObserverEntry,
    ),
    {} as IntersectionObserver,
  );
  intersectionCallback(
    [
      {
        isIntersecting: true,
        target: roots[0]!,
      } as unknown as IntersectionObserverEntry,
    ],
    {} as IntersectionObserver,
  );
  await vi.waitFor(() => expect(loadDocument).toHaveBeenCalledTimes(6));
  expect(unobserve).toHaveBeenCalledTimes(6);
  await vi.waitFor(() => expect(resizeObserve).toHaveBeenCalledTimes(6));
  const frameCount = frames.length;
  resizeCallback(
    [roots[0]!, roots[0]!, roots[1]!].map(
      (root) =>
        ({
          target: root.querySelector("[data-reader-stage]")!,
        }) as ResizeObserverEntry,
    ),
    {} as ResizeObserver,
  );
  resizeCallback(
    [{ target: roots[1]!.querySelector("[data-reader-stage]")! } as ResizeObserverEntry],
    {} as ResizeObserver,
  );
  expect(frames).toHaveLength(frameCount + 1);
  frames[frameCount]?.(0);
  await flushPromises();

  cleanup();
  expect(intersectionDisconnect).toHaveBeenCalledTimes(1);
  expect(resizeDisconnect).toHaveBeenCalledTimes(1);
});

test("lazy manager fallback starts every reader and isolates a rejected load", async () => {
  const portfolio = document.createElement("main");
  const roots = Array.from({ length: 2 }, () => createRoot(1));
  roots.forEach((root) => portfolio.append(root));
  const loadDocument = vi
    .fn<PdfReaderDependencies["loadDocument"]>()
    .mockRejectedValueOnce(new Error("broken"))
    .mockResolvedValueOnce({ numPages: 1, getPage: vi.fn(async () => createPage()) });
  const cleanup = startProjectReaders(portfolio, {
    ...createDependencies(loadDocument),
    IntersectionObserver: undefined,
    ResizeObserver: undefined,
  });
  await vi.waitFor(() => expect(loadDocument).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(roots[1]?.dataset.readerState).toBe("ready"));
  expect(roots[0]?.dataset.readerState).toBe("error");
  cleanup();
});

test("lazy manager cleanup cancels a queued resize frame with the browser fallback", async () => {
  const cancelAnimationFrame = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
  try {
    const portfolio = document.createElement("main");
    const root = createRoot(1);
    portfolio.append(root);
    let resizeCallback!: ResizeObserverCallback;
    class FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe = vi.fn();
      disconnect = vi.fn();
    }
    const cleanup = startProjectReaders(portfolio, {
      ...createDependencies(
        vi.fn(async () => ({
          numPages: 1,
          getPage: vi.fn(async () => createPage()),
        })),
        {
          reducedMotion: () => true,
          requestFrame: () => 73,
        },
      ),
      IntersectionObserver: undefined,
      ResizeObserver: FakeResizeObserver,
    });
    await vi.waitFor(() => expect(root.dataset.readerState).toBe("ready"));
    resizeCallback(
      [
        {
          target: root.querySelector("[data-reader-stage]")!,
        } as ResizeObserverEntry,
      ],
      {} as ResizeObserver,
    );

    cleanup();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(73);
  } finally {
    vi.unstubAllGlobals();
  }
});
