const INTERACTIVE_SELECTOR = "a, button, [role=button]";

function pressedTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>(INTERACTIVE_SELECTOR);
  if (
    !element
    || element.classList.contains("chat-orb")
    || (element instanceof HTMLButtonElement && element.disabled)
  ) return null;
  return element;
}

export function startTapFeedback(document: Document): () => void {
  let active: { element: HTMLElement; pointerId: number } | undefined;

  const clear = () => {
    if (!active) return;
    delete active.element.dataset.tapPressed;
    active = undefined;
  };
  const onPointerDown = (event: PointerEvent) => {
    clear();
    const element = pressedTarget(event.target);
    if (!element) return;
    active = { element, pointerId: event.pointerId };
    element.dataset.tapPressed = "true";
  };
  const onPointerFinish = (event: PointerEvent) => {
    if (active?.pointerId === event.pointerId) clear();
  };

  document.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.addEventListener("pointerup", onPointerFinish, { passive: true });
  document.addEventListener("pointercancel", onPointerFinish, { passive: true });
  document.defaultView?.addEventListener("scroll", clear, { passive: true });

  return () => {
    clear();
    document.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("pointerup", onPointerFinish);
    document.removeEventListener("pointercancel", onPointerFinish);
    document.defaultView?.removeEventListener("scroll", clear);
  };
}
