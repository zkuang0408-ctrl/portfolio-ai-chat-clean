export interface ParticleAssistantDependencies {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly headerCanvas?: HTMLCanvasElement;
  readonly window: Window;
}

const SHELL_PARTICLE_COUNT = 1_000;
const POLAR_SHELL_PARTICLE_COUNT = 900;
const CORE_PARTICLE_COUNT = 220;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const ANIMATED_FRAME_INTERVAL_MS = 1_000 / 30;

export interface ParticlePoint {
  readonly layer: "shell" | "core";
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly seed: number;
}

function unitPoint(index: number, count: number): Pick<ParticlePoint, "x" | "y" | "z"> {
  const y = 1 - (index + 0.5) * 2 / count;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = index * GOLDEN_ANGLE;
  return { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius };
}

function pseudoRandom(index: number): number {
  const value = Math.sin(index * 78.233 + 0.918) * 43758.5453;
  return value - Math.floor(value);
}

function polarPoint(index: number, count: number): Pick<ParticlePoint, "x" | "y" | "z"> {
  const hemisphere = index % 2 === 0 ? 1 : -1;
  const pairIndex = Math.floor(index / 2);
  const pairCount = Math.ceil(count / 2);
  const y = hemisphere * (0.7 + 0.3 * Math.pow((pairIndex + 0.5) / pairCount, 0.72));
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = index * GOLDEN_ANGLE;
  return { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius };
}

export function createParticleField(): readonly ParticlePoint[] {
  const shell = Array.from({ length: SHELL_PARTICLE_COUNT }, (_, index) => ({
    ...unitPoint(index, SHELL_PARTICLE_COUNT),
    layer: "shell" as const,
    seed: index * 0.61803398875,
  }));
  const polarShell = Array.from({ length: POLAR_SHELL_PARTICLE_COUNT }, (_, index) => ({
    ...polarPoint(index, POLAR_SHELL_PARTICLE_COUNT),
    layer: "shell" as const,
    seed: (index + SHELL_PARTICLE_COUNT) * 0.61803398875,
  }));
  const core = Array.from({ length: CORE_PARTICLE_COUNT }, (_, index) => {
    const point = unitPoint(index * 7 + 3, CORE_PARTICLE_COUNT * 7 + 3);
    const radius = 0.18 + pseudoRandom(index) * 0.58;
    return {
      layer: "core" as const,
      x: point.x * radius,
      y: point.y * radius,
      z: point.z * radius,
      seed: index * 1.73205080757,
    };
  });
  return [...shell, ...polarShell, ...core];
}

function rotate(point: ParticlePoint, yaw: number, pitch: number): Pick<ParticlePoint, "x" | "y" | "z"> {
  const yawX = point.x * Math.cos(yaw) - point.z * Math.sin(yaw);
  const yawZ = point.x * Math.sin(yaw) + point.z * Math.cos(yaw);
  return {
    x: yawX,
    y: point.y * Math.cos(pitch) - yawZ * Math.sin(pitch),
    z: point.y * Math.sin(pitch) + yawZ * Math.cos(pitch),
  };
}

function presentationProgress(presentation: string | undefined): number {
  return presentation === "guide" || presentation === "expanded" ? 0 : 1;
}

