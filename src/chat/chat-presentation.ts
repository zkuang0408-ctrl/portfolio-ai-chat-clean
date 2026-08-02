import type { ChatElements } from "./render-chat";

export interface ChatPresentationDependencies {
  readonly trigger: HTMLButtonElement;
  readonly window: Window;
  readonly scrollIdleMs?: number;
}

export function startChatPresentation(
  elements: ChatElements,
  dependencies: ChatPresentationDependencies,
): () => void {
  const { root, orb, panel, collapse } = elements;
  const idleMs = dependencies.scrollIdleMs ?? 250;
  let destroyed = false;
  let scrollTimer: number | undefined;

  const setExpanded = (expanded: boolean, focus = false) => {
    if (destroyed) return;
    root.dataset.chatPresentation = expanded ? "expanded" : "collapsed";
    orb.setAttribute("aria-expanded", String(expanded));
    panel.setAttribute("aria-hidden", String(!expanded));
    if (expanded && focus) {
      dependencies.window.requestAnimationFrame(() => elements.input.focus());
    }
  };

  const open = () => setExpanded(true, true);
  const close = () => setExpanded(false);
  const onOrbClick = () => {
    setExpanded(root.dataset.chatPresentation !== "expanded", true);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && root.dataset.chatPresentation === "expanded") {
      close();
      orb.focus();
    }
  };
  const onScroll = () => {
    root.dataset.chatScrolling = "true";
    close();
    if (scrollTimer !== undefined) dependencies.window.clearTimeout(scrollTimer);
    scrollTimer = dependencies.window.setTimeout(() => {
      delete root.dataset.chatScrolling;
      scrollTimer = undefined;
    }, idleMs);
  };
  const updateViewportInset = () => {
    const viewport = dependencies.window.visualViewport;
    const inset = viewport
      ? Math.max(0, dependencies.window.innerHeight - viewport.height - viewport.offsetTop)
      : 0;
    root.style.setProperty("--chat-viewport-inset", `${Math.round(inset)}px`);
  };

  orb.addEventListener("click", onOrbClick);
  collapse.addEventListener("click", close);
  dependencies.trigger.addEventListener("click", open);
  dependencies.window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("keydown", onKeyDown);
  dependencies.window.visualViewport?.addEventListener("resize", updateViewportInset);
  dependencies.window.visualViewport?.addEventListener("scroll", updateViewportInset);
  updateViewportInset();

  return () => {
    if (destroyed) return;
    destroyed = true;
    if (scrollTimer !== undefined) dependencies.window.clearTimeout(scrollTimer);
    orb.removeEventListener("click", onOrbClick);
    collapse.removeEventListener("click", close);
    dependencies.trigger.removeEventListener("click", open);
    dependencies.window.removeEventListener("scroll", onScroll);
    document.removeEventListener("keydown", onKeyDown);
    dependencies.window.visualViewport?.removeEventListener("resize", updateViewportInset);
    dependencies.window.visualViewport?.removeEventListener("scroll", updateViewportInset);
  };
}
