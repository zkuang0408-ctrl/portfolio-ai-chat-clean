export interface ParticleAssistantDependencies {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly window: Window;
}

const SHELL_PARTICLE_COUNT = 420;
const CORE_PARTICLE_COUNT = 96;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

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

export function createParticleField(): readonly ParticlePoint[] {
  const shell = Array.from({ length: SHELL_PARTICLE_COUNT }, (_, index) => ({
    ...unitPoint(index, SHELL_PARTICLE_COUNT),
    layer: "shell" as const,
    seed: index * 0.61803398875,
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
  return [...shell, ...core];
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
  const particles = createParticleField();

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
    const shellRotation = staticMode ? 0 : timestamp * 0.00028;
    const innerRotation = staticMode ? 0 : -timestamp * 0.00044;
    const centreX = width / 2;
    const centreY = height / 2;
    const sphereRadius = Math.min(width, height) * 0.43;
    const columns = Math.ceil(Math.sqrt(particles.length * 1.25));
    const rendered = particles.map((point, index) => {
      const isShell = point.layer === "shell";
      const rotation = isShell ? shellRotation : innerRotation;
      const wobble = staticMode ? 0 : Math.sin(timestamp * 0.0011 + point.seed) * 0.028;
      const rotated = rotate(point, rotation + wobble, 0.23 + wobble * 0.7);
      const depth = (rotated.z + 1) / 2;
      const guideX = ((index % columns) / (columns - 1) - 0.5) * width * 0.86 + centreX;
      const guideY = (Math.floor(index / columns) / Math.ceil(particles.length / columns) - 0.5) * height * 0.72 + centreY;
      const ballX = centreX + rotated.x * sphereRadius;
      const ballY = centreY + rotated.y * sphereRadius;
      const polarGlow = Math.pow(Math.abs(rotated.y), 2.2);
      const shellGlow = isShell ? 0.19 + polarGlow * 0.65 + depth * 0.14 : 0.10 + depth * 0.22;
      return {
        x: guideX + (ballX - guideX) * progress,
        y: guideY + (ballY - guideY) * progress,
        z: rotated.z,
        size: isShell ? 0.48 + depth * 0.95 + polarGlow * 0.35 : 0.38 + depth * 0.52,
        alpha: Math.min(0.98, shellGlow),
      };
    }).sort((a, b) => a.z - b.z);

    for (const particle of rendered) {
      const channel = Math.round(176 + particle.alpha * 75);
      context.fillStyle = `rgb(${channel} ${channel} ${Math.max(160, channel - 6)} / ${particle.alpha})`;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
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
  const observer = new MutationObserver(() => {
    resize();
    update();
  });
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
