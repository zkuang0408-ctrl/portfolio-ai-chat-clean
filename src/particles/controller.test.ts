import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { imageToPixels, startPortrait } from "./controller";
import type { Particle } from "./types";

const pixels = {
  data: new Uint8ClampedArray(16).fill(255),
  width: 2,
  height: 2,
};

const particle: Particle = {
  targetX: 1,
  targetY: 1,
  startX: 0,
  startY: 0,
  radius: 1,
  alpha: 1,
  tone: 255,
  stretch: 1,
  delay: 0,
  band: "micro",
  region: "core",
};

function elements(width = 600, height = 800) {
  const portraitStage = document.createElement("div");
  const canvas = document.createElement("canvas");
  const portraitBase = document.createElement("img");

  portraitStage.append(portraitBase, canvas);
  Object.defineProperty(portraitStage, "clientWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(portraitStage, "clientHeight", {
    configurable: true,
    value: height,
  });

  return { canvas, portraitBase, portraitStage };
}

function dependencies(width = 600) {
  const dom = elements(width);
  const renderer = { resize: vi.fn(), draw: vi.fn() };
  const loadPixels = vi.fn().mockResolvedValue(pixels);
  const sample = vi.fn().mockReturnValue([particle]);
  const stop = vi.fn();
  const run = vi.fn().mockReturnValue(stop);

  return { ...dom, renderer, loadPixels, sample, stop, run };
}

describe("imageToPixels", () => {
  it("decodes the portrait and extracts its pixels through an offscreen canvas", async () => {
    const image = document.createElement("img");
    const decode = vi.fn().mockResolvedValue(undefined);
    const drawImage = vi.fn();
    const getImageData = vi.fn().mockReturnValue(pixels);
    const context = { drawImage, getImageData };
    const offscreen = document.createElement("canvas");

    Object.defineProperties(image, {
      decode: { configurable: true, value: decode },
      naturalWidth: { configurable: true, value: 2 },
      naturalHeight: { configurable: true, value: 2 },
    });
    vi.spyOn(offscreen, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );

    await expect(imageToPixels(image, () => offscreen)).resolves.toBe(pixels);
    expect(decode).toHaveBeenCalledOnce();
    expect(offscreen.width).toBe(2);
    expect(offscreen.height).toBe(2);
    expect(drawImage).toHaveBeenCalledWith(image, 0, 0);
    expect(getImageData).toHaveBeenCalledWith(0, 0, 2, 2);
  });

  it("rejects invalid decoded image dimensions before creating a canvas", async () => {
    const image = document.createElement("img");
    const createCanvas = vi.fn();

    Object.defineProperties(image, {
      decode: { configurable: true, value: vi.fn().mockResolvedValue(undefined) },
      naturalWidth: { configurable: true, value: 0 },
      naturalHeight: { configurable: true, value: 20 },
    });

    await expect(imageToPixels(image, createCanvas)).rejects.toThrow(
      "invalid dimensions",
    );
    expect(createCanvas).not.toHaveBeenCalled();
  });
});

describe("startPortrait", () => {
  let cleanup: () => void;

  const start = async (
    options: Parameters<typeof startPortrait>[0],
  ): Promise<() => void> => {
    cleanup = await startPortrait(options);
    return cleanup;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    cleanup = () => undefined;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("uses the fixed seed and mobile particle limit", async () => {
    const deps = dependencies(759);

    await start({ ...deps, reducedMotion: true });

    expect(deps.sample).toHaveBeenCalledWith(pixels, {
      maxParticles: 7_000,
      seed: 20260714,
    });
  });

  it("uses the desktop particle limit at the 760px breakpoint", async () => {
    const deps = dependencies(760);

    await start({ ...deps, reducedMotion: true });

    expect(deps.sample).toHaveBeenCalledWith(pixels, {
      maxParticles: 14_000,
      seed: 20260714,
    });
  });

  it("draws the settled state immediately for reduced motion", async () => {
    const deps = dependencies();

    await start({ ...deps, reducedMotion: true });

    expect(deps.run).not.toHaveBeenCalled();
    expect(deps.renderer.resize).toHaveBeenCalledWith(600, 800, 1);
    expect(deps.renderer.draw).toHaveBeenLastCalledWith([particle], 1, pixels);
  });

  it("plays one 2200ms entrance and finishes in the settled state", async () => {
    const deps = dependencies();

    await start({ ...deps, reducedMotion: false });

    expect(deps.run).toHaveBeenCalledOnce();
    const options = deps.run.mock.calls[0]?.[0];
    expect(options?.duration).toBe(2200);
    options?.onFrame(0.4);
    expect(deps.renderer.draw).toHaveBeenLastCalledWith(
      [particle],
      0.4,
      pixels,
    );
    options?.onComplete();
    expect(deps.renderer.draw).toHaveBeenLastCalledWith([particle], 1, pixels);
  });

  it("safely defaults to animation when matchMedia is unavailable", async () => {
    const deps = dependencies();
    const originalMatchMedia = window.matchMedia;

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: undefined,
    });

    try {
      await start(deps);
      expect(deps.run).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });

  it("debounces resize for 120ms, settles, and does not replay", async () => {
    const deps = dependencies();
    await start({ ...deps, reducedMotion: false });

    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
    expect(deps.renderer.draw).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(119);
    expect(deps.renderer.draw).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(deps.stop).toHaveBeenCalledOnce();
    expect(deps.renderer.draw).toHaveBeenCalledOnce();
    expect(deps.renderer.draw).toHaveBeenCalledWith([particle], 1, pixels);
    expect(deps.run).toHaveBeenCalledOnce();

    cleanup();
  });

  it("cleanup stops the timeline and removes pending resize work", async () => {
    const deps = dependencies();
    await start({ ...deps, reducedMotion: false });

    window.dispatchEvent(new Event("resize"));
    cleanup();
    await vi.advanceTimersByTimeAsync(120);
    window.dispatchEvent(new Event("resize"));
    await vi.advanceTimersByTimeAsync(120);

    expect(deps.stop).toHaveBeenCalledOnce();
    expect(deps.renderer.draw).not.toHaveBeenCalled();
  });

  it("shows the static portrait fallback when Canvas 2D is unavailable", async () => {
    const { canvas, portraitBase, portraitStage } = elements();
    vi.spyOn(canvas, "getContext").mockReturnValue(null);

    await start({
      canvas,
      portraitBase,
      portraitStage,
    });

    expect(portraitStage.classList.contains("portrait-stage--fallback")).toBe(
      true,
    );
    expect(cleanup).toBeTypeOf("function");
  });

  it("marks the stage as errored when portrait pixel loading fails", async () => {
    const deps = dependencies();
    deps.loadPixels.mockRejectedValue(new Error("decode failed"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await start({ ...deps, reducedMotion: false });

    expect(deps.run).not.toHaveBeenCalled();
    expect(
      deps.portraitStage.classList.contains("portrait-stage--error"),
    ).toBe(true);
    expect(deps.portraitStage.classList.contains("is-error")).toBe(true);
    expect(cleanup).toBeTypeOf("function");
    error.mockRestore();
  });
});
