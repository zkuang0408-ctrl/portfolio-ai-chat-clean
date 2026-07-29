import type { ClientChatSource } from "./sse";

export const OPEN_PROJECT_PAGE_EVENT = "portfolio:open-project-page";

export interface OpenProjectPageDetail {
  readonly projectId: string;
  readonly page: number;
}

export interface SourceNavigationBrowser {
  readonly document: Document;
  readonly open: (
    url?: string | URL,
    target?: string,
    features?: string,
  ) => { opener: unknown } | null;
}

const PROJECT_PAGE_COUNTS: Readonly<Record<string, number>> = Object.freeze({
  inkseat: 18,
  emovue: 19,
  "evolution-fruit": 25,
  atempo: 20,
  urosense: 25,
  "first-fly": 28,
});

const PUBLIC_RESUME_URL =
  "/documents/zhao-shikuang-resume-public.pdf#page=1";

function scrollTo(root: ParentNode, selector: string): boolean {
  const target = root.querySelector<HTMLElement>(selector);
  if (!target) return false;
  target.scrollIntoView({ block: "start" });
  return true;
}

function isOwnerConfirmedProjectSource(
  source: ClientChatSource,
): source is ClientChatSource & { projectId: string } {
  return (
    typeof source.projectId === "string" &&
    Object.hasOwn(PROJECT_PAGE_COUNTS, source.projectId) &&
    source.sourceId === source.projectId
  );
}

function isPositiveIntegerPage(page: number | undefined): page is number {
  return Number.isInteger(page) && (page ?? 0) > 0;
}

export function navigateToSource(
  portfolioRoot: ParentNode,
  source: ClientChatSource,
  browser: SourceNavigationBrowser,
): void {
  if (isOwnerConfirmedProjectSource(source)) {
    if (source.page !== undefined && !isPositiveIntegerPage(source.page)) return;
    if (!scrollTo(portfolioRoot, `#project-${source.projectId}`)) return;
    if (source.page === undefined) return;
    const EventConstructor =
      browser.document.defaultView?.CustomEvent ?? CustomEvent;
    portfolioRoot.dispatchEvent(
      new EventConstructor<OpenProjectPageDetail>(OPEN_PROJECT_PAGE_EVENT, {
        detail: { projectId: source.projectId, page: source.page },
      }),
    );
    return;
  }

  if (
    source.sourceId === "profile" &&
    source.projectId === undefined &&
    (source.page === undefined || source.page === 1)
  ) {
    scrollTo(portfolioRoot, "#about");
    return;
  }

  if (
    source.sourceId === "resume" &&
    source.projectId === undefined &&
    (source.page === undefined || source.page === 1)
  ) {
    const popup = browser.open(
      PUBLIC_RESUME_URL,
      "_blank",
      "noopener,noreferrer",
    );
    if (popup) {
      try {
        popup.opener = null;
      } catch {
        // Some browsers expose a read-only opener; noopener still applies.
      }
    }
  }
}
