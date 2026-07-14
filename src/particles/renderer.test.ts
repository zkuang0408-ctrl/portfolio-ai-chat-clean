import { describe, expect, it, vi } from "vitest";

import { ParticleRenderer } from "./renderer";
import type { Particle } from "./types";

const particle: Particle = {
  targetX: 50,
  targetY: 60,
  startX: -40,
  startY: 10,
  radius: 1,
  alpha: 0.8,
  tone: 230,
  stretch: 1.2,
  delay: 0.1,
  band: "micro",
  region: "core",
};

function createRenderer() {
  const canvas = { width: 0, height: 0 };
  const context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    fillStyle: "",
    globalAlpha: 1,
  };
  const renderer = new ParticleRenderer(
    canvas as HTMLCanvasElement,
    context as unknown as CanvasRenderingContext2D,
  );

  return { canvas, context, renderer };
}

describe("ParticleRenderer", () => {
  it("caps the backing-store DPR at two", () => {
    const { canvas, context, renderer } = createRenderer();

    renderer.resize(400, 300, 3);

    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it("contains and centers the completed portrait in the canvas", () => {
    const { context, renderer } = createRenderer();
    renderer.resize(400, 300, 1);

    renderer.draw([particle], 1, { width: 100, height: 120 });

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 400, 300);
    expect(context.beginPath).toHaveBeenCalledTimes(1);
    expect(context.ellipse).toHaveBeenCalledWith(
      200,
      150,
      3,
      2.5,
      0,
      0,
      Math.PI * 2,
    );
    expect(context.fillStyle).toBe("rgb(230 230 230)");
    expect(context.fill).toHaveBeenCalledTimes(1);
    expect(context.globalAlpha).toBe(1);
  });

  it("clears but does not draw a particle before its delayed entrance", () => {
    const { context, renderer } = createRenderer();
    renderer.resize(400, 300, 1);

    renderer.draw([particle], 0, { width: 100, height: 120 });

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 400, 300);
    expect(context.beginPath).not.toHaveBeenCalled();
    expect(context.ellipse).not.toHaveBeenCalled();
    expect(context.fill).not.toHaveBeenCalled();
    expect(context.globalAlpha).toBe(1);
  });

  it("interpolates position, size, and alpha with particle progress", () => {
    const { context, renderer } = createRenderer();
    renderer.resize(100, 120, 1);

    renderer.draw([particle], 0.55, { width: 100, height: 120 });

    const progress = 0.96875;
    const radius = 0.55 + progress * 0.45;
    const ellipseCall = context.ellipse.mock.calls[0];
    expect(ellipseCall?.[0]).toBeCloseTo(-40 + (50 - -40) * progress);
    expect(ellipseCall?.[1]).toBeCloseTo(10 + (60 - 10) * progress);
    expect(ellipseCall?.[2]).toBeCloseTo(radius * 1.2);
    expect(ellipseCall?.[3]).toBeCloseTo(radius);
    expect(ellipseCall?.slice(4)).toEqual([0, 0, Math.PI * 2]);
    expect(context.fill).toHaveBeenCalledTimes(1);
    expect(context.globalAlpha).toBe(1);
  });
});
