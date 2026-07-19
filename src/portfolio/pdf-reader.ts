import {
  boundPage,
  pageBoundary,
  pageCounter,
  swipeDirection,
} from "./pdf-reader-state";

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
  cancelFrame?(frameId: number): void;
  IntersectionObserver?: IntersectionObserverConstructor;
  ResizeObserver?: ResizeObserverConstructor;
}

interface IntersectionObserverLike {
  observe(target: Element): void;
  unobserve(target: Element): void;
  disconnect(): void;
}

interface IntersectionObserverConstructor {
  new (
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ): IntersectionObserverLike;
}

interface ResizeObserverLike {
  observe(target: Element): void;
  disconnect(): void;
}

interface ResizeObserverConstructor {
  new (callback: ResizeObserverCallback): ResizeObserverLike;
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

function resolveCancelFrame(
  dependencies: PdfReaderDependencies,
): ((frameId: number) => void) | undefined {
  if (dependencies.cancelFrame) {
    return dependencies.cancelFrame;
  }
  if (typeof globalThis.cancelAnimationFrame === "function") {
    return globalThis.cancelAnimationFrame.bind(globalThis);
  }
  return undefined;
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

  const previousControl = requireElement<HTMLButtonElement>(
    root,
    '[data-page-action="previous"]',
    "previous-page control",
  );
  const nextControl = requireElement<HTMLButtonElement>(
    root,
    '[data-page-action="next"]',
    "next-page control",
  );
  const errorRegion = requireElement<HTMLElement>(
    root,
    "[data-reader-error]",
    "reader error region",
  );
  const retryControl = requireElement<HTMLButtonElement>(
    root,
    "[data-reader-retry]",
    "reader retry control",
  );
  const cancelFrame = resolveCancelFrame(dependencies);

  let document: PdfDocumentLike | null = null;
  let totalPages = expectedPages;
  let currentPage = 1;
  let generation = 0;
  let activeRenderTask: PdfRenderTaskLike | null = null;
  let initializationPromise: Promise<void> | null = null;
  let renderedWidth: number | null = null;
  let destroyed = false;
  let pointerStart: {
    id: number;
    x: number;
    y: number;
  } | null = null;
  const activePointers = new Set<number>();
  let pointerSessionInvalidated = false;
  const transitionFrames = new Set<{
    active: boolean;
    generation: number;
    id: number;
  }>();

  function updateControls(pageNumber: number): void {
    const boundary = pageBoundary(pageNumber, totalPages);
    previousControl.disabled = !boundary.canGoPrevious;
    previousControl.setAttribute(
      "aria-disabled",
      String(!boundary.canGoPrevious),
    );
    nextControl.disabled = !boundary.canGoNext;
    nextControl.setAttribute("aria-disabled", String(!boundary.canGoNext));
  }

  function updateNavigation(pageNumber: number): void {
    const counter = pageCounter(pageNumber, totalPages);
    currentPageElement.textContent = counter.current;
    totalPagesElement.textContent = counter.total;
    if (totalPages !== expectedPages) {
      root.dataset.pageCountMismatch = `${expectedPages}:${totalPages}`;
    } else {
      delete root.dataset.pageCountMismatch;
    }
    updateControls(pageNumber);
  }

  function scheduleTransition(
    renderGeneration: number,
    callback: () => void,
  ): void {
    if (dependencies.reducedMotion()) {
      return;
    }
    const frame = {
      active: true,
      generation: renderGeneration,
      id: 0,
    };
    let completedSynchronously = false;
    frame.id = dependencies.requestFrame(() => {
      completedSynchronously = true;
      transitionFrames.delete(frame);
      const active = frame.active;
      frame.active = false;
      if (active && !destroyed && renderGeneration === generation) {
        callback();
      }
    });
    if (!completedSynchronously && frame.active) {
      transitionFrames.add(frame);
    }
  }

  function normalizeTransitions(renderGeneration?: number): void {
    transitionFrames.forEach((frame) => {
      if (
        renderGeneration === undefined ||
        frame.generation === renderGeneration
      ) {
        frame.active = false;
        cancelFrame?.(frame.id);
        transitionFrames.delete(frame);
      }
    });
    root.classList.remove("is-rendering", "is-ready");
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
    errorRegion.hidden = true;
    status.textContent = `Rendering page ${pageCounter(targetPage, totalPages).current}`;
    scheduleTransition(renderGeneration, () => {
      root.classList.remove("is-ready");
      root.classList.add("is-rendering");
    });

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
      renderedWidth = cssWidth;
      updateNavigation(currentPage);
      status.textContent = `Page ${pageCounter(currentPage, totalPages).current} of ${pageCounter(currentPage, totalPages).total}`;
      root.dataset.readerState = "ready";
      errorRegion.hidden = true;
      scheduleTransition(renderGeneration, () => {
        root.classList.remove("is-rendering");
        root.classList.add("is-ready");
      });
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
      normalizeTransitions(renderGeneration);
      updateControls(currentPage);
      root.dataset.readerState = "error";
      errorRegion.hidden = false;
      status.textContent = "Project unavailable";
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
    errorRegion.hidden = true;
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
          errorRegion.hidden = false;
          status.textContent = "Project unavailable";
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
      const measuredWidth = dependencies.measureWidth(stage);
      if (renderedWidth !== null && measuredWidth === renderedWidth) {
        return;
      }
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
    renderedWidth = null;
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
    pointerStart = null;
    activePointers.clear();
    pointerSessionInvalidated = false;
    previousControl.removeEventListener("click", handlePreviousClick);
    nextControl.removeEventListener("click", handleNextClick);
    retryControl.removeEventListener("click", handleRetryClick);
    root.removeEventListener("keydown", handleKeydown);
    root.removeEventListener("pointerdown", handlePointerDown);
    root.removeEventListener("pointerup", handlePointerUp);
    root.removeEventListener("pointercancel", clearPointer);
    root.removeEventListener("lostpointercapture", clearPointer);
    normalizeTransitions();
  }

  function navigate(direction: "previous" | "next"): boolean {
    if (destroyed || !document) {
      return false;
    }
    const boundary = pageBoundary(currentPage, totalPages);
    if (
      (direction === "previous" && !boundary.canGoPrevious) ||
      (direction === "next" && !boundary.canGoNext)
    ) {
      return false;
    }
    const offset = direction === "previous" ? -1 : 1;
    void goTo(currentPage + offset).catch(() => undefined);
    return true;
  }

  function handlePreviousClick(): void {
    navigate("previous");
  }

  function handleNextClick(): void {
    navigate("next");
  }

  function handleRetryClick(): void {
    void retry().catch(() => undefined);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (
      (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
    ) {
      return;
    }
    if (navigate(event.key === "ArrowLeft" ? "previous" : "next")) {
      event.preventDefault();
    }
  }

  function handlePointerDown(event: PointerEvent): void {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") {
      return;
    }
    if (activePointers.has(event.pointerId)) {
      return;
    }
    if (activePointers.size > 0) {
      pointerSessionInvalidated = true;
      pointerStart = null;
    } else {
      pointerSessionInvalidated = false;
      pointerStart = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
    }
    activePointers.add(event.pointerId);
  }

  function handlePointerUp(event: PointerEvent): void {
    if (!activePointers.delete(event.pointerId)) {
      return;
    }
    const start = pointerStart;
    const canComplete =
      !pointerSessionInvalidated && start?.id === event.pointerId;
    if (start?.id === event.pointerId) {
      pointerStart = null;
    }
    if (activePointers.size === 0) {
      pointerSessionInvalidated = false;
      pointerStart = null;
    }
    if (!canComplete || !start) {
      return;
    }
    const direction = swipeDirection({
      deltaX: event.clientX - start.x,
      deltaY: event.clientY - start.y,
    });
    if (direction && navigate(direction)) {
      event.preventDefault();
    }
  }

  function clearPointer(event: PointerEvent): void {
    if (!activePointers.delete(event.pointerId)) {
      return;
    }
    if (pointerStart?.id === event.pointerId) {
      pointerStart = null;
    }
    if (activePointers.size === 0) {
      pointerSessionInvalidated = false;
      pointerStart = null;
    }
  }

  updateNavigation(currentPage);
  previousControl.addEventListener("click", handlePreviousClick);
  nextControl.addEventListener("click", handleNextClick);
  retryControl.addEventListener("click", handleRetryClick);
  root.addEventListener("keydown", handleKeydown);
  root.addEventListener("pointerdown", handlePointerDown);
  root.addEventListener("pointerup", handlePointerUp);
  root.addEventListener("pointercancel", clearPointer);
  root.addEventListener("lostpointercapture", clearPointer);

  return { destroy, goTo, initialize, resize, retry };
}

export function startProjectReaders(
  root: ParentNode,
  dependencies: PdfReaderDependencies,
): () => void {
  const readerRoots = Array.from(
    root.querySelectorAll<HTMLElement>("[data-project-reader]"),
  );
  const cancelFrame = resolveCancelFrame(dependencies);
  const controllers = new Map<HTMLElement, PdfReader>();
  const stages = new Map<Element, PdfReader>();
  const initializedRoots = new Set<HTMLElement>();
  let destroyed = false;
  let resizeFrame: number | null = null;
  const pendingResize = new Set<PdfReader>();

  readerRoots.forEach((readerRoot) => {
    controllers.set(readerRoot, createPdfReader(readerRoot, dependencies));
  });

  const ResizeObserverValue =
    dependencies.ResizeObserver ?? globalThis.ResizeObserver;
  const resizeObserver = ResizeObserverValue
    ? new ResizeObserverValue((entries) => {
        if (destroyed) {
          return;
        }
        entries.forEach((entry) => {
          const controller = stages.get(entry.target);
          if (controller) {
            pendingResize.add(controller);
          }
        });
        if (pendingResize.size === 0 || resizeFrame !== null) {
          return;
        }
        resizeFrame = dependencies.requestFrame(() => {
          resizeFrame = null;
          if (destroyed) {
            pendingResize.clear();
            return;
          }
          const readers = Array.from(pendingResize);
          pendingResize.clear();
          readers.forEach((reader) => {
            void reader.resize().catch(() => undefined);
          });
        });
      })
    : null;

  function initialize(readerRoot: HTMLElement): void {
    const controller = controllers.get(readerRoot);
    if (!controller || destroyed || initializedRoots.has(readerRoot)) {
      return;
    }
    initializedRoots.add(readerRoot);
    if (resizeObserver) {
      const stage = readerRoot.querySelector<HTMLElement>(
        "[data-reader-stage]",
      );
      if (stage && !stages.has(stage)) {
        stages.set(stage, controller);
        resizeObserver.observe(stage);
      }
    }
    void controller.initialize().catch(() => undefined);
  }

  const IntersectionObserverValue =
    dependencies.IntersectionObserver ?? globalThis.IntersectionObserver;
  const intersectionObserver = IntersectionObserverValue
    ? new IntersectionObserverValue(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) {
              return;
            }
            if (initializedRoots.has(entry.target)) {
              return;
            }
            intersectionObserver?.unobserve(entry.target);
            initialize(entry.target);
          });
        },
        { rootMargin: "600px 0px" },
      )
    : null;

  if (intersectionObserver) {
    readerRoots.forEach((readerRoot) => intersectionObserver.observe(readerRoot));
  } else {
    readerRoots.forEach(initialize);
  }

  return () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    intersectionObserver?.disconnect();
    resizeObserver?.disconnect();
    if (resizeFrame !== null) {
      cancelFrame?.(resizeFrame);
      resizeFrame = null;
    }
    pendingResize.clear();
    controllers.forEach((controller) => controller.destroy());
    controllers.clear();
    stages.clear();
    initializedRoots.clear();
  };
}
