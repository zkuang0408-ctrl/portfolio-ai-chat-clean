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
    parallax?: { x: number; y: number },
  ): void;
}

interface StartPortraitOptions {
  canvas: HTMLCanvasElement;
  portraitBase: HTMLImageElement;
  portraitMask: HTMLImageElement;
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

function waitForImageLoad(image: HTMLImageElement): Promise<void> {
  if (image.complete) {
    return hasValidImageDimensions(image)
      ? Promise.resolve()
      : Promise.reject(new Error("Portrait image failed to load."));
  }

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
    };
    const onLoad = (): void => {
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(new Error("Portrait image failed to load."));
    };

    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });

    if (image.complete) {
      if (hasValidImageDimensions(image)) onLoad();
      else onError();
    }
  });
}

async function decodeImage(image: HTMLImageElement): Promise<void> {
  if (typeof image.decode === "function") {
    await image.decode();
    return;
  }

  await waitForImageLoad(image);
}

export async function imageToPixels(
  image: HTMLImageElement,
  createCanvas: CanvasFactory = () => document.createElement("canvas"),
): Promise<PixelBuffer> {
  await decodeImage(image);

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

function matchesMedia(query: string, fallback: () => boolean): boolean {
  if (typeof window.matchMedia !== "function") {
    return fallback();
  }

  try {
    return window.matchMedia(query).matches;
  } catch {
    return fallback();
  }
}

function isMobileViewport(): boolean {
  return matchesMedia(
    `(max-width: ${MOBILE_BREAKPOINT}px)`,
    () => window.innerWidth <= MOBILE_BREAKPOINT,
  );
}

function particleLimitForViewport(): number {
  return isMobileViewport()
    ? MOBILE_PARTICLE_LIMIT
    : DESKTOP_PARTICLE_LIMIT;
}

function prefersReducedMotion(): boolean {
  return matchesMedia("(prefers-reduced-motion: reduce)", () => false);
}

function hasVisibleAlpha(mask: PixelBuffer): boolean {
  for (let index = 3; index < mask.data.length; index += 4) {
    if ((mask.data[index] ?? 0) > 0) return true;
  }

  return false;
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

  let stopTimeline = noop;
  let resizeTimer: number | undefined;
  let listening = false;
  let pointerListening = false;
  let closed = false;
  let drawSettled = noop;
  let onResize = noop;
  let onPointerMove: (event: Event) => void = noop;

  const stopAnimation = (): void => {
    const stop = stopTimeline;
    stopTimeline = noop;
    stop();
  };
  const release = (): void => {
    try {
      stopAnimation();
    } catch {
      // Cleanup must not turn a rendering failure into another uncaught error.
    }

    if (resizeTimer !== undefined) {
      window.clearTimeout(resizeTimer);
      resizeTimer = undefined;
    }

    if (listening) {
      window.removeEventListener("resize", onResize);
      listening = false;
    }
    if (pointerListening) {
      window.removeEventListener("pointermove", onPointerMove);
      pointerListening = false;
    }
  };
  const fail = (error: unknown): void => {
    if (closed) return;
    closed = true;
    release();
    options.portraitStage.classList.add("portrait-stage--error", "is-error");

    if (import.meta.env.DEV) {
      console.error("Portrait initialization failed", error);
    }
  };
  const safely = <Arguments extends unknown[]>(
    callback: (...args: Arguments) => void,
  ) => {
    return (...args: Arguments): void => {
      if (closed) return;

      try {
        callback(...args);
      } catch (error) {
        fail(error);
      }
    };
  };
  const cleanup = (): void => {
    if (closed) return;
    closed = true;
    release();
  };
  onResize = (): void => {
    if (closed) return;

    if (resizeTimer !== undefined) {
      window.clearTimeout(resizeTimer);
    }

    resizeTimer = window.setTimeout(
      safely(() => {
        resizeTimer = undefined;
        stopAnimation();
        drawSettled();
      }),
      RESIZE_DEBOUNCE,
    );
  };

  try {
    const loadPixels = options.loadPixels ?? imageToPixels;
    const [pixels, mask] = await Promise.all([
      loadPixels(options.portraitBase),
      loadPixels(options.portraitMask),
    ]);
    if (pixels.width !== mask.width || pixels.height !== mask.height) {
      throw new Error("Portrait mask dimensions must match source pixels.");
    }
    if (!hasVisibleAlpha(mask)) {
      throw new Error("Portrait mask has no visible subject pixels.");
    }
    const sample = options.sample ?? samplePortrait;
    let particleLimit = particleLimitForViewport();
    let particles = sample(pixels, {
      maxParticles: particleLimit,
      seed: PORTRAIT_SEED,
      mask,
    });
    const resize = (): void => {
      renderer.resize(
        options.portraitStage.clientWidth,
        options.portraitStage.clientHeight,
        window.devicePixelRatio,
      );
    };
    drawSettled = (): void => {
      const nextParticleLimit = particleLimitForViewport();
      if (nextParticleLimit !== particleLimit) {
        particles = sample(pixels, {
          maxParticles: nextParticleLimit,
          seed: PORTRAIT_SEED,
          mask,
        });
        particleLimit = nextParticleLimit;
      }
      resize();
      renderer.draw(particles, 1, pixels);
    };
    onPointerMove = safely((event: Event) => {
      const pointer = event as MouseEvent;
      const viewportWidth = Math.max(1, window.innerWidth);
      const viewportHeight = Math.max(1, window.innerHeight);
      const x = Math.max(-4, Math.min(4, (pointer.clientX / viewportWidth - 0.5) * 8));
      const y = Math.max(-4, Math.min(4, (pointer.clientY / viewportHeight - 0.5) * 8));
      renderer.draw(particles, 1, pixels, { x, y });
    });

    resize();

    const reduced = options.reducedMotion ?? prefersReducedMotion();
    if (reduced) {
      renderer.draw(particles, 1, pixels);
    } else {
      const returnedStop = (options.run ?? runEntrance)({
        duration: ENTRANCE_DURATION,
        now: () => performance.now(),
        schedule: (callback) => requestAnimationFrame(callback),
        cancel: (id) => cancelAnimationFrame(id),
        onFrame: safely((progress) =>
          renderer.draw(particles, progress, pixels),
        ),
        onComplete: safely(() => {
          window.addEventListener("pointermove", onPointerMove, { passive: true });
          pointerListening = true;
        }),
      });
      stopTimeline = returnedStop;

      if (closed) {
        release();
      }
    }

    if (!closed) {
      window.addEventListener("resize", onResize, { passive: true });
      listening = true;
    }

    return cleanup;
  } catch (error) {
    fail(error);
    return cleanup;
  }
}
