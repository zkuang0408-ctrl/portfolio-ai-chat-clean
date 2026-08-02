export interface NavigationElements {
  readonly root: HTMLElement;
  readonly openChat: HTMLButtonElement;
}

export function renderNavigation(host: HTMLElement): NavigationElements {
  host.insertAdjacentHTML(
    "afterbegin",
    `
      <header class="site-nav" data-site-nav>
        <a class="site-nav__brand" data-site-brand href="#top">赵实旷</a>
        <nav aria-label="主要栏目">
          <a href="#resume">简介</a>
          <a href="#projects">作品</a>
          <a href="#contact">联系</a>
          <button type="button" data-open-chat aria-controls="portfolio-chat">Ask AI</button>
        </nav>
      </header>
    `,
  );

  const root = host.querySelector<HTMLElement>("[data-site-nav]");
  const openChat = host.querySelector<HTMLButtonElement>("[data-open-chat]");

  if (!root || !openChat) {
    throw new Error("Navigation markup is incomplete.");
  }

  return { root, openChat };
}
