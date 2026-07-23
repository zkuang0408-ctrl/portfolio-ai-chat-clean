import {
  projects,
  type Project,
  type ProjectPageAsset,
} from "../content/portfolio";
import {
  OPEN_PROJECT_PAGE_EVENT,
  type OpenProjectPageDetail,
} from "../chat/source-navigation";
import {
  boundPage,
  pageBoundary,
  pageCounter,
  swipeDirection,
} from "./pdf-reader-state";

interface IntersectionObserverLike {
  observe(target: Element): void;
  unobserve(target: Element): void;
  disconnect(): void;
}

export interface IntersectionObserverConstructor {
  new (
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ): IntersectionObserverLike;
}

export interface ImageReaderDependencies {
  load(asset: ProjectPageAsset): Promise<void>;
  preload(asset: ProjectPageAsset): void;
  awaitVisibleImage(image: HTMLImageElement): Promise<void>;
  IntersectionObserver?: IntersectionObserverConstructor;
}

export interface ImageReader {
  initialize(): Promise<void>;
  goTo(pageNumber: number): Promise<void>;
  retry(): Promise<void>;
  destroy(): void;
}

function setupError(missing: string): Error {
  return new Error(`Image reader setup error: missing ${missing}`);
}

function requireElement<T extends Element>(
  root: HTMLElement,
  selector: string,
  description: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw setupError(description);
  return element;
}

function projectFor(root: HTMLElement): Project {
  const projectId = root.dataset.projectId;
  const project = projects.find(({ id }) => id === projectId);
  if (!project) throw setupError("known project ID");
  return project;
}

function applyAsset(
  mobile: HTMLSourceElement,
  image: HTMLImageElement,
  asset: ProjectPageAsset,
  title: string,
  total: number,
): void {
  mobile.srcset = asset.mobile;
  image.src = asset.desktop;
  image.alt = `${title} — page ${asset.page} of ${total}`;
}

function readOpenProjectPageDetail(
  event: Event,
): OpenProjectPageDetail | undefined {
  const detail = (event as Event & { readonly detail?: unknown }).detail;
  if (typeof detail !== "object" || detail === null || Array.isArray(detail)) {
    return undefined;
  }
  const record = detail as Record<string, unknown>;
  if (
    typeof record.projectId !== "string" ||
    !Number.isSafeInteger(record.page) ||
    (record.page as number) <= 0
  ) {
    return undefined;
  }
  return { projectId: record.projectId, page: record.page as number };
}