export function startParticleAssistant(
  dependencies: ParticleAssistantDependencies,
): () => void {
  const { root, canvas, headerCanvas, window } = dependencies;
  const context = canvas.getContext("2d");
  if (!context) {
    root.dataset.chatParticles = "fallback";
    return () => undefined;
  }
  const layers = [
    { canvas, context, sphereScale: 1 },
    ...(headerCanvas
      ? [{ canvas: headerCanvas, context: headerCanvas.getContext("2d"), sphereScale: 0.95 }]
      : []),
  ].filter(
    (layer): layer is { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; sphereScale: number } =>
      Boolean(layer.context),
  );

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let destroyed = false;
  let frame: number | undefined;
  let lastDrawTime: number | undefined;
  let progress = presentationProgress(root.dataset.chatPresentation);
  const particles = createParticleField();
  const columns = Math.ceil(Math.sqrt(particles.length * 1.25));
  const rows = Math.ceil(particles.length / columns);

  const resize = () => {
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    for (const layer of layers) {
      const bounds = layer.canvas.getBoundingClientRect();
      layer.canvas.width = Math.max(1, Math.round(bounds.width * scale));
      layer.canvas.height = Math.max(1, Math.round(bounds.height * scale));
      layer.context.setTransform(scale, 0, 0, scale, 0, 0);
    }
  };

  const draw = (timestamp: number) => {
    if (destroyed || window.document.visibilityState !== "visible") return;
    const staticMode = reducedMotion?.matches ?? false;
    if (
      !staticMode
      && lastDrawTime !== undefined
      && timestamp - lastDrawTime < ANIMATED_FRAME_INTERVAL_MS
    ) {
      frame = window.requestAnimationFrame(draw);
      return;
    }
    if (!staticMode) lastDrawTime = timestamp;
    const target = presentationProgress(root.dataset.chatPresentation);
    progress += (target - progress) * (staticMode ? 1 : 0.11);
    const shellRotation = staticMode ? 0 : timestamp * 0.00022;
    const innerRotation = staticMode ? 0 : -timestamp * 0.00034;
    const headerLayer = headerCanvas
      ? layers.find((layer) => layer.canvas === headerCanvas)
      : undefined;
    const mobileGuideUsesHeader = window.innerWidth <= 760
      && root.dataset.chatPresentation === "guide";
    const activeLayers = (
      root.dataset.chatPresentation === "expanded" || mobileGuideUsesHeader
    ) && headerLayer
      ? [headerLayer]
      : [layers[0]!];
    for (const layer of activeLayers) {
      const width = Math.max(1, layer.canvas.clientWidth || layer.canvas.getBoundingClientRect().width || 140);
      const height = Math.max(1, layer.canvas.clientHeight || layer.canvas.getBoundingClientRect().height || 140);
      const centreX = width / 2;
      const centreY = height / 2;
      const sphereRadius = Math.min(width, height) * 0.43 * layer.sphereScale;
      layer.context.clearRect(0, 0, width, height);
      const layerProgress = layer.canvas === headerCanvas ? 1 : progress;
      for (let index = 0; index < particles.length; index += 1) {
        const point = particles[index]!;
        const isShell = point.layer === "shell";
        const rotation = isShell ? shellRotation : innerRotation;
        const wobble = staticMode ? 0 : Math.sin(timestamp * 0.0009 + point.seed) * 0.018;
        const rotated = rotate(point, rotation + wobble, 0.035 + wobble * 0.35);
        const depth = (rotated.z + 1) / 2;
        const guideX = ((index % columns) / (columns - 1) - 0.5) * width * 0.86 + centreX;
        const guideY = (Math.floor(index / columns) / rows - 0.5) * height * 0.72 + centreY;
        const ballX = centreX + rotated.x * sphereRadius;
        const ballY = centreY + rotated.y * sphereRadius;
        const polarGlow = Math.pow(Math.abs(rotated.y), 2.1);
        const shellGlow = isShell ? 0.055 + polarGlow * 0.87 + depth * 0.06 : 0.025 + depth * 0.09;
        const particleX = guideX + (ballX - guideX) * layerProgress;
        const particleY = guideY + (ballY - guideY) * layerProgress;
        const size = isShell ? 0.16 + depth * 0.32 + polarGlow * 0.12 : 0.16 + depth * 0.24;
        const alpha = Math.min(0.98, shellGlow);
        const channel = Math.round(208 + alpha * 47);
        layer.context.fillStyle = `rgb(${channel} ${channel} ${channel} / ${alpha})`;
        layer.context.beginPath();
        layer.context.arc(particleX, particleY, size, 0, Math.PI * 2);
        layer.context.fill();
      }
    }
    if (!staticMode) frame = window.requestAnimationFrame(draw);
  };

  const update = () => {
    if (window.document.visibilityState !== "visible") {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = undefined;
      return;
    }
    if (reducedMotion?.matches) {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = undefined;
      draw(0);
      return;
    }
    if (frame === undefined) frame = window.requestAnimationFrame(draw);
  };
  const onResize = () => {
    resize();
    update();
  };
  const observer = new MutationObserver(() => {
    resize();
    update();
  });
  observer.observe(root, { attributes: true, attributeFilter: ["data-chat-presentation"] });

  root.dataset.chatParticles = "ready";
  resize();
  update();
  window.addEventListener("resize", onResize, { passive: true });
  reducedMotion?.addEventListener("change", update);
  window.document.addEventListener("visibilitychange", update);

  return () => {
    if (destroyed) return;
    destroyed = true;
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener("resize", onResize);
    reducedMotion?.removeEventListener("change", update);
    window.document.removeEventListener("visibilitychange", update);
  };
}
