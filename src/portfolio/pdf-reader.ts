import { boundPage, pageBoundary, pageCounter } from "./pdf-reader-state";

export interface PdfRenderTaskLike {
  cancel(): void;
  promise: Promise<unknown>;
}

export interface PdfPageLike {
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
    transform?: number[];
  }): PdfRenderTaskLike;
}

export interface PdfDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
}

export interface PdfReaderDependencies {
  loadDocument(url: string): Promise<PdfDocumentLike>;
  measureWidth(stage: HTMLElement): number;
  outputScale(): number;
  requestFrame(callback: FrameRequestCallback): number;
  reducedMotion(): boolean;
}

export interface PdfReader {
  initialize(): Promise<void>;
  goTo(pageNumber: number): Promise<void>;
  resize(): Promise<void>;
  retry(): Promise<void>;
  destroy(): void;
}

function setupError(missing: string): Error {
  return new Error(`PDF reader setup error: missing ${missing}`);
}

function requireData(value: string | undefined, description: string): string {
  if (!value) {
    throw setupError(description);
  }
  return value;
}

function requireElement<T extends Element>(
  root: HTMLElement,
  selector: string,
  description: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw setupError(description);
  }
  return element;
}

function isRenderingCancellation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "RenderingCancelledException"
  );
}

function requireCanvasContext(
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw setupError("2D canvas context");
  }
  return context;
}

function validPageCount(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

function requirePositiveFiniteDimension(value: number, description: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`PDF reader render dimension error: ${description}`);
  }
}

