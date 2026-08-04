import { projects } from "../content/portfolio";
import { OPEN_PROJECT_PAGE_EVENT } from "../chat/source-navigation";
import { dispatchProjectActivation } from "./project-activation";

export interface ReaderRoute {
  readonly projectId: string;
  readonly page: number;
}

interface ReaderHistoryState extends ReaderRoute {
  readonly sourceScrollY: number;
}

interface HistoryLike {
  pushState(data: unknown, unused: string, url?: string | URL | null): void;
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
  back(): void;
}

interface LocationLike {
  hash: string;
  pathname: string;
  search: string;
}

export interface ReaderRoutingDependencies {
  readonly viewport: EventTarget;
  readonly history: HistoryLike;
  readonly location: LocationLike;
  readonly getScrollY: () => number;
  readonly scrollTo: (top: number) => void;
  readonly setScrollLocked: (locked: boolean) => void;
}

function knownProject(projectId: string) {
  return projects.find((project) => project.id === projectId);
}

export function parseReaderLocation(hash: string): ReaderRoute | undefined {
  const match = /^#reader\/([^/]+)\/(\d+)$/.exec(hash);
  if (!match) return undefined;
  const projectId = match[1];
  const page = Number(match[2]);
  if (!projectId || !Number.isSafeInteger(page) || page <= 0) return undefined;
  const project = knownProject(projectId);
  if (!project || page > project.pdf.pageCount) return undefined;
  return { projectId, page };
}

export function readerLocation(route: ReaderRoute): string {
  return `#reader/${route.projectId}/${String(route.page).padStart(2, "0")}`;
}

function eventDetail(event: Event): ReaderRoute | undefined {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return undefined;
  const record = detail as Record<string, unknown>;
  if (typeof record.projectId !== "string" || !Number.isSafeInteger(record.page)) {
    return undefined;
  }
  return parseReaderLocation(readerLocation({
    projectId: record.projectId,
    page: record.page as number,
  }));
}

export function startReaderRouting(
  root: HTMLElement,
  overrides: Partial<ReaderRoutingDependencies> = {},
): () => void {
  const ownerDocument = root.ownerDocument;
  const dependencies: ReaderRoutingDependencies = {
    viewport: overrides.viewport ?? window,
    history: overrides.history ?? window.history,
    location: overrides.location ?? window.location,
    getScrollY: overrides.getScrollY ?? (() => window.scrollY),
    scrollTo: overrides.scrollTo ?? ((top) => window.scrollTo({ top, behavior: "auto" })),
    setScrollLocked:
      overrides.setScrollLocked ??
      ((locked) => ownerDocument.body.classList.toggle("reader-scroll-locked", locked)),
  };
  let active: ReaderHistoryState | undefined;
  let opener: HTMLElement | undefined;
  let destroyed = false;

  const readerFor = (projectId: string): HTMLElement | undefined =>
    Array.from(root.querySelectorAll<HTMLElement>("[data-project-reader]")).find(
      (reader) => reader.dataset.projectId === projectId,
    );

  const closePresentation = (): void => {
    if (!active) return;
    const sourceScrollY = active.sourceScrollY;
    readerFor(active.projectId)?.classList.remove("is-fullscreen");
    root.removeAttribute("data-reader-open");
    dependencies.setScrollLocked(false);
    active = undefined;
    dependencies.scrollTo(sourceScrollY);
    opener?.focus({ preventScroll: true });
    opener = undefined;
  };

  const openPresentation = (
    route: ReaderRoute,
    options: { push: boolean; sourceScrollY?: number } = { push: true },
  ): void => {
    const reader = readerFor(route.projectId);
    if (!reader || destroyed) return;
    dispatchProjectActivation(root, route.projectId);
    if (active && active.projectId !== route.projectId) {
      readerFor(active.projectId)?.classList.remove("is-fullscreen");
    }
    const sourceScrollY = options.sourceScrollY ?? dependencies.getScrollY();
    active = { ...route, sourceScrollY };
    reader.classList.add("is-fullscreen");
    root.dataset.readerOpen = route.projectId;
    dependencies.setScrollLocked(true);
    if (options.push) {
      dependencies.history.pushState(active, "", readerLocation(route));
    }
    root.dispatchEvent(
      new CustomEvent(OPEN_PROJECT_PAGE_EVENT, {
        bubbles: true,
        detail: route,
      }),
    );
    reader.focus({ preventScroll: true });
  };

  const handleClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const open = target.closest<HTMLElement>("[data-open-reader]");
    if (open) {
      const reader = open.closest<HTMLElement>("[data-project-reader]");
      const projectId = reader?.dataset.projectId;
      if (!projectId || !knownProject(projectId)) return;
      event.preventDefault();
      opener = open;
      openPresentation({ projectId, page: 1 });
      return;
    }
    if (target.closest("[data-close-reader]") && active) {
      event.preventDefault();
      dependencies.history.back();
    }
  };

  const handlePageChange = (event: Event): void => {
    const route = eventDetail(event);
    if (!active || !route || route.projectId !== active.projectId) return;
    active = { ...active, page: route.page };
    dependencies.history.replaceState(active, "", readerLocation(route));
  };

  const handlePopState = (): void => {
    const route = parseReaderLocation(dependencies.location.hash);
    if (!route) {
      closePresentation();
      return;
    }
    openPresentation(route, {
      push: false,
      sourceScrollY: active?.sourceScrollY ?? dependencies.getScrollY(),
    });
  };

  const handleKeyDown = (event: Event): void => {
    if ((event as KeyboardEvent).key === "Escape" && active) {
      dependencies.history.back();
    }
  };

  root.addEventListener("click", handleClick);
  root.addEventListener("portfolio:reader-page-change", handlePageChange);
  dependencies.viewport.addEventListener("popstate", handlePopState);
  dependencies.viewport.addEventListener("keydown", handleKeyDown);

  const initialRoute = parseReaderLocation(dependencies.location.hash);
  if (initialRoute) openPresentation(initialRoute, { push: false, sourceScrollY: 0 });

  return () => {
    if (destroyed) return;
    destroyed = true;
    closePresentation();
    root.removeEventListener("click", handleClick);
    root.removeEventListener("portfolio:reader-page-change", handlePageChange);
    dependencies.viewport.removeEventListener("popstate", handlePopState);
    dependencies.viewport.removeEventListener("keydown", handleKeyDown);
  };
}
