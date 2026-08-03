import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { imageToPixels, startPortrait } from "./controller";
import type { Particle } from "./types";

const pixels = {
  data: new Uint8ClampedArray(16).fill(255),
  width: 2,
  height: 2,
};

const maskPixels = {
  data: new Uint8ClampedArray([
    0, 0, 0, 0,
    0, 0, 0, 255,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]),
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
  depth: 0.9,
};

function elements(width = 600, height = 800) {
  const portraitStage = document.createElement("div");
  const portraitError = document.createElement("p");
  const canvas = document.createElement("canvas");
  const portraitBase = document.createElement("img");
  const portraitMask = document.createElement("img");
  portraitBase.hidden = true;
  portraitMask.hidden = true;
  portraitError.hidden = true;

  portraitStage.append(portraitBase, portraitMask, canvas);
  Object.defineProperty(portraitStage, "clientWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(portraitStage, "clientHeight", {
    configurable: true,
    value: height,
  });

  return { canvas, portraitBase, portraitMask, portraitStage, portraitError };
}

function dependencies(width = 600) {
  const dom = elements(width);
  const renderer = { resize: vi.fn(), draw: vi.fn() };
  const loadPixels = vi.fn((image: HTMLImageElement) =>
    Promise.resolve(image === dom.portraitBase ? pixels : maskPixels),
  );
  const sample = vi.fn().mockReturnValue([particle]);
  const stop = vi.fn();
  const run = vi.fn().mockReturnValue(stop);

  return { ...dom, renderer, loadPixels, sample, stop, run };
}

function installAnimationFrame() {
  const callbacks: FrameRequestCallback[] = [];
  const request = vi.fn((callback: FrameRequestCallback): number => {
    callbacks.push(callback);
    return callbacks.length;
  });
  const cancel = vi.fn();

  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);

  return { callbacks, cancel, request };
}