export function createImageReader(
  root: HTMLElement,
  dependencies: ImageReaderDependencies,
): ImageReader {
  const project = projectFor(root);
  const totalPages = project.pdf.pages.length;
  const expectedPages = Number(root.dataset.expectedPages);
  if (
    !Number.isSafeInteger(expectedPages) ||
    expectedPages <= 0 ||
    expectedPages !== totalPages
  ) {
    throw setupError("matching expected page count");
  }

  const mobile = requireElement<HTMLSourceElement>(
    root,
    "[data-page-mobile]",
    "mobile page source",
  );
  const image = requireElement<HTMLImageElement>(
    root,
    "[data-page-image]",
    "page image",
  );
  const status = requireElement<HTMLElement>(
    root,
    "[data-reader-status]",
    "reader status",
  );
  const errorRegion = requireElement<HTMLElement>(
    root,
    "[data-reader-error]",
    "reader error region",
  );
  const retryControl = requireElement<HTMLButtonElement>(
    root,
    "[data-reader-retry]",
    "retry control",
  );
  const previousControl = requireElement<HTMLButtonElement>(
    root,
    '[data-page-action="previous"]',
    "previous control",
  );
  const nextControl = requireElement<HTMLButtonElement>(
    root,
    '[data-page-action="next"]',
    "next control",
  );
  const currentPageElement = requireElement<HTMLElement>(
    root,
    "[data-current-page]",
    "current page",
  );
  const totalPagesElement = requireElement<HTMLElement>(
    root,
    "[data-total-pages]",
    "total pages",
  );

  let currentPage = 1;
  let generation = 0;
  let initialized = false;
  let initializationPromise: Promise<void> | null = null;
  let failedPage: number | null = null;
  let destroyed = false;
  let pointerStart: { id: number; x: number; y: number } | null = null;
  const activePointers = new Set<number>();
  let pointerSessionInvalidated = false;

  function updateNavigation(pageNumber: number): void {
    const counter = pageCounter(pageNumber, totalPages);
    currentPageElement.textContent = counter.current;
    totalPagesElement.textContent = counter.total;
    const boundary = pageBoundary(pageNumber, totalPages);
    previousControl.disabled = !boundary.canGoPrevious;
    previousControl.setAttribute(
      "aria-disabled",
      String(!boundary.canGoPrevious),
    );
    nextControl.disabled = !boundary.canGoNext;
    nextControl.setAttribute("aria-disabled", String(!boundary.canGoNext));
  }

  function preloadSuccessor(pageNumber: number): void {
    const successor = project.pdf.pages[pageNumber];
    if (successor) dependencies.preload(successor);
  }

  function markReady(pageNumber: number): void {
    currentPage = pageNumber;
    failedPage = null;
    root.dataset.readerState = "ready";
    root.classList.remove("is-rendering");
    root.classList.add("is-ready");
    errorRegion.hidden = true;
    const counter = pageCounter(pageNumber, totalPages);
    status.textContent = `Page ${counter.current} of ${counter.total}`;
    updateNavigation(pageNumber);
    preloadSuccessor(pageNumber);
  }

  function markError(): void {
    root.dataset.readerState = "error";
    root.classList.remove("is-rendering", "is-ready");
    errorRegion.hidden = false;
    status.textContent = "Project unavailable";
    updateNavigation(currentPage);
  }

  function initialize(): Promise<void> {
    if (destroyed) return Promise.resolve();
    if (initializationPromise) return initializationPromise;

    const initializationGeneration = ++generation;
    root.dataset.readerState = "loading";
    errorRegion.hidden = true;
    status.textContent = "Loading project";
    initializationPromise = dependencies
      .awaitVisibleImage(image)
      .then(() => {
        if (destroyed || initializationGeneration !== generation) return;
        initialized = true;
        markReady(1);
      })
      .catch((error: unknown) => {
        if (!destroyed && initializationGeneration === generation) {
          failedPage = 1;
          markError();
        }
        throw error;
      });
    return initializationPromise;
  }

  async function goTo(pageNumber: number): Promise<void> {
    if (destroyed) return;
    if (!initialized) await initialize();
    if (destroyed || !initialized) return;

    const targetPage = boundPage(pageNumber, totalPages);
    if (targetPage === currentPage && failedPage === null) return;
    const asset = project.pdf.pages[targetPage - 1];
    if (!asset) throw new Error(`Missing page asset ${targetPage}`);

    const navigationGeneration = ++generation;
    failedPage = targetPage;
    root.dataset.readerState = "rendering";
    root.classList.remove("is-ready");
    root.classList.add("is-rendering");
    errorRegion.hidden = true;
    status.textContent = `Loading page ${pageCounter(targetPage, totalPages).current}`;

    try {
      await dependencies.load(asset);
      if (destroyed || navigationGeneration !== generation) return;
      applyAsset(mobile, image, asset, project.pdf.title, totalPages);
      markReady(targetPage);
    } catch (error) {
      if (destroyed || navigationGeneration !== generation) return;
      markError();
      throw error;
    }
  }

  async function retry(): Promise<void> {
    if (destroyed) return;
    const targetPage = failedPage ?? currentPage;
    if (!initialized) {
      generation += 1;
      initializationPromise = null;
      failedPage = null;
      await initialize();
      return;
    }
    await goTo(targetPage);
  }

  function navigate(direction: "previous" | "next"): boolean {
    if (destroyed || !initialized) return false;
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
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (navigate(event.key === "ArrowLeft" ? "previous" : "next")) {
      event.preventDefault();
    }
  }

  function handlePointerDown(event: PointerEvent): void {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    if (activePointers.has(event.pointerId)) return;
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
    if (!activePointers.delete(event.pointerId)) return;
    const start = pointerStart;
    const canComplete =
      !pointerSessionInvalidated && start?.id === event.pointerId;
    if (activePointers.size === 0) {
      pointerSessionInvalidated = false;
      pointerStart = null;
    }
    if (!canComplete || !start) return;
    const direction = swipeDirection({
      deltaX: event.clientX - start.x,
      deltaY: event.clientY - start.y,
    });
    if (direction && navigate(direction)) event.preventDefault();
  }

  function clearPointer(event: PointerEvent): void {
    if (!activePointers.delete(event.pointerId)) return;
    if (pointerStart?.id === event.pointerId) pointerStart = null;
    if (activePointers.size === 0) {
      pointerSessionInvalidated = false;
      pointerStart = null;
    }
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    generation += 1;
    previousControl.removeEventListener("click", handlePreviousClick);
    nextControl.removeEventListener("click", handleNextClick);
    retryControl.removeEventListener("click", handleRetryClick);
    root.removeEventListener("keydown", handleKeydown);
    root.removeEventListener("pointerdown", handlePointerDown);
    root.removeEventListener("pointerup", handlePointerUp);
    root.removeEventListener("pointercancel", clearPointer);
    root.removeEventListener("lostpointercapture", clearPointer);
    activePointers.clear();
    pointerStart = null;
  }

  updateNavigation(1);
  previousControl.addEventListener("click", handlePreviousClick);
  nextControl.addEventListener("click", handleNextClick);
  retryControl.addEventListener("click", handleRetryClick);
  root.addEventListener("keydown", handleKeydown);
  root.addEventListener("pointerdown", handlePointerDown);
  root.addEventListener("pointerup", handlePointerUp);
  root.addEventListener("pointercancel", clearPointer);
  root.addEventListener("lostpointercapture", clearPointer);

  return { destroy, goTo, initialize, retry };
}

