interface IntersectionObserverLike {
  observe(target: Element): void;
  disconnect(): void;
}

export interface ProjectSelectorObserverConstructor {
  new (
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ): IntersectionObserverLike;
}

export interface ProjectSelectorDependencies {
  readonly scrollIntoView: (target: HTMLElement) => void;
  readonly IntersectionObserver?: ProjectSelectorObserverConstructor;
}

export function startProjectSelector(
  root: HTMLElement,
  overrides: Partial<ProjectSelectorDependencies> = {},
): () => void {
  const selectors = Array.from(
    root.querySelectorAll<HTMLElement>("[data-project-selector]"),
  );
  const chapters = Array.from(
    root.querySelectorAll<HTMLElement>("[data-project-chapter]"),
  );
  const chapterById = new Map(
    chapters.map((chapter) => [chapter.dataset.projectChapter, chapter]),
  );
  let destroyed = false;

  const setActive = (projectId: string): void => {
    selectors.forEach((selector) => {
      if (selector.dataset.projectSelector === projectId) {
        selector.setAttribute("aria-current", "true");
      } else {
        selector.removeAttribute("aria-current");
      }
    });
  };

  const scrollIntoView =
    overrides.scrollIntoView ??
    ((target: HTMLElement) =>
      target.scrollIntoView({ behavior: "smooth", block: "start" }));

  const listeners = selectors.map((selector) => {
    const listener = (event: Event): void => {
      event.preventDefault();
      const projectId = selector.dataset.projectSelector;
      const chapter = projectId ? chapterById.get(projectId) : undefined;
      if (!projectId || !chapter || destroyed) return;
      setActive(projectId);
      scrollIntoView(chapter);
    };
    selector.addEventListener("click", listener);
    return { selector, listener };
  });

  const Observer = overrides.IntersectionObserver ?? globalThis.IntersectionObserver;
  const observer = Observer
    ? new Observer(
        (entries) => {
          if (destroyed) return;
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
          const projectId = (visible?.target as HTMLElement | undefined)?.dataset
            .projectChapter;
          if (projectId) setActive(projectId);
        },
        { rootMargin: "-32% 0px -46%", threshold: [0.2, 0.5, 0.75] },
      )
    : undefined;

  chapters.forEach((chapter) => observer?.observe(chapter));
  const initial = selectors[0]?.dataset.projectSelector;
  if (initial) setActive(initial);

  return () => {
    if (destroyed) return;
    destroyed = true;
    observer?.disconnect();
    listeners.forEach(({ selector, listener }) =>
      selector.removeEventListener("click", listener),
    );
  };
}
