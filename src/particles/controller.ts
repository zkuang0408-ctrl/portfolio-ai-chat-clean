import { ParticleRenderer } from "./renderer";
import { samplePortrait } from "./sampler";
import { runEntrance } from "./timeline";
import type { Particle, PixelBuffer } from "./types";

const PORTRAIT_SEED = 20260714;
const MOBILE_BREAKPOINT = 760;
const MOBILE_PARTICLE_LIMIT = 7_000;
const DESKTOP_PARTICLE_LIMIT = 14_000;
const ENTRANCE_DURATION = 2_200;
const RESIZE_DEBOUNCE = 120;

interface RendererLike {
  resize(width: number, height: number, devicePixelRatio: number): void;
  draw(
    particles: readonly Particle[],
    progress: number,
    source: { width: number; height: number },
  ): void;
}

interface StartPortraitOptions {
  canvas: HTMLCanvasElement;
  portraitBase: HTMLImageElement;
  portraitStage: HTMLElement;
  reducedMotion?: boolean;
  loadPixels?: (image: HTMLImageElement) => Promise<PixelBuffer>;
  sample?: typeof samplePortrait;
  renderer?: RendererLike;
  run?: typeof runEntrance;
}

type CanvasFactory = () => HTMLCanvasElement;

const noop = (): void => undefined;

function hasValidImageDimensions(image: HTMLImageElement): boolean {
  return (
    Number.isFinite(image.naturalWidth) &&
    image.naturalWidth > 0 &&
    Number.isFinite(image.naturalHeight) &&
    image.naturalHeight > 0
  );
}

export async function imageToPixels(
  image: HTMLImageElement,
  createCanvas: CanvasFactory = () => document.createElement("canvas"),
): Promise<PixelBuffer> {
  await image.decode();

  if (!hasValidImageDimensions(image)) {
    throw new Error("Decoded portrait has invalid dimensions.");
  }

  const buffer = createCanvas();
  buffer.width = image.naturalWidth;
  buffer.height = image.naturalHeight;
  const context = buffer.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Offscreen Canvas 2D is unavailable.");
  }

  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, buffer.width, buffer.height);
}

function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function createRenderer(
  canvas: HTMLCanvasElement,
): RendererLike | undefined {
  try {
    const context = canvas.getContext("2d");
    return context ? new ParticleRenderer(canvas, context) : undefined;
  } catch {
    return undefined;
  }
}

export async function startPortrait(
  options: StartPortraitOptions,
): Promise<() => void> {
  const renderer = options.renderer ?? createRenderer(options.canvas);

  if (!renderer) {
    options.portraitStage.classList.add("portrait-stage--fallback");
    return noop;
  }

  try {
    const pixels = await (options.loadPixels ?? imageToPixels)(
      options.portraitBase,
    );
    const maxParticles =
      options.portraitStage.clientWidth < MOBILE_BREAKPOINT
        ? MOBILE_PARTICLE_LIMIT
        : DESKTOP_PARTICLE_LIMIT;
    const particles = (options.sample ?? samplePortrait)(pixels, {
      maxParticles,
      seed: PORTRAIT_SEED,
    });
    const resize = (): void => {
      renderer.resize(
        options.portraitStage.clientWidth,
        options.portraitStage.clientHeight,
        window.devicePixelRatio,
      );
    };
    const drawSettled = (): void => {
      resize();
      renderer.draw(particles, 1, pixels);
    };

    resize();

    const reduced = options.reducedMotion ?? prefersReducedMotion();
    let stopTimeline = noop;

    if (reduced) {
      renderer.draw(particles, 1, pixels);
    } else {
      stopTimeline = (options.run ?? runEntrance)({
        duration: ENTRANCE_DURATION,
        now: () => performance.now(),
        schedule: (callback) => requestAnimationFrame(callback),
        cancel: (id) => cancelAnimationFrame(id),
        onFrame: (progress) => renderer.draw(particles, progress, pixels),
        onComplete: drawSettled,
      });
    }

    let resizeTimer: number | undefined;
    let cleanedUp = false;
    const onResize = (): void => {
      if (resizeTimer !== undefined) {
        window.clearTimeout(resizeTimer);
      }

      resizeTimer = window.setTimeout(() => {
        resizeTimer = undefined;
        stopTimeline();
        drawSettled();
      }, RESIZE_DEBOUNCE);
    };

    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      if (cleanedUp) return;
      cleanedUp = true;
      stopTimeline();

      if (resizeTimer !== undefined) {
        window.clearTimeout(resizeTimer);
      }

      window.removeEventListener("resize", onResize);
    };
  } catch (error) {
    options.portraitStage.classList.add("portrait-stage--error", "is-error");

    if (import.meta.env.DEV) {
      console.error("Portrait initialization failed", error);
    }

    return noop;
  }
}
