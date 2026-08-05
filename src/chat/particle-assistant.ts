export interface ParticleAssistantDependencies {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly window: Window;
}

const PARTICLE_COUNT = 72;

function presentationProgress(presentation: string | undefined): number {
  return presentation === "guide" || presentation === "expanded" ? 0 : 1;
}

export function startParticleAssistant(
  dependencies: ParticleAssistantDependencies,
): () => void {
  const { root, canvas, window } = dependencies;
  const context = canvas.getContext("2d");
  if (!context) {
    root.dataset.chatParticles = "fallback";
    return () => undefined;
  }

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let destroyed = false;
  let frame: number | undefined;
  let progress = presentationProgress(root.dataset.chatPresentation);

  const resize = () => {
    const bounds = canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(bounds.width * scale));
    canvas.height = Math.max(1, Math.round(bounds.height * scale));
    context.setTransform(scale, 0, 0, scale, 0, 0);
  };

  const draw = (timestamp: number) => {
    if (destroyed) return;
    const width = Math.max(1, canvas.clientWidth || 140);
    const height = Math.max(1, canvas.clientHeight || 140);
    context.clearRect(0, 0, width, height);
    const staticMode = reducedMotion?.matches ?? false;
    const target = presentationProgress(root.dataset.chatPresentation);
    progress += (target - progress) * (staticMode ? 1 : 0.11);
    const shellRotation = staticMode ? 0 : timestamp / 20000;
    const innerRotation = staticMode ? 0 : -timestamp / 14000;
    const centreX = width / 2;
    const centreY = height / 2;
    const shellRadius = Math.min(width, height) * 0.34;

    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const seed = index * 2.399963229728653;
      const shell = index % 3 === 0;
      const angle = seed + (shell ? shellRotation : innerRotation);
      const guideX = ((index % 12) / 11 - 0.5) * width * 0.82 + centreX;
      const guideY = (Math.floor(index / 12) / 5 - 0.5) * height * 0.7 + centreY;
      const ring = shellRadius * (shell ? 1 : 0.5 + (index % 5) * 0.06);
      const ballX = centreX + Math.cos(angle) * ring;
      const ballY = centreY + Math.sin(angle) * ring;
      const x = guideX + (ballX - guideX) * progress;
      const y = guideY + (ballY - guideY) * progress;
      const size = index % 17 === 0 ? 2.8 : index % 5 === 0 ? 1.8 : 1.1;
      context.fillStyle = index % 5 === 0 ? "#f0eee7" : index % 2 === 0 ? "#b7b5ae" : "#72726d";
      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      context.fill();
    }
    if (!staticMode) frame = window.requestAnimationFrame(draw);
  };

  const update = () => {
    if (reducedMotion?.matches) {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = undefined;
      draw(0);
      return;
    }
    if (frame === undefined) frame = window.requestAnimationFrame(draw);
  };
  const observer = new MutationObserver(update);
  observer.observe(root, { attributes: true, attributeFilter: ["data-chat-presentation"] });

  root.dataset.chatParticles = "ready";
  resize();
  update();
  window.addEventListener("resize", resize, { passive: true });
  reducedMotion?.addEventListener("change", update);

  return () => {
    if (destroyed) return;
    destroyed = true;
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener("resize", resize);
    reducedMotion?.removeEventListener("change", update);
  };
}
