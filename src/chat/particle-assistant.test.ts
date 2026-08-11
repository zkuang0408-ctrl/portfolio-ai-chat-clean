import { afterEach, expect, test, vi } from "vitest";

import {
  createParticleField,
  startParticleAssistant,
} from "./particle-assistant";

const originalInnerWidthDescriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");
const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");

function fakeContext() {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    setTransform: vi.fn(),
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
}

afterEach(() => {
  document.body.innerHTML = "";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  if (originalInnerWidthDescriptor) {
    Object.defineProperty(window, "innerWidth", originalInnerWidthDescriptor);
  }
  if (originalMatchMediaDescriptor) {
    Object.defineProperty(window, "matchMedia", originalMatchMediaDescriptor);
  } else {
    Reflect.deleteProperty(window, "matchMedia");
  }
  vi.restoreAllMocks();
});

test("builds a dense spherical shell with a sparse internal particle core", () => {
  const particles = createParticleField();
  const shell = particles.filter((particle) => particle.layer === "shell");
  const core = particles.filter((particle) => particle.layer === "core");

  expect(shell.length).toBeGreaterThanOrEqual(1_200);
  expect(core.length).toBeGreaterThanOrEqual(160);
  expect(
    shell.filter((particle) => Math.abs(particle.y) > 0.7).length / shell.length,
  ).toBeGreaterThan(0.42);
  expect(shell.every((particle) => Math.hypot(particle.x, particle.y, particle.z) > 0.98)).toBe(true);
  expect(core.every((particle) => Math.hypot(particle.x, particle.y, particle.z) < 0.82)).toBe(true);
});

test("keeps the semantic guide available when Canvas cannot be drawn", () => {
  const root = document.createElement("aside");
  const canvas = document.createElement("canvas");
  root.append(canvas);
  document.body.append(root);
  vi.spyOn(canvas, "getContext").mockReturnValue(null);

  const stop = startParticleAssistant({ root, canvas, window });

  expect(root.dataset.chatParticles).toBe("fallback");
  stop();
});

test("marks a usable decorative particle layer ready and cleans up its frame", () => {
  const root = document.createElement("aside");
  const canvas = document.createElement("canvas");
  root.append(canvas);
  document.body.append(root);
  const context = { clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), setTransform: vi.fn(), fillStyle: "" } as unknown as CanvasRenderingContext2D;
  vi.spyOn(canvas, "getContext").mockReturnValue(context);
  const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  const cancelAnimationFrame = vi.spyOn(window, "cancelAnimationFrame");

  const stop = startParticleAssistant({ root, canvas, window });

  expect(root.dataset.chatParticles).toBe("ready");
  expect(requestAnimationFrame).toHaveBeenCalled();
  stop();
  expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
});

test("resizes the particle canvas when the guide collapses into the smaller ball", async () => {
  const root = document.createElement("aside");
  root.dataset.chatPresentation = "guide";
  const canvas = document.createElement("canvas");
  root.append(canvas);
  document.body.append(root);
  const context = { clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), setTransform: vi.fn(), fillStyle: "" } as unknown as CanvasRenderingContext2D;
  vi.spyOn(canvas, "getContext").mockReturnValue(context);
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);

  const stop = startParticleAssistant({ root, canvas, window });
  const initialResizeCalls = context.setTransform as unknown as ReturnType<typeof vi.fn>;
  const initialCallCount = initialResizeCalls.mock.calls.length;
  root.dataset.chatPresentation = "collapsed";
  await Promise.resolve();

  expect(initialResizeCalls.mock.calls.length).toBeGreaterThan(initialCallCount);
  stop();
});

