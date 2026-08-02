export interface SectionStateDependencies {
  readonly IntersectionObserver: typeof IntersectionObserver;
}

export function startSectionState(
  navigation: HTMLElement,
  content: ParentNode,
  dependencies: SectionStateDependencies = { IntersectionObserver },
): () => void {
  const links = Array.from(
    navigation.querySelectorAll<HTMLAnchorElement>('nav a[href^="#"]'),
  );
  const sectionByLink = new Map<HTMLAnchorElement, Element>();
  const ratios = new Map<Element, number>();

  for (const link of links) {
    const id = decodeURIComponent(link.hash.slice(1));
    const section = content.querySelector(`[id="${id}"]`);
    if (section) sectionByLink.set(link, section);
  }

  const activate = (active: HTMLAnchorElement) => {
    for (const link of links) {
      if (link === active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  };

  const observer = new dependencies.IntersectionObserver(
    (entries) => {
      for (const item of entries) {
        ratios.set(item.target, item.isIntersecting ? item.intersectionRatio : 0);
      }
      let best: HTMLAnchorElement | undefined;
      let bestRatio = 0;
      for (const [link, section] of sectionByLink) {
        const ratio = ratios.get(section) ?? 0;
        if (ratio > bestRatio) {
          best = link;
          bestRatio = ratio;
        }
      }
      if (best) activate(best);
    },
    {
      rootMargin: "-24% 0px -48% 0px",
      threshold: [0.08, 0.2, 0.4, 0.65],
    },
  );

  for (const section of sectionByLink.values()) observer.observe(section);

  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (target instanceof HTMLAnchorElement && sectionByLink.has(target)) {
      activate(target);
    }
  };
  navigation.addEventListener("click", onClick);

  return () => {
    observer.disconnect();
    navigation.removeEventListener("click", onClick);
  };
}
