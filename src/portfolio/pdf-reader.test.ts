import { beforeEach, expect, test, vi } from "vitest";

import {
  createPdfReader,
  type PdfDocumentLike,
  type PdfPageLike,
  type PdfReaderDependencies,
  type PdfRenderTaskLike,
} from "./pdf-reader";

function createRoot(expectedPages = 18): HTMLElement {
  const root = document.createElement("figure");
  root.dataset.pdfUrl = "/projects/pdfs/inkseat.pdf";
  root.dataset.expectedPages = String(expectedPages);
  root.innerHTML = `
    <div data-reader-stage>
      <canvas data-pdf-canvas></canvas>
      <p data-reader-status>Loading project</p>
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
