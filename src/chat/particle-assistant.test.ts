import { afterEach, expect, test, vi } from "vitest";

import { startParticleAssistant } from "./particle-assistant";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
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