export function createPdfReader(
  root: HTMLElement,
  dependencies: PdfReaderDependencies,
): PdfReader {
  const pdfUrl = requireData(root.dataset.pdfUrl, "PDF URL");

  const expectedPages = Number(root.dataset.expectedPages);
  if (!validPageCount(expectedPages)) {
    throw setupError("expected page count");
  }

  const stage = requireElement<HTMLElement>(
    root,
    "[data-reader-stage]",
    "reader stage",
  );
  const canvas = requireElement<HTMLCanvasElement>(
    root,
    "[data-pdf-canvas]",
    "PDF canvas",
  );
  const status = requireElement<HTMLElement>(
    root,
    "[data-reader-status]",
    "reader status",
  );
  const currentPageElement = requireElement<HTMLElement>(
    root,
    "[data-current-page]",
    "current-page counter",
  );
  const totalPagesElement = requireElement<HTMLElement>(
    root,
    "[data-total-pages]",
    "total-pages counter",
  );
  const canvasContext = requireCanvasContext(canvas);

  const previousControl = root.querySelector<HTMLButtonElement>(
    '[data-page-action="previous"]',
  );
  const nextControl = root.querySelector<HTMLButtonElement>(
    '[data-page-action="next"]',
  );

  let document: PdfDocumentLike | null = null;
  let totalPages = expectedPages;
  let currentPage = 1;
  let generation = 0;
  let activeRenderTask: PdfRenderTaskLike | null = null;
  let initializationPromise: Promise<void> | null = null;
  let destroyed = false;

  function updateNavigation(pageNumber: number): void {
    const counter = pageCounter(pageNumber, totalPages);
    const boundary = pageBoundary(pageNumber, totalPages);
    currentPageElement.textContent = counter.current;
    totalPagesElement.textContent = counter.total;
    if (totalPages !== expectedPages) {
      root.dataset.pageCountMismatch = `${expectedPages}:${totalPages}`;
    } else {
      delete root.dataset.pageCountMismatch;
    }
    if (previousControl) {
      previousControl.disabled = !boundary.canGoPrevious;
    }
    if (nextControl) {
      nextControl.disabled = !boundary.canGoNext;
    }
  }

  function prefetchAdjacent(pageNumber: number): void {
    if (!document || destroyed) {
      return;
    }

    const adjacentPages = [pageNumber - 1, pageNumber + 1].filter(
      (candidate) => candidate >= 1 && candidate <= totalPages,
    );
    void Promise.all(
      adjacentPages.map((candidate) => document!.getPage(candidate)),
    ).catch(() => undefined);
  }

  async function renderPage(pageNumber: number): Promise<void> {
    if (!document || destroyed) {
      return;
    }

    const targetPage = boundPage(pageNumber, totalPages);
    const renderGeneration = ++generation;
    activeRenderTask?.cancel();
    activeRenderTask = null;
    root.dataset.readerState = "rendering";
    status.textContent = `Rendering page ${pageCounter(targetPage, totalPages).current}`;

    try {
      const page = await document.getPage(targetPage);
      if (destroyed || renderGeneration !== generation) {
        return;
      }

      const base = page.getViewport({ scale: 1 });
      requirePositiveFiniteDimension(
        base.width,
        "base viewport width must be positive and finite",
      );
      const cssWidth = Math.max(1, dependencies.measureWidth(stage));
      requirePositiveFiniteDimension(
        cssWidth,
        "measured width must be positive and finite",
      );
      const cssScale = cssWidth / base.width;
      const viewport = page.getViewport({ scale: cssScale });
      requirePositiveFiniteDimension(
        viewport.width,
        "scaled viewport dimensions must be positive and finite",
      );
      requirePositiveFiniteDimension(
        viewport.height,
        "scaled viewport dimensions must be positive and finite",
      );
      const requestedOutputScale = dependencies.outputScale();
      const outputScale = Number.isFinite(requestedOutputScale)
        ? Math.min(2, Math.max(1, requestedOutputScale))
        : 1;

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const renderOptions: Parameters<PdfPageLike["render"]>[0] = {
        canvasContext,
        viewport,
      };
      if (outputScale !== 1) {
        renderOptions.transform = [outputScale, 0, 0, outputScale, 0, 0];
      }

      const renderTask = page.render(renderOptions);
      activeRenderTask = renderTask;
      await renderTask.promise;

      if (destroyed || renderGeneration !== generation) {
        return;
      }

      activeRenderTask = null;
      currentPage = targetPage;
      updateNavigation(currentPage);
      status.textContent = `Page ${pageCounter(currentPage, totalPages).current} of ${pageCounter(currentPage, totalPages).total}`;
      root.dataset.readerState = "ready";
      prefetchAdjacent(currentPage);
    } catch (error) {
      if (
        destroyed ||
        renderGeneration !== generation ||
        isRenderingCancellation(error)
      ) {
        return;
      }

      activeRenderTask = null;
      root.dataset.readerState = "error";
      status.textContent = "Unable to render project";
      throw error;
    }
  }

  function initialize(): Promise<void> {
    if (destroyed) {
      return Promise.resolve();
    }
    if (initializationPromise) {
      return initializationPromise;
    }

    const initializationGeneration = ++generation;
    root.dataset.readerState = "loading";
    status.textContent = "Loading project";
    initializationPromise = (async () => {
      try {
        const loadedDocument = await dependencies.loadDocument(pdfUrl);
        if (destroyed || initializationGeneration !== generation) {
          return;
        }
        if (!validPageCount(loadedDocument.numPages)) {
          throw new Error(
            "PDF reader document error: numPages must be a positive finite integer",
          );
        }

        document = loadedDocument;
        totalPages = loadedDocument.numPages;
        await renderPage(1);
      } catch (error) {
        if (
          !destroyed &&
          initializationGeneration === generation &&
          !isRenderingCancellation(error)
        ) {
          root.dataset.readerState = "error";
          status.textContent = "Unable to load project";
        }
        throw error;
      }
    })();

    return initializationPromise;
  }

  async function goTo(pageNumber: number): Promise<void> {
    if (destroyed) {
      return;
    }
    if (!document) {
      await initialize();
    }
    await renderPage(pageNumber);
  }

  async function resize(): Promise<void> {
    if (!destroyed && document) {
      await renderPage(currentPage);
    }
  }

  async function retry(): Promise<void> {
    if (destroyed) {
      return;
    }
    generation += 1;
    activeRenderTask?.cancel();
    activeRenderTask = null;
    document = null;
    initializationPromise = null;
    currentPage = 1;
    await initialize();
  }

  function destroy(): void {
    if (destroyed) {
      return;
    }
    destroyed = true;
    generation += 1;
    activeRenderTask?.cancel();
    activeRenderTask = null;
  }

  return { destroy, goTo, initialize, resize, retry };
}