test("keeps a matching particle layer alive in the expanded header anchor", async () => {
  const root = document.createElement("aside");
  root.dataset.chatPresentation = "expanded";
  const canvas = document.createElement("canvas");
  const headerCanvas = document.createElement("canvas");
  root.append(canvas, headerCanvas);
  document.body.append(root);
  const context = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    setTransform: vi.fn(),
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(canvas, "getContext").mockReturnValue(context);
  vi.spyOn(headerCanvas, "getContext").mockReturnValue(context);
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);

  const stop = startParticleAssistant({ root, canvas, headerCanvas, window });

  expect(root.dataset.chatParticles).toBe("ready");
  expect((context.setTransform as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
  stop();
  await Promise.resolve();
});

test("draws only the particle canvas visible in the current presentation", () => {
  const root = document.createElement("aside");
  root.dataset.chatPresentation = "expanded";
  const canvas = document.createElement("canvas");
  const headerCanvas = document.createElement("canvas");
  root.append(canvas, headerCanvas);
  document.body.append(root);
  const mainContext = fakeContext();
  const headerContext = fakeContext();
  vi.spyOn(canvas, "getContext").mockReturnValue(mainContext);
  vi.spyOn(headerCanvas, "getContext").mockReturnValue(headerContext);
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });

  const stop = startParticleAssistant({ root, canvas, headerCanvas, window });
  frames.shift()?.(0);
  expect((mainContext.arc as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  expect((headerContext.arc as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalled();

  const headerDrawCount = (headerContext.arc as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
  root.dataset.chatPresentation = "collapsed";
  frames.shift()?.(40);
  expect((mainContext.arc as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  expect((headerContext.arc as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(
    headerDrawCount,
  );
  stop();
});

test("draws the header sphere as the compact guide cue only on mobile", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  const root = document.createElement("aside");
  root.dataset.chatPresentation = "guide";
  const canvas = document.createElement("canvas");
  const headerCanvas = document.createElement("canvas");
  const mainContext = fakeContext();
  const headerContext = fakeContext();
  vi.spyOn(canvas, "getContext").mockReturnValue(mainContext);
  vi.spyOn(headerCanvas, "getContext").mockReturnValue(headerContext);
  root.append(canvas, headerCanvas);
  document.body.append(root);
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });

  const stop = startParticleAssistant({ root, canvas, headerCanvas, window });
  frames.shift()?.(0);

  expect(headerContext.arc).toHaveBeenCalled();
  expect(mainContext.arc).not.toHaveBeenCalled();
  stop();
});

test("keeps drawing the main particle canvas in the desktop guide", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
  const root = document.createElement("aside");
  root.dataset.chatPresentation = "guide";
  const canvas = document.createElement("canvas");
  const headerCanvas = document.createElement("canvas");
  const mainContext = fakeContext();
  const headerContext = fakeContext();
  vi.spyOn(canvas, "getContext").mockReturnValue(mainContext);
  vi.spyOn(headerCanvas, "getContext").mockReturnValue(headerContext);
  root.append(canvas, headerCanvas);
  document.body.append(root);
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });

  const stop = startParticleAssistant({ root, canvas, headerCanvas, window });
  frames.shift()?.(0);

  expect(mainContext.arc).toHaveBeenCalled();
  expect(headerContext.arc).not.toHaveBeenCalled();
  stop();
});

test("redraws the compact guide cue after a reduced-motion resize crosses the mobile breakpoint", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as MediaQueryList),
  });
  const root = document.createElement("aside");
  root.dataset.chatPresentation = "guide";
  const canvas = document.createElement("canvas");
  const headerCanvas = document.createElement("canvas");
  const mainContext = fakeContext();
  const headerContext = fakeContext();
  vi.spyOn(canvas, "getContext").mockReturnValue(mainContext);
  vi.spyOn(headerCanvas, "getContext").mockReturnValue(headerContext);
  root.append(canvas, headerCanvas);
  document.body.append(root);

  const stop = startParticleAssistant({ root, canvas, headerCanvas, window });

  expect(mainContext.arc).toHaveBeenCalled();
  expect(headerContext.arc).not.toHaveBeenCalled();

  vi.mocked(mainContext.arc).mockClear();
  vi.mocked(headerContext.arc).mockClear();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  window.dispatchEvent(new Event("resize"));

  expect(headerContext.arc).toHaveBeenCalled();
  expect(mainContext.arc).not.toHaveBeenCalled();
  stop();
});

test("falls back to the main canvas when the mobile guide header context is unavailable", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  const root = document.createElement("aside");
  root.dataset.chatPresentation = "guide";
  const canvas = document.createElement("canvas");
  const headerCanvas = document.createElement("canvas");
  const mainContext = fakeContext();
  vi.spyOn(canvas, "getContext").mockReturnValue(mainContext);
  vi.spyOn(headerCanvas, "getContext").mockReturnValue(null);
  root.append(canvas, headerCanvas);
  document.body.append(root);
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });

  const stop = startParticleAssistant({ root, canvas, headerCanvas, window });
  frames.shift()?.(0);

  expect(mainContext.arc).toHaveBeenCalled();
  stop();
});

test("limits animated particle drawing to about thirty frames per second", () => {
  const root = document.createElement("aside");
  root.dataset.chatPresentation = "collapsed";
  const canvas = document.createElement("canvas");
  root.append(canvas);
  document.body.append(root);
  const context = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    setTransform: vi.fn(),
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(canvas, "getContext").mockReturnValue(context);
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });

  const stop = startParticleAssistant({ root, canvas, window });
  frames.shift()?.(0);
  const firstDrawCount = (context.arc as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
  frames.shift()?.(16);
  expect((context.arc as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(
    firstDrawCount,
  );
  frames.shift()?.(34);
  expect((context.arc as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
    firstDrawCount,
  );
  stop();
});

test("caps assistant canvas resolution for animated particle rendering", () => {
  const root = document.createElement("aside");
  root.dataset.chatPresentation = "collapsed";
  const canvas = document.createElement("canvas");
  root.append(canvas);
  document.body.append(root);
  const context = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    setTransform: vi.fn(),
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(canvas, "getContext").mockReturnValue(context);
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    value: 2,
  });

  const stop = startParticleAssistant({ root, canvas, window });

  expect((context.setTransform as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(1.5);
  stop();
});

test("does not schedule animated frames while the document is hidden", () => {
  const root = document.createElement("aside");
  root.dataset.chatPresentation = "expanded";
  const canvas = document.createElement("canvas");
  root.append(canvas);
  document.body.append(root);
  const context = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    setTransform: vi.fn(),
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(canvas, "getContext").mockReturnValue(context);
  const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "hidden",
  });

  const stop = startParticleAssistant({ root, canvas, window });

  expect(requestAnimationFrame).not.toHaveBeenCalled();
  stop();
});
