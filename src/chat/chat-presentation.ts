import type { ChatElements } from "./render-chat";
import {
  clampDockY,
  resolveDockPosition,
  type DockPosition,
  type DockSide,
} from "./particle-dock";
import {
  isMobileKeyboardActive,
  resolveMobileChatViewport,
  shouldRestoreKeyboardScroll,
} from "./mobile-keyboard-viewport";

export interface ChatPresentationDependencies {
  readonly trigger: HTMLButtonElement;
  readonly window: Window;
  readonly scrollIdleMs?: number;
  readonly collapseDurationMs?: number;
}

export function startChatPresentation(
  elements: ChatElements,
  dependencies: ChatPresentationDependencies,
): () => void {
  const { root, orb, panel, collapse } = elements;
  const idleMs = dependencies.scrollIdleMs ?? 250;
  const collapseMs = dependencies.collapseDurationMs ?? 380;
  const mobileExpandMs = 320;
  const mobileCollapseMs = 260;
  const collapseScrollThreshold = 160;
  const defaultDockY = 172;
  const pointerDragThreshold = 8;
  const touchDragThreshold = 12;
  const dockMetrics = () => ({
    edge: 16,
    top: 72,
    bottom: 24,
    radius: dependencies.window.innerWidth <= 760 ? 28 : 38,
  });
  const desktopPanelTop = 88;
  const desktopPanelLift = 72;
  let destroyed = false;
  let scrollTimer: number | undefined;
  let collapseTimer: number | undefined;
  let transitionTimer: number | undefined;
  let expandFrame: number | undefined;
  let avoidTimer: number | undefined;
  let viewportFrame: number | undefined;
  let keyboardSettleTimer: number | undefined;
  let dragStart: { x: number; y: number } | undefined;
  let dragOffset: { x: number; y: number } | undefined;
  let activePointerId: number | null = null;
  let activePointerType = "mouse";
  let dragging = false;
  let ignoreNextOrbClick = false;
  let dock: DockPosition | undefined;
  let collapseScrollAnchorY = dependencies.window.scrollY;
  let keyboardActive = false;
  let keyboardSettling = false;
  let keyboardAnchorY: number | undefined;
  let keyboardTravel = 0;

  const reducedMotion = dependencies.window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  );

  const viewportSize = () => ({
    width: root.ownerDocument.documentElement.clientWidth || dependencies.window.innerWidth,
    height: dependencies.window.innerHeight,
  });

  const setDock = (next: DockPosition) => {
    dock = next;
    root.dataset.chatDock = next.side;
    root.style.setProperty("--chat-dock-x", `${Math.round(next.x)}px`);
    root.style.setProperty("--chat-dock-y", `${Math.round(next.y)}px`);
  };

  const setFreePosition = (x: number, y: number) => {
    const viewport = viewportSize();
    const metrics = dockMetrics();
    const minX = metrics.edge + metrics.radius;
    const maxX = Math.max(
      minX,
      viewport.width - metrics.edge - metrics.radius,
    );
    const nextX = Math.min(Math.max(x, minX), maxX);
    const nextY = clampDockY(y, viewport, metrics);
    dock = {
      x: nextX,
      y: nextY,
      side: dock?.side ?? (nextX < viewport.width / 2 ? "left" : "right"),
    };
    root.style.setProperty("--chat-dock-x", `${Math.round(nextX)}px`);
    root.style.setProperty("--chat-dock-y", `${Math.round(nextY)}px`);
  };

  const clampDock = () => {
    const viewport = viewportSize();
    const metrics = dockMetrics();
    const previous = dock?.side
      ?? (root.dataset.chatDock as DockSide | undefined)
      ?? "left";
    setDock(resolveDockPosition(
      { x: dock?.x ?? viewport.width / 2, y: dock?.y ?? defaultDockY },
      viewport,
      metrics,
      previous,
    ));
  };

  const prepareExpandedDock = () => {
    if (!dock || panel.offsetHeight <= 0) return;
    const viewport = viewportSize();
    const metrics = dockMetrics();
    const minimumY = desktopPanelTop + desktopPanelLift + panel.offsetHeight / 2;
    const nextY = clampDockY(Math.max(dock.y, minimumY), viewport, metrics);
    if (Math.abs(nextY - dock.y) > 0.5) setDock({ ...dock, y: nextY });
  };

  const avoidHeroContent = () => {
    if (dependencies.window.innerWidth <= 760 || root.dataset.chatPresentation !== "expanded" || !dock) {
      return;
    }
    const viewport = viewportSize();
    const metrics = dockMetrics();
    const panelBounds = panel.getBoundingClientRect();
    if (panelBounds.width <= 0 || panelBounds.height <= 0) return;
    const protectedRects = [".hero-index", ".hero-copy .headline", ".hero-supporting"]
      .flatMap((selector) => Array.from(root.ownerDocument.querySelectorAll<HTMLElement>(selector)))
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const minTop = desktopPanelTop;
    const maxBottom = viewport.height - 24;
    const baseY = dock.y;
    const candidates = [
      baseY,
      baseY + minTop - panelBounds.top,
      baseY + maxBottom - panelBounds.bottom,
      ...protectedRects.flatMap((rect) => [
        baseY - (panelBounds.bottom - rect.top + 24),
        baseY + (rect.bottom - panelBounds.top + 24),
      ]),
    ].map((candidate) => clampDockY(candidate, viewport, metrics));
    const score = (candidate: number) => {
      const delta = candidate - baseY;
      const top = panelBounds.top + delta;
      const bottom = panelBounds.bottom + delta;
      let total = Math.abs(delta) * 0.01;
      if (top < minTop) total += (minTop - top) * 1000;
      if (bottom > maxBottom) total += (bottom - maxBottom) * 1000;
      for (const rect of protectedRects) {
        const horizontal = panelBounds.left < rect.right && panelBounds.right > rect.left;
        const vertical = top < rect.bottom && bottom > rect.top;
        if (horizontal && vertical) {
          total += Math.max(0, Math.min(bottom, rect.bottom) - Math.max(top, rect.top)) * 1000;
        }
      }
      return total;
    };
    const bestY = candidates.reduce((best, candidate) =>
      score(candidate) < score(best) ? candidate : best,
    baseY);
    if (Math.abs(bestY - baseY) > 0.5) {
      setDock({ ...dock, y: bestY });
    }
  };

  const clearCollapseTimer = () => {
    if (collapseTimer === undefined) return;
    dependencies.window.clearTimeout(collapseTimer);
    collapseTimer = undefined;
  };

  const clearTransitionTimer = () => {
    if (transitionTimer === undefined) return;
    dependencies.window.clearTimeout(transitionTimer);
    transitionTimer = undefined;
  };

  const clearPresentationTransition = () => {
    clearTransitionTimer();
    delete root.dataset.chatTransition;
  };

  const clearExpandFrame = () => {
    if (expandFrame === undefined) return;
    dependencies.window.cancelAnimationFrame(expandFrame);
    expandFrame = undefined;
  };

  const clearAvoidTimer = () => {
    if (avoidTimer === undefined) return;
    dependencies.window.clearTimeout(avoidTimer);
    avoidTimer = undefined;
  };

  const clearViewportFrame = () => {
    if (viewportFrame === undefined) return;
    dependencies.window.cancelAnimationFrame(viewportFrame);
    viewportFrame = undefined;
  };

  const clearKeyboardSettleTimer = () => {
    if (keyboardSettleTimer === undefined) return;
    dependencies.window.clearTimeout(keyboardSettleTimer);
    keyboardSettleTimer = undefined;
  };

  const scheduleHeroAvoidance = () => {
    clearAvoidTimer();
    dependencies.window.requestAnimationFrame(() => {
      avoidHeroContent();
      dependencies.window.requestAnimationFrame(avoidHeroContent);
      avoidTimer = dependencies.window.setTimeout(() => {
        avoidTimer = undefined;
        avoidHeroContent();
      }, 320);
    });
  };

  const finishCollapse = () => {
    clearCollapseTimer();
    clearPresentationTransition();
    root.dataset.chatPresentation = "collapsed";
    panel.style.removeProperty("--chat-panel-shift-x");
    panel.style.removeProperty("--chat-panel-shift-y");
  };

  const finishMobileOpening = (focus: boolean) => {
    transitionTimer = undefined;
    if (destroyed || root.dataset.chatTransition !== "opening") return;
    delete root.dataset.chatTransition;
    if (focus) elements.input.focus();
  };

  const finishExpand = (focus: boolean) => {
    expandFrame = undefined;
    if (destroyed || root.dataset.chatPresentation !== "expanding") return;
    root.dataset.chatPresentation = "expanded";
    collapseScrollAnchorY = dependencies.window.scrollY;
    scheduleHeroAvoidance();
    if (root.dataset.chatTransition === "opening") {
      transitionTimer = dependencies.window.setTimeout(
        () => finishMobileOpening(focus),
        mobileExpandMs,
      );
    } else if (focus) {
      dependencies.window.requestAnimationFrame(() => elements.input.focus());
    }
  };

  const setMobilePanelOrigin = (orbBounds: DOMRect) => {
    root.dataset.chatPresentation = "expanded";
    const panelBounds = panel.getBoundingClientRect();
    panel.style.setProperty("--chat-panel-shift-x", `${Math.round(
      orbBounds.left + orbBounds.width / 2
        - panelBounds.left - panelBounds.width / 2,
    )}px`);
    panel.style.setProperty("--chat-panel-shift-y", `${Math.round(
      orbBounds.top + orbBounds.height / 2
        - panelBounds.top - panelBounds.height / 2,
    )}px`);
    root.dataset.chatPresentation = "expanding";
  };

  const setExpanded = (expanded: boolean, focus = false) => {
    if (destroyed) return;
    if (!expanded && panel.contains(root.ownerDocument.activeElement)) {
      orb.focus();
    }
    orb.setAttribute("aria-expanded", String(expanded));
    panel.setAttribute("aria-hidden", String(!expanded));
    if (!expanded) {
      clearExpandFrame();
      clearTransitionTimer();
      if (
        root.dataset.chatPresentation === "collapsed"
        || root.dataset.chatPresentation === "collapsing"
      ) {
        return;
      }
      const canAnimate = !reducedMotion?.matches
        && collapseMs > 0;
      if (!canAnimate) {
        finishCollapse();
        return;
      }
      clearCollapseTimer();
      if (dependencies.window.innerWidth <= 760) {
        root.dataset.chatTransition = "closing";
      }
      root.dataset.chatPresentation = "collapsing";
      collapseTimer = dependencies.window.setTimeout(
        finishCollapse,
        dependencies.window.innerWidth <= 760 ? mobileCollapseMs : collapseMs,
      );
      return;
    }
    clearCollapseTimer();
    clearExpandFrame();
    clearPresentationTransition();
    const fromDock = root.dataset.chatPresentation === "collapsed"
      || root.dataset.chatPresentation === "collapsing";
    const canAnimate = fromDock
      && !reducedMotion?.matches;
    if (canAnimate) {
      if (dependencies.window.innerWidth <= 760) {
        const orbBounds = orb.getBoundingClientRect();
        root.dataset.chatTransition = "opening";
        setMobilePanelOrigin(orbBounds);
      } else {
        root.dataset.chatPresentation = "expanding";
        prepareExpandedDock();
      }
      expandFrame = dependencies.window.requestAnimationFrame(() => finishExpand(focus));
      return;
    }
    root.dataset.chatPresentation = "expanded";
    collapseScrollAnchorY = dependencies.window.scrollY;
    scheduleHeroAvoidance();
    if (focus) dependencies.window.requestAnimationFrame(() => elements.input.focus());
  };

  const showGuide = () => {
    if (destroyed) return;
    clearCollapseTimer();
    clearExpandFrame();
    clearPresentationTransition();
    root.dataset.chatPresentation = "guide";
    collapseScrollAnchorY = dependencies.window.scrollY;
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
    if (
      root.dataset.chatTransition
      || root.ownerDocument.activeElement === elements.input
      || keyboardActive
      || keyboardSettling
    ) return;
    if (dependencies.window.scrollY <= 8) {
      if (scrollTimer !== undefined) dependencies.window.clearTimeout(scrollTimer);
      scrollTimer = undefined;
      delete root.dataset.chatScrolling;
      showGuide();
      return;
    }
    const distance = Math.abs(dependencies.window.scrollY - collapseScrollAnchorY);
    if (distance < collapseScrollThreshold) return;
    root.dataset.chatScrolling = "true";
    close();
    if (scrollTimer !== undefined) dependencies.window.clearTimeout(scrollTimer);
    scrollTimer = dependencies.window.setTimeout(() => {
      delete root.dataset.chatScrolling;
      scrollTimer = undefined;
    }, idleMs);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || activePointerId !== null) return;
    activePointerId = event.pointerId ?? 0;
    activePointerType = event.pointerType || "mouse";
    dragStart = { x: event.clientX, y: event.clientY };
    const viewport = viewportSize();
    const currentX = dock?.x ?? viewport.width / 2;
    const currentY = dock?.y ?? viewport.height * 0.7;
    dragOffset = {
      x: event.clientX - currentX,
      y: event.clientY - currentY,
    };
    dragging = false;
    orb.setPointerCapture?.(activePointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (activePointerId !== (event.pointerId ?? 0) || !dragStart) return;
    const moved = Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y);
    const crossedDragThreshold = activePointerType === "touch"
      ? moved > touchDragThreshold
      : moved >= pointerDragThreshold;
    if (crossedDragThreshold && !dragging) {
      dragging = true;
      root.dataset.chatDragging = "true";
    }
    if (!dragging) return;
    setFreePosition(
      event.clientX - (dragOffset?.x ?? 0),
      event.clientY - (dragOffset?.y ?? 0),
    );
  };
  const finishPointer = (event: PointerEvent, suppressClick: boolean) => {
    if (activePointerId !== (event.pointerId ?? 0) || !dragStart) return;
    const pointerId = activePointerId;
    const wasDragging = dragging;
    activePointerId = null;
    activePointerType = "mouse";
    dragStart = undefined;
    dragOffset = undefined;
    dragging = false;
    if (wasDragging) {
      ignoreNextOrbClick = suppressClick;
      delete root.dataset.chatDragging;
      const metrics = dockMetrics();
      setDock(resolveDockPosition(
        { x: dock?.x ?? event.clientX, y: dock?.y ?? event.clientY },
        viewportSize(),
        metrics,
        dock?.side,
      ));
    }
    orb.releasePointerCapture?.(pointerId);
  };
  const onPointerUp = (event: PointerEvent) => finishPointer(event, true);
  const onPointerCancel = (event: PointerEvent) => finishPointer(event, false);
  const onResize = () => {
    clampDock();
    if (root.dataset.chatPresentation === "expanded") {
      scheduleHeroAvoidance();
    }
  };
  const updateMotionPreference = () => {
    root.dataset.chatMotion = reducedMotion?.matches ? "reduced" : "full";
  };

  const finishKeyboardSettle = () => {
    keyboardSettleTimer = undefined;
    if (destroyed) return;
    if (
      keyboardAnchorY !== undefined
      && shouldRestoreKeyboardScroll({
        anchorY: keyboardAnchorY,
        currentY: dependencies.window.scrollY,
        keyboardTravel,
      })
    ) {
      dependencies.window.scrollTo({
        top: keyboardAnchorY,
        behavior: reducedMotion?.matches ? "auto" : "smooth",
      });
    }
    keyboardAnchorY = undefined;
    keyboardTravel = 0;
    keyboardSettling = false;
  };

  const updateViewport = () => {
    const viewport = dependencies.window.visualViewport;
    const inset = viewport
      ? Math.max(0, dependencies.window.innerHeight - viewport.height - viewport.offsetTop)
      : 0;
    root.style.setProperty("--chat-viewport-inset", `${Math.round(inset)}px`);
    const nextKeyboardActive = viewport !== null && viewport !== undefined
      && isMobileKeyboardActive({
        mobile: dependencies.window.innerWidth <= 760,
        inputFocused: root.ownerDocument.activeElement === elements.input,
        layoutHeight: dependencies.window.innerHeight,
        visualHeight: viewport.height,
      });
    if (nextKeyboardActive && viewport) {
      clearKeyboardSettleTimer();
      keyboardSettling = false;
      keyboardAnchorY ??= dependencies.window.scrollY;
      keyboardTravel = Math.max(
        keyboardTravel,
        dependencies.window.innerHeight - viewport.height,
      );
      const geometry = resolveMobileChatViewport({
        layoutHeight: dependencies.window.innerHeight,
        visualHeight: viewport.height,
        visualOffsetTop: viewport.offsetTop,
        navigationBottom: 58,
        safeGap: 12,
      });
      root.dataset.chatKeyboard = "active";
      root.style.setProperty("--chat-visual-top", `${Math.round(geometry.top)}px`);
      root.style.setProperty("--chat-visual-bottom", `${Math.round(geometry.bottomInset)}px`);
      root.style.setProperty("--chat-visual-height", `${Math.round(geometry.availableHeight)}px`);
    } else {
      delete root.dataset.chatKeyboard;
      root.style.removeProperty("--chat-visual-top");
      root.style.removeProperty("--chat-visual-bottom");
      root.style.removeProperty("--chat-visual-height");
      if (keyboardActive) {
        clearKeyboardSettleTimer();
        keyboardSettling = true;
        keyboardSettleTimer = dependencies.window.setTimeout(finishKeyboardSettle, 160);
      }
    }
    keyboardActive = nextKeyboardActive;
  };

  const scheduleViewportUpdate = () => {
    if (
      root.ownerDocument.activeElement !== elements.input
      && !keyboardActive
      && !keyboardSettling
    ) {
      updateViewport();
      return;
    }
    if (viewportFrame !== undefined) return;
    let completedSynchronously = false;
    const frame = dependencies.window.requestAnimationFrame(() => {
      completedSynchronously = true;
      viewportFrame = undefined;
      updateViewport();
    });
    if (!completedSynchronously) viewportFrame = frame;
  };

  const onInputFocus = () => {
    if (dependencies.window.innerWidth <= 760) {
      keyboardAnchorY ??= dependencies.window.scrollY;
    }
    scheduleViewportUpdate();
  };

  orb.addEventListener("click", onOrbClick);
  orb.addEventListener("pointerdown", onPointerDown);
  orb.addEventListener("pointermove", onPointerMove);
  orb.addEventListener("pointerup", onPointerUp);
  orb.addEventListener("pointercancel", onPointerCancel);
  collapse.addEventListener("click", close);
  elements.mobileGuideAction.addEventListener("click", open);
  dependencies.trigger.addEventListener("click", open);
  dependencies.window.addEventListener("scroll", onScroll, { passive: true });
  dependencies.window.addEventListener("resize", onResize, { passive: true });
  dependencies.window.addEventListener("orientationchange", onResize);
  document.addEventListener("keydown", onKeyDown);
  elements.input.addEventListener("focus", onInputFocus);
  elements.input.addEventListener("blur", scheduleViewportUpdate);
  dependencies.window.visualViewport?.addEventListener("resize", scheduleViewportUpdate);
  dependencies.window.visualViewport?.addEventListener("scroll", scheduleViewportUpdate);
  reducedMotion?.addEventListener("change", updateMotionPreference);
  clampDock();
  updateMotionPreference();
  updateViewport();

  return () => {
    if (destroyed) return;
    destroyed = true;
    activePointerId = null;
    delete root.dataset.chatDragging;
    if (scrollTimer !== undefined) dependencies.window.clearTimeout(scrollTimer);
    clearCollapseTimer();
    clearPresentationTransition();
    clearExpandFrame();
    clearAvoidTimer();
    clearViewportFrame();
    clearKeyboardSettleTimer();
    orb.removeEventListener("click", onOrbClick);
    orb.removeEventListener("pointerdown", onPointerDown);
    orb.removeEventListener("pointermove", onPointerMove);
    orb.removeEventListener("pointerup", onPointerUp);
    orb.removeEventListener("pointercancel", onPointerCancel);
    collapse.removeEventListener("click", close);
    elements.mobileGuideAction.removeEventListener("click", open);
    dependencies.trigger.removeEventListener("click", open);
    dependencies.window.removeEventListener("scroll", onScroll);
    dependencies.window.removeEventListener("resize", onResize);
    dependencies.window.removeEventListener("orientationchange", onResize);
    document.removeEventListener("keydown", onKeyDown);
    elements.input.removeEventListener("focus", onInputFocus);
    elements.input.removeEventListener("blur", scheduleViewportUpdate);
    dependencies.window.visualViewport?.removeEventListener("resize", scheduleViewportUpdate);
    dependencies.window.visualViewport?.removeEventListener("scroll", scheduleViewportUpdate);
    reducedMotion?.removeEventListener("change", updateMotionPreference);
  };
}
