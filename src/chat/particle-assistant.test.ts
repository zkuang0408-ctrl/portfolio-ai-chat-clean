import { afterEach, expect, test, vi } from "vitest";

import { createParticleField, startParticleAssistant } from "./particle-assistant";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

test("builds a dense spherical shell with a sparse internal particle core", () => {
  const particles = createParticleField();
  const shell = particles.filter((particle) => particle.layer === "shell");
  const core = particles.filter((particle) => particle.layer === "core");

  expect(shell.length).toBeGreaterThanOrEqual(360);
  expect(core.length).toBeGreaterThanOrEqual(72);
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
