import {
  ACTIVATE_PROJECT_EVENT,
  readProjectActivation,
} from "./project-activation";

type ProjectDirection = "forward" | "backward";

export function startProjectSelector(root: HTMLElement): () => void {
  const selectors = Array.from(
    root.querySelectorAll<HTMLElement>("[data-project-selector]"),
  );
  const chapters = Array.from(
    root.querySelectorAll<HTMLElement>("[data-project-chapter]"),
  );
  const chapterById = new Map<string, HTMLElement>();
  for (const chapter of chapters) {
    const projectId = chapter.dataset.projectChapter;
    if (projectId && !chapterById.has(projectId)) {
      chapterById.set(projectId, chapter);
    }
  }
  const projectOrder = selectors.reduce<string[]>((order, selector) => {
    const projectId = selector.dataset.projectSelector;
    if (
      projectId &&
      chapterById.has(projectId) &&
      !order.includes(projectId)
    ) {
      order.push(projectId);
    }
    return order;
  }, []);
  let activeProjectId: string | undefined;
  let destroyed = false;

  const activate = (
    projectId: string,
    direction?: ProjectDirection,
  ): boolean => {
    const incoming = chapterById.get(projectId);
    if (!incoming || destroyed || projectId === activeProjectId) return false;

    selectors.forEach((selector) => {
      if (selector.dataset.projectSelector === projectId) {
        selector.setAttribute("aria-current", "true");
      } else {
        selector.removeAttribute("aria-current");
      }
    });
    chapters.forEach((chapter) => {
      chapter.removeAttribute("data-project-transition");
      if (chapter === incoming) {
        chapter.hidden = false;
        chapter.removeAttribute("aria-hidden");
      } else {
        chapter.hidden = true;
        chapter.setAttribute("aria-hidden", "true");
      }
    });
    if (direction) incoming.dataset.projectTransition = direction;
    activeProjectId = projectId;
    return true;
  };

  const selectorListeners = selectors.map((selector) => {
    const listener = (event: Event): void => {
      const projectId = selector.dataset.projectSelector;
      const nextIndex = projectId ? projectOrder.indexOf(projectId) : -1;
      const activeIndex = activeProjectId
        ? projectOrder.indexOf(activeProjectId)
        : -1;
      if (!projectId || nextIndex < 0 || activeIndex < 0 || destroyed) return;
      event.preventDefault();
      activate(projectId, nextIndex > activeIndex ? "forward" : "backward");
    };
    selector.addEventListener("click", listener);
    return { selector, listener };
  });

  const animationListeners = chapters.map((chapter) => {
    const listener = (event: Event): void => {
      if (event.target === chapter) {
        chapter.removeAttribute("data-project-transition");
      }
    };
    chapter.addEventListener("animationend", listener);
    return { chapter, listener };
  });

  const handleExternalActivation = (event: Event): void => {
    const detail = readProjectActivation(event);
    if (detail) activate(detail.projectId);
  };
  root.addEventListener(ACTIVATE_PROJECT_EVENT, handleExternalActivation);

  const initialProjectId = projectOrder[0];
  if (initialProjectId) activate(initialProjectId);

  return () => {
    if (destroyed) return;
    destroyed = true;
    selectorListeners.forEach(({ selector, listener }) =>
      selector.removeEventListener("click", listener),
    );
    animationListeners.forEach(({ chapter, listener }) =>
      chapter.removeEventListener("animationend", listener),
    );
    root.removeEventListener(ACTIVATE_PROJECT_EVENT, handleExternalActivation);
  };
}
