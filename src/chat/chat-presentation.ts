import type { ChatElements } from "./render-chat";
import {
  resolveDockPosition,
  type DockPosition,
  type DockSide,
} from "./particle-dock";

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
  const dragThreshold = 8;
  const dockMetrics = { edge: 16, top: 72, bottom: 24, radius: 38 };
  let destroyed = false;
  let scrollTimer: number | undefined;
  let dragStart: { x: number; y: number } | undefined;
  let dragging = false;
  let ignoreNextOrbClick = false;
  let dock: DockPosition | undefined;

  const reducedMotion = dependencies.window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  );

  const setDock = (next: DockPosition) => {
    dock = next;
    root.dataset.chatDock = next.side;
    root.style.setProperty("--chat-dock-x", `${Math.round(next.x)}px`);
    root.style.setProperty("--chat-dock-y", `${Math.round(next.y)}px`);
  };

  const clampDock = () => {
    const previous = dock?.side ?? (root.dataset.chatDock as DockSide | undefined);
    setDock(resolveDockPosition(
      { x: dock?.x ?? dependencies.window.innerWidth / 2, y: dock?.y ?? dependencies.window.innerHeight * 0.7 },
      { width: dependencies.window.innerWidth, height: dependencies.window.innerHeight },
      dockMetrics,
      previous,
    ));
  };

  const setExpanded = (expanded: boolean, focus = false) => {
    if (destroyed) return;
    root.dataset.chatPresentation = expanded ? "expanded" : "collapsed";
    orb.setAttribute("aria-expanded", String(expanded));
    panel.setAttribute("aria-hidden", String(!expanded));
    if (expanded && focus) {
      dependencies.window.requestAnimationFrame(() => elements.input.focus());
    }
  };

  const showGuide = () => {
    if (destroyed) return;
    root.dataset.chatPresentation = "guide";
    orb.setAttribute("aria-expanded", "false");
    panel.setAttribute("aria-hidden", "false");
  };

  const open = () => setExpanded(true, true);
  const close = () => setExpanded(false);
  const onOrbClick = () => {
    if (ignoreNextOrbClick) {
      ignoreNextOrbClick = false;
      return;
    }
    setExpanded(root.dataset.chatPresentation !== "expanded", true);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && root.dataset.chatPresentation === "expanded") {
      close();
      orb.focus();
    }
  };
  const onScroll = () => {
    if (dependencies.window.scrollY <= 8) {
      if (scrollTimer !== undefined) dependencies.window.clearTimeout(scrollTimer);
      scrollTimer = undefined;
      delete root.dataset.chatScrolling;
      showGuide();
      return;
    }
    root.dataset.chatScrolling = "true";
    close();
    if (scrollTimer !== undefined) dependencies.window.clearTimeout(scrollTimer);
    scrollTimer = dependencies.window.setTimeout(() => {
      delete root.dataset.chatScrolling;
      scrollTimer = undefined;
    }, idleMs);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    dragStart = { x: event.clientX, y: event.clientY };
    dragging = false;
    orb.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!dragStart) return;
    const moved = Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y);
    if (moved >= dragThreshold) dragging = true;
    if (!dragging) return;
    const side: DockSide = event.clientX < dependencies.window.innerWidth / 2 ? "left" : "right";
    setDock(resolveDockPosition(
      { x: event.clientX, y: event.clientY },
      { width: dependencies.window.innerWidth, height: dependencies.window.innerHeight },
      dockMetrics,
      side,
    ));
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!dragStart) return;
    const wasDragging = dragging;
    dragStart = undefined;
    dragging = false;
    if (wasDragging) {
      ignoreNextOrbClick = true;
      setDock(resolveDockPosition(
        { x: event.clientX, y: event.clientY },
        { width: dependencies.window.innerWidth, height: dependencies.window.innerHeight },
        dockMetrics,
        dock?.side,
      ));
    }
  };
  const onResize = () => clampDock();
  const updateMotionPreference = () => {
    root.dataset.chatMotion = reducedMotion?.matches ? "reduced" : "full";
  };
  const updateViewportInset = () => {
    const viewport = dependencies.window.visualViewport;
    const inset = viewport
      ? Math.max(0, dependencies.window.innerHeight - viewport.height - viewport.offsetTop)
      : 0;
    root.style.setProperty("--chat-viewport-inset", `${Math.round(inset)}px`);
  };

  orb.addEventListener("click", onOrbClick);
  orb.addEventListener("pointerdown", onPointerDown);
  orb.addEventListener("pointermove", onPointerMove);
  orb.addEventListener("pointerup", onPointerUp);
  collapse.addEventListener("click", close);
  dependencies.trigger.addEventListener("click", open);
  dependencies.window.addEventListener("scroll", onScroll, { passive: true });
  dependencies.window.addEventListener("resize", onResize, { passive: true });
  dependencies.window.addEventListener("orientationchange", onResize);
  document.addEventListener("keydown", onKeyDown);
  dependencies.window.visualViewport?.addEventListener("resize", updateViewportInset);
  dependencies.window.visualViewport?.addEventListener("scroll", updateViewportInset);
  reducedMotion?.addEventListener("change", updateMotionPreference);
  clampDock();
  updateMotionPreference();
  updateViewportInset();

  return () => {
    if (destroyed) return;
    destroyed = true;
    if (scrollTimer !== undefined) dependencies.window.clearTimeout(scrollTimer);
    orb.removeEventListener("click", onOrbClick);
    orb.removeEventListener("pointerdown", onPointerDown);
    orb.removeEventListener("pointermove", onPointerMove);
    orb.removeEventListener("pointerup", onPointerUp);
    collapse.removeEventListener("click", close);
    dependencies.trigger.removeEventListener("click", open);
    dependencies.window.removeEventListener("scroll", onScroll);
    dependencies.window.removeEventListener("resize", onResize);
    dependencies.window.removeEventListener("orientationchange", onResize);
    document.removeEventListener("keydown", onKeyDown);
    dependencies.window.visualViewport?.removeEventListener("resize", updateViewportInset);
    dependencies.window.visualViewport?.removeEventListener("scroll", updateViewportInset);
    reducedMotion?.removeEventListener("change", updateMotionPreference);
  };
}