function installMatchMedia(viewportWidth: number, reducedMotion = false) {
  const matchMedia = vi.fn((query: string): MediaQueryList => {
    const matches =
      query === "(max-width: 760px)"
        ? viewportWidth <= 760
        : query === "(prefers-reduced-motion: reduce)"
          ? reducedMotion
          : false;

    return {
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  });

  vi.stubGlobal("matchMedia", matchMedia);
  return matchMedia;
}

function installResizableMatchMedia(initialViewportWidth: number) {
  let viewportWidth = initialViewportWidth;
  const matchMedia = vi.fn((query: string): MediaQueryList => ({
    matches:
      query === "(max-width: 760px)"
        ? viewportWidth <= 760
        : query === "(prefers-reduced-motion: reduce)",
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

  vi.stubGlobal("matchMedia", matchMedia);
  return {
    matchMedia,
    setViewportWidth(value: number): void {
      viewportWidth = value;
    },
  };
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

  it("uses an already complete image when decode is unavailable", async () => {
    const image = document.createElement("img");
    const offscreen = document.createElement("canvas");
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue(pixels),
    };
    Object.defineProperties(image, {
      decode: { configurable: true, value: undefined },
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 2 },
      naturalHeight: { configurable: true, value: 2 },
    });
    vi.spyOn(offscreen, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );

    await expect(imageToPixels(image, () => offscreen)).resolves.toBe(pixels);
  });

  it("waits for the image load event when decode is unavailable", async () => {
    const image = document.createElement("img");
    const offscreen = document.createElement("canvas");
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue(pixels),
    };
    Object.defineProperties(image, {
      decode: { configurable: true, value: undefined },
      complete: { configurable: true, value: false },
      naturalWidth: { configurable: true, value: 2 },
      naturalHeight: { configurable: true, value: 2 },
    });
    vi.spyOn(offscreen, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );

    const result = imageToPixels(image, () => offscreen);
    image.dispatchEvent(new Event("load"));

    await expect(result).resolves.toBe(pixels);
  });

  it("rejects the image error event when decode is unavailable", async () => {
    const image = document.createElement("img");
    Object.defineProperties(image, {
      decode: { configurable: true, value: undefined },
      complete: { configurable: true, value: false },
      naturalWidth: { configurable: true, value: 0 },
      naturalHeight: { configurable: true, value: 0 },
    });

    const result = imageToPixels(image, vi.fn());
    image.dispatchEvent(new Event("error"));

    await expect(result).rejects.toThrow("failed to load");
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([
    { viewportWidth: 600, stageWidth: 768, maxParticles: 7_000 },
    { viewportWidth: 760, stageWidth: 900, maxParticles: 7_000 },
    { viewportWidth: 761, stageWidth: 600, maxParticles: 14_000 },
  ])(
    "samples $maxParticles particles for a $viewportWidth px viewport independently of the $stageWidth px stage",
    async ({ viewportWidth, stageWidth, maxParticles }) => {
      const deps = dependencies(stageWidth);
      const matchMedia = installMatchMedia(viewportWidth);

      await start(deps);

      expect(deps.sample).toHaveBeenCalledWith(pixels, {
        maxParticles,
        seed: 20260714,
        mask: maskPixels,
      });
      expect(matchMedia).toHaveBeenCalledWith("(max-width: 760px)");
      expect(matchMedia).toHaveBeenCalledWith(
        "(prefers-reduced-motion: reduce)",
      );
    },
  );

  it("draws the settled state immediately for reduced motion", async () => {
    const deps = dependencies();

    await start({ ...deps, reducedMotion: true });

    expect(deps.run).not.toHaveBeenCalled();
    expect(deps.renderer.resize).toHaveBeenCalledWith(600, 800, 1);
    expect(deps.renderer.draw).toHaveBeenLastCalledWith([particle], 1, pixels);
    expect(deps.portraitError.hidden).toBe(true);
    expect(deps.portraitError.textContent).toBe("");
  });

  it("keeps parallax disabled after resizing in reduced-motion mode", async () => {
    const deps = dependencies();
    const frame = installAnimationFrame();
    const addEventListener = vi.spyOn(window, "addEventListener");

    await start({ ...deps, reducedMotion: true });
    window.dispatchEvent(new Event("resize"));
    await vi.advanceTimersByTimeAsync(120);
    const settledDrawCount = deps.renderer.draw.mock.calls.length;

    window.dispatchEvent(new MouseEvent("pointermove", {
      clientX: 1_000,
      clientY: 0,
    }));

    const pointerRegistrations = addEventListener.mock.calls.filter(
      ([eventName]) => eventName === "pointermove",
    );
    expect(pointerRegistrations).toHaveLength(0);
    expect(frame.request).not.toHaveBeenCalled();
    expect(deps.renderer.draw).toHaveBeenCalledTimes(settledDrawCount);
  });

  it("plays one 2200ms entrance without redrawing its terminal frame", async () => {
    const deps = dependencies();

    await start({ ...deps, reducedMotion: false });

    expect(deps.run).toHaveBeenCalledOnce();
    const options = deps.run.mock.calls[0]?.[0];
    expect(options?.duration).toBe(2200);
    options?.onFrame(1);
    expect(deps.renderer.draw).toHaveBeenLastCalledWith([particle], 1, pixels);
    const terminalDrawCount = deps.renderer.draw.mock.calls.length;
    options?.onComplete();
    expect(deps.renderer.draw).toHaveBeenCalledTimes(terminalDrawCount);
  });

  it("adds only restrained depth parallax after the entrance settles", async () => {
    const deps = dependencies();
    const frame = installAnimationFrame();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1_000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });

    await start({ ...deps, reducedMotion: false });
    deps.run.mock.calls[0]?.[0]?.onComplete();
    window.dispatchEvent(new MouseEvent("pointermove", {
      clientX: 1_000,
      clientY: 0,
    }));
    frame.callbacks[0]?.(0);

    expect(deps.renderer.draw).toHaveBeenLastCalledWith(
      [particle],
      1,
      pixels,
      { x: 4, y: -4 },
    );
  });

  it("enables parallax once when resize settles an unfinished entrance", async () => {
    const deps = dependencies();
    const frame = installAnimationFrame();
    const addEventListener = vi.spyOn(window, "addEventListener");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1_000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });

    await start({ ...deps, reducedMotion: false });
    window.dispatchEvent(new Event("resize"));
    await vi.advanceTimersByTimeAsync(120);
    deps.renderer.draw.mockClear();

    window.dispatchEvent(new MouseEvent("pointermove", {
      clientX: 1_000,
      clientY: 0,
    }));
    expect(frame.request).toHaveBeenCalledOnce();
    frame.callbacks[0]?.(0);
    expect(deps.renderer.draw).toHaveBeenLastCalledWith(
      [particle],
      1,
      pixels,
      { x: 4, y: -4 },
    );

    deps.run.mock.calls[0]?.[0]?.onComplete();
    const pointerRegistrations = addEventListener.mock.calls.filter(
      ([eventName]) => eventName === "pointermove",
    );
    expect(pointerRegistrations).toHaveLength(1);
  });

  it("coalesces pointer bursts into one frame using the latest coordinates", async () => {
    const deps = dependencies();
    const frame = installAnimationFrame();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1_000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });

    await start({ ...deps, reducedMotion: false });
    deps.run.mock.calls[0]?.[0]?.onComplete();
    deps.renderer.draw.mockClear();

    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 0, clientY: 0 }));
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 500, clientY: 400 }));
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 1_000, clientY: 800 }));

    expect(frame.request).toHaveBeenCalledOnce();
    expect(deps.renderer.draw).not.toHaveBeenCalled();
    frame.callbacks[0]?.(0);
    expect(deps.renderer.draw).toHaveBeenCalledOnce();
    expect(deps.renderer.draw).toHaveBeenCalledWith(
      [particle],
      1,
      pixels,
      { x: 4, y: 4 },
    );

    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 500, clientY: 400 }));
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 0, clientY: 0 }));
    expect(frame.request).toHaveBeenCalledTimes(2);
    expect(deps.renderer.draw).toHaveBeenCalledOnce();
    frame.callbacks[1]?.(0);
    expect(deps.renderer.draw).toHaveBeenCalledTimes(2);
    expect(deps.renderer.draw).toHaveBeenLastCalledWith(
      [particle],
      1,
      pixels,
      { x: -4, y: -4 },
    );
  });

  it("cancels a pending parallax frame and prevents drawing after cleanup", async () => {
    const deps = dependencies();
    const frame = installAnimationFrame();

    await start({ ...deps, reducedMotion: false });
    deps.run.mock.calls[0]?.[0]?.onComplete();
    deps.renderer.draw.mockClear();
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 0, clientY: 0 }));

    expect(frame.request).toHaveBeenCalledOnce();
    cleanup();
    expect(frame.cancel).toHaveBeenCalledWith(1);
    frame.callbacks[0]?.(0);
    expect(deps.renderer.draw).not.toHaveBeenCalled();
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

  it.each([
    {
      initialWidth: 1_440,
      resizedWidth: 390,
      initialBudget: 14_000,
      resizedBudget: 7_000,
    },
    {
      initialWidth: 390,
      resizedWidth: 1_440,
      initialBudget: 7_000,
      resizedBudget: 14_000,
    },
  ])(
    "resamples $initialBudget->$resizedBudget once across the 760px breakpoint and draws settled",
    async ({ initialWidth, resizedWidth, initialBudget, resizedBudget }) => {
      const deps = dependencies();
      const desktopParticle = { ...particle, targetX: 14 };
      const mobileParticle = { ...particle, targetX: 7 };
      const media = installResizableMatchMedia(initialWidth);
      deps.sample.mockImplementation((_source, options) =>
        options.maxParticles === 14_000
          ? [desktopParticle]
          : [mobileParticle],
      );

      await start({ ...deps, reducedMotion: false });
      media.setViewportWidth(resizedWidth);
      window.dispatchEvent(new Event("resize"));
      await vi.advanceTimersByTimeAsync(120);

      expect(deps.sample).toHaveBeenNthCalledWith(1, pixels, {
        maxParticles: initialBudget,
        seed: 20260714,
        mask: maskPixels,
      });
      expect(deps.sample).toHaveBeenNthCalledWith(2, pixels, {
        maxParticles: resizedBudget,
        seed: 20260714,
        mask: maskPixels,
      });
      expect(deps.sample).toHaveBeenCalledTimes(2);
      expect(deps.renderer.draw).toHaveBeenLastCalledWith(
        resizedBudget === 14_000 ? [desktopParticle] : [mobileParticle],
        1,
        pixels,
      );
      expect(deps.run).toHaveBeenCalledOnce();
    },
  );

  it("reuses particles when resizing within the same particle-budget tier", async () => {
    const deps = dependencies();
    const media = installResizableMatchMedia(1_440);

    await start({ ...deps, reducedMotion: false });
    media.setViewportWidth(900);
    window.dispatchEvent(new Event("resize"));
    await vi.advanceTimersByTimeAsync(120);

    expect(deps.sample).toHaveBeenCalledOnce();
    expect(deps.renderer.draw).toHaveBeenLastCalledWith([particle], 1, pixels);
    expect(deps.run).toHaveBeenCalledOnce();
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

  it("contains delayed animation draw failures and releases lifecycle resources", async () => {
    const deps = dependencies();
    const drawError = new Error("animation draw failed");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await start({ ...deps, reducedMotion: false });
    deps.renderer.draw.mockImplementationOnce(() => {
      throw drawError;
    });
    const timeline = deps.run.mock.calls[0]?.[0];
    window.dispatchEvent(new Event("resize"));
    expect(vi.getTimerCount()).toBe(1);

    expect(() => timeline?.onFrame(0.4)).not.toThrow();
    expect(deps.stop).toHaveBeenCalledOnce();
    expect(
      deps.portraitStage.classList.contains("portrait-stage--error"),
    ).toBe(true);
    expect(deps.portraitStage.classList.contains("is-error")).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    window.dispatchEvent(new Event("resize"));
    await vi.advanceTimersByTimeAsync(120);
    expect(deps.renderer.draw).toHaveBeenCalledOnce();
    cleanup();
    cleanup();
    expect(deps.stop).toHaveBeenCalledOnce();
  });

  it("contains resize draw failures and keeps cleanup idempotent", async () => {
    const deps = dependencies();
    const resizeError = new Error("resize failed");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await start({ ...deps, reducedMotion: false });
    deps.renderer.resize.mockImplementationOnce(() => {
      throw resizeError;
    });

    window.dispatchEvent(new Event("resize"));
    await vi.advanceTimersByTimeAsync(120);

    expect(deps.stop).toHaveBeenCalledOnce();
    expect(
      deps.portraitStage.classList.contains("portrait-stage--error"),
    ).toBe(true);
    expect(deps.portraitStage.classList.contains("is-error")).toBe(true);
    expect(deps.renderer.resize).toHaveBeenCalledTimes(2);

    cleanup();
    cleanup();
    window.dispatchEvent(new Event("resize"));
    await vi.advanceTimersByTimeAsync(120);
    expect(deps.stop).toHaveBeenCalledOnce();
    expect(deps.renderer.resize).toHaveBeenCalledTimes(2);
  });

  it("stops a timeline returned after its synchronous frame already failed", async () => {
    const deps = dependencies();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    deps.renderer.draw.mockImplementationOnce(() => {
      throw new Error("synchronous frame failed");
    });
    deps.run.mockImplementation((timeline) => {
      timeline.onFrame(0.2);
      return deps.stop;
    });

    await start({ ...deps, reducedMotion: false });

    expect(deps.stop).toHaveBeenCalledOnce();
    expect(
      deps.portraitStage.classList.contains("portrait-stage--error"),
    ).toBe(true);
    cleanup();
    cleanup();
    expect(deps.stop).toHaveBeenCalledOnce();
  });

  it("keeps a black particle-stage fallback when Canvas 2D is unavailable", async () => {
    const {
      canvas,
      portraitBase,
      portraitMask,
      portraitStage,
      portraitError,
    } = elements();
    vi.spyOn(canvas, "getContext").mockReturnValue(null);

    await start({
      canvas,
      portraitBase,
      portraitMask,
      portraitStage,
      portraitError,
    });

    expect(portraitStage.classList.contains("portrait-stage--fallback")).toBe(
      true,
    );
    expect(portraitError.hidden).toBe(false);
    expect(portraitError.textContent).toBe(
      "Portrait visualization unavailable.",
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
    expect(deps.portraitError.hidden).toBe(false);
    expect(deps.portraitError.textContent).toBe(
      "Portrait visualization unavailable.",
    );
    expect(cleanup).toBeTypeOf("function");
    error.mockRestore();
  });

  it("starts both aligned source pixel loads before either resolves", async () => {
    const deps = dependencies();
    const pending: Array<() => void> = [];
    deps.loadPixels.mockImplementation((image: HTMLImageElement) =>
      new Promise((resolve) => {
        pending.push(() =>
          resolve(image === deps.portraitBase ? pixels : maskPixels),
        );
      }),
    );

    const started = start({ ...deps, reducedMotion: true });

    expect(deps.loadPixels).toHaveBeenCalledTimes(2);
    expect(deps.loadPixels).toHaveBeenNthCalledWith(1, deps.portraitBase);
    expect(deps.loadPixels).toHaveBeenNthCalledWith(2, deps.portraitMask);
    pending.forEach((resolve) => resolve());
    await started;
  });

  it("falls back to typography-only mode when mask decoding fails", async () => {
    const deps = dependencies();
    const decodeError = new Error("mask decode failed");
    deps.loadPixels.mockImplementation((image: HTMLImageElement) =>
      image === deps.portraitMask
        ? Promise.reject(decodeError)
        : Promise.resolve(pixels),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await start({ ...deps, reducedMotion: true });

    expect(deps.sample).not.toHaveBeenCalled();
    expect(deps.portraitStage.classList).toContain("portrait-stage--error");
    expect(deps.portraitBase.hidden).toBe(true);
    expect(deps.portraitMask.hidden).toBe(true);
    expect(error).toHaveBeenCalledWith(
      "Portrait initialization failed",
      decodeError,
    );
    error.mockRestore();
  });

  it("rejects portrait masks whose dimensions do not match the source", async () => {
    const deps = dependencies();
    const mismatchedMask = { ...maskPixels, width: 1 };
    deps.loadPixels.mockImplementation((image: HTMLImageElement) =>
      Promise.resolve(image === deps.portraitBase ? pixels : mismatchedMask),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await start({ ...deps, reducedMotion: true });

    expect(deps.sample).not.toHaveBeenCalled();
    expect(error.mock.calls[0]?.[1]).toEqual(
      new Error("Portrait mask dimensions must match source pixels."),
    );
    expect(deps.portraitStage.classList).toContain("portrait-stage--error");
    error.mockRestore();
  });

  it("rejects portrait masks without any visible alpha", async () => {
    const deps = dependencies();
    const transparentMask = {
      ...maskPixels,
      data: new Uint8ClampedArray(maskPixels.data.length),
    };
    deps.loadPixels.mockImplementation((image: HTMLImageElement) =>
      Promise.resolve(image === deps.portraitBase ? pixels : transparentMask),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await start({ ...deps, reducedMotion: true });

    expect(deps.sample).not.toHaveBeenCalled();
    expect(error.mock.calls[0]?.[1]).toEqual(
      new Error("Portrait mask has no visible subject pixels."),
    );
    expect(deps.portraitStage.classList).toContain("portrait-stage--error");
    error.mockRestore();
  });
});