export function startProjectReaders(
  root: ParentNode,
  dependencies: ImageReaderDependencies,
): () => void {
  const readerRoots = Array.from(
    root.querySelectorAll<HTMLElement>("[data-project-reader]"),
  );
  const controllers = new Map<HTMLElement, ImageReader>();
  const initializationPromises = new Map<HTMLElement, Promise<void>>();
  let destroyed = false;

  readerRoots.forEach((readerRoot) => {
    controllers.set(readerRoot, createImageReader(readerRoot, dependencies));
  });

  function initialize(readerRoot: HTMLElement): Promise<void> {
    if (destroyed) return Promise.resolve();
    const existing = initializationPromises.get(readerRoot);
    if (existing) return existing;
    const controller = controllers.get(readerRoot);
    if (!controller) return Promise.resolve();
    const initialization = controller.initialize().catch(() => undefined);
    initializationPromises.set(readerRoot, initialization);
    return initialization;
  }

  const IntersectionObserverValue =
    dependencies.IntersectionObserver ?? globalThis.IntersectionObserver;
  const intersectionObserver = IntersectionObserverValue
    ? new IntersectionObserverValue(
        (entries) => {
          entries.forEach((entry) => {
            const readerRoot = entry.target as HTMLElement;
            if (!entry.isIntersecting || !controllers.has(readerRoot)) return;
            intersectionObserver?.unobserve(readerRoot);
            void initialize(readerRoot);
          });
        },
        { rootMargin: "600px 0px" },
      )
    : null;

  if (intersectionObserver) {
    readerRoots.forEach((readerRoot) => intersectionObserver.observe(readerRoot));
  } else {
    readerRoots.forEach((readerRoot) => void initialize(readerRoot));
  }

  function handleOpenProjectPage(event: Event): void {
    if (destroyed) return;
    const detail = readOpenProjectPageDetail(event);
    if (!detail) return;
    const readerRoot = readerRoots.find(
      (candidate) => candidate.dataset.projectId === detail.projectId,
    );
    const controller = readerRoot ? controllers.get(readerRoot) : undefined;
    if (!readerRoot || !controller) return;
    intersectionObserver?.unobserve(readerRoot);
    void initialize(readerRoot)
      .then(() => {
        if (!destroyed) return controller.goTo(detail.page);
      })
      .catch(() => undefined);
  }

  root.addEventListener(OPEN_PROJECT_PAGE_EVENT, handleOpenProjectPage);

  return () => {
    if (destroyed) return;
    destroyed = true;
    root.removeEventListener(OPEN_PROJECT_PAGE_EVENT, handleOpenProjectPage);
    intersectionObserver?.disconnect();
    controllers.forEach((controller) => controller.destroy());
    controllers.clear();
    initializationPromises.clear();
  };
}
