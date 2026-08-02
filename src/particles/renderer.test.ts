import { describe, expect, it, vi } from "vitest";

import * as rendererModule from "./renderer";
import { portraitCompositionFor } from "./renderer";
import type { Particle } from "./types";

const { ParticleRenderer } = rendererModule;

const portraitSource = { width: 1_104, height: 1_425 };
const portraitLandmarks = {
  hairTop: { x: 552, y: 143 },
  glassesLeft: { x: 360, y: 485 },
  glassesRight: { x: 744, y: 485 },
  chin: { x: 552, y: 855 },
  lowerClothing: { x: 552, y: 1_425 },
};

function composedPoint(
  point: { x: number; y: number },
  composition: { scale: number; offsetX: number; offsetY: number },
) {
  return {
    x: composition.offsetX + point.x * composition.scale,
    y: composition.offsetY + point.y * composition.scale,
  };
}

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
  depth: 0.9,
};

function createRenderer(maxDrawParticles?: number) {
  const canvas = { width: 0, height: 0 };
  const fillStates: Array<{ alpha: number; fillStyle: string }> = [];
  const context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillStyle: "",
    globalAlpha: 1,
  };
  context.fill.mockImplementation(() => {
    fillStates.push({
      alpha: context.globalAlpha,
      fillStyle: context.fillStyle,
    });
  });
  const renderer = new ParticleRenderer(
    canvas as HTMLCanvasElement,
    context as unknown as CanvasRenderingContext2D,
    maxDrawParticles,
  );

  return { canvas, context, fillStates, renderer };
}

describe("ParticleRenderer", () => {
  it("exports a safe default draw limit", () => {
    expect(rendererModule.DEFAULT_MAX_DRAW_PARTICLES).toBe(16_000);
  });

  it("does not export the obsolete contain-position constant", () => {
    expect(rendererModule).not.toHaveProperty("DEFAULT_PORTRAIT_POSITION_Y");
  });

  it("caps the backing-store DPR at two", () => {
    const { canvas, context, renderer } = createRenderer();

    renderer.resize(400, 300, 3);

    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it.each([
    { width: Number.NaN, height: 300, canvasWidth: 1, canvasHeight: 300 },
    { width: Number.POSITIVE_INFINITY, height: 300, canvasWidth: 1, canvasHeight: 300 },
    { width: 0, height: 300, canvasWidth: 1, canvasHeight: 300 },
    { width: -10, height: 300, canvasWidth: 1, canvasHeight: 300 },
    { width: 400, height: Number.NaN, canvasWidth: 400, canvasHeight: 1 },
    { width: 400, height: Number.POSITIVE_INFINITY, canvasWidth: 400, canvasHeight: 1 },
    { width: 400, height: 0, canvasWidth: 400, canvasHeight: 1 },
    { width: 400, height: -10, canvasWidth: 400, canvasHeight: 1 },
  ])(
    "normalizes invalid resize dimensions $width x $height",
    ({ width, height, canvasWidth, canvasHeight }) => {
      const { canvas, context, renderer } = createRenderer();

      renderer.resize(width, height, 1);

      expect(canvas.width).toBe(canvasWidth);
      expect(canvas.height).toBe(canvasHeight);
      expect(context.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    },
  );

  it.each([
    { devicePixelRatio: Number.NaN, expected: 1 },
    { devicePixelRatio: Number.POSITIVE_INFINITY, expected: 1 },
    { devicePixelRatio: 0, expected: 1 },
    { devicePixelRatio: -2, expected: 1 },
    { devicePixelRatio: 1.5, expected: 1.5 },
    { devicePixelRatio: 3, expected: 2 },
  ])(
    "normalizes device pixel ratio $devicePixelRatio to $expected",
    ({ devicePixelRatio, expected }) => {
      const { canvas, context, renderer } = createRenderer();

      renderer.resize(400, 300, devicePixelRatio);

      expect(canvas.width).toBe(Math.round(400 * expected));
      expect(canvas.height).toBe(Math.round(300 * expected));
      expect(context.setTransform).toHaveBeenCalledWith(
        expected,
        0,
        0,
        expected,
        0,
        0,
      );
    },
  );

  it.each([
    {
      name: "desktop",
      width: 1_440,
      height: 836,
      expectedScale: (1_440 / 1_104) * 0.7,
      expectedOffsetY: 836 * 0.11 - 1_425 * 0.13 * ((1_440 / 1_104) * 0.7),
      clothingCrossesBottom: true,
    },
    {
      name: "mobile portrait",
      width: 390,
      height: 722,
      expectedScale: (722 / 1_425) * 0.78,
      expectedOffsetY: 722 * 0.11 - 1_425 * 0.13 * ((722 / 1_425) * 0.78),
      clothingCrossesBottom: false,
    },
    {
      name: "short mobile landscape",
      width: 667,
      height: 375,
      expectedScale: (667 / 1_104) * 0.78,
      expectedOffsetY: 375 * 0.11 - 1_425 * 0.13 * ((667 / 1_104) * 0.78),
      clothingCrossesBottom: true,
    },
  ])(
    "centers and crops the portrait for $name at $width x $height",
    ({ width, height, expectedScale, expectedOffsetY, clothingCrossesBottom }) => {
      const composition = portraitCompositionFor(width, height, portraitSource);
      const hairTop = composedPoint(portraitLandmarks.hairTop, composition);
      const glassesLeft = composedPoint(portraitLandmarks.glassesLeft, composition);
      const glassesRight = composedPoint(portraitLandmarks.glassesRight, composition);
      const chin = composedPoint(portraitLandmarks.chin, composition);
      const lowerClothing = composedPoint(portraitLandmarks.lowerClothing, composition);

      expect(composition.scale).toBeCloseTo(expectedScale);
      expect(composition.offsetX).toBeCloseTo(
        (width - portraitSource.width * expectedScale) / 2,
      );
      expect(composition.offsetY).toBeCloseTo(expectedOffsetY);
      expect(hairTop.y).toBeGreaterThanOrEqual(0);
      expect(chin.y).toBeLessThan(height);
      expect(Math.abs((glassesLeft.x + glassesRight.x) / 2 - width / 2))
        .toBeLessThanOrEqual(1);
      expect(lowerClothing.y > height).toBe(clothingCrossesBottom);
      if (width === 390) expect(composition.scale).toBeGreaterThan(0.38);
    },
  );

  it("uses the viewport composition when drawing the completed portrait", () => {
    const { context, fillStates, renderer } = createRenderer();
    renderer.resize(400, 300, 1);

    renderer.draw([particle], 1, { width: 100, height: 120 });

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 400, 300);
    expect(context.beginPath).toHaveBeenCalledTimes(1);
    const ellipseCall = context.ellipse.mock.calls[0];
    expect(ellipseCall?.[0]).toBeCloseTo(200);
    expect(ellipseCall?.[1]).toBeCloseTo(171.528);
    expect(ellipseCall?.[2]).toBeCloseTo(3.744);
    expect(ellipseCall?.[3]).toBeCloseTo(3.12);
    expect(ellipseCall?.slice(4)).toEqual([0, 0, Math.PI * 2]);
    expect(context.fill).toHaveBeenCalledTimes(1);
    expect(fillStates).toEqual([
      { alpha: 0.8, fillStyle: "rgb(230 230 230)" },
    ]);
    expect(context.save).toHaveBeenCalledTimes(1);
    expect(context.restore).toHaveBeenCalledTimes(1);
    expect(context.fillStyle).toBe("");
    expect(context.globalAlpha).toBe(1);
  });

  it("applies restrained parallax in proportion to particle depth", () => {
    const { context, renderer } = createRenderer();
    renderer.resize(100, 120, 1);

    renderer.draw([particle], 1, { width: 100, height: 120 }, { x: 4, y: -2 });

    const ellipseCall = context.ellipse.mock.calls[0];
    expect(ellipseCall?.[0]).toBeCloseTo(50 + 4 * particle.depth);
    expect(ellipseCall?.[1]).toBeCloseTo(62.04 - 2 * particle.depth);
  });

  it("keeps portrait composition consistent when the viewport is tall", () => {
    const { context, renderer } = createRenderer();
    renderer.resize(200, 500, 1);

    renderer.draw([particle], 1, { width: 100, height: 100 });

    const ellipseCall = context.ellipse.mock.calls[0];
    expect(ellipseCall?.[0]).toBeCloseTo(100);
    expect(ellipseCall?.[1]).toBeCloseTo(238.3);
    expect(ellipseCall?.[2]).toBeCloseTo(4.68);
    expect(ellipseCall?.[3]).toBeCloseTo(3.9);
    expect(ellipseCall?.slice(4)).toEqual([0, 0, Math.PI * 2]);
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

  it.each([
    { width: 0, height: 120 },
    { width: -1, height: 120 },
    { width: Number.NaN, height: 120 },
    { width: Number.POSITIVE_INFINITY, height: 120 },
    { width: 100, height: 0 },
    { width: 100, height: -1 },
    { width: 100, height: Number.NaN },
    { width: 100, height: Number.POSITIVE_INFINITY },
  ])("clears without drawing for invalid source size $width x $height", (source) => {
    const { context, renderer } = createRenderer();
    renderer.resize(400, 300, 1);

    renderer.draw([particle], 1, source);

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 400, 300);
    expect(context.ellipse).not.toHaveBeenCalled();
    expect(context.fill).not.toHaveBeenCalled();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "clears without drawing for invalid global progress %s",
    (globalProgress) => {
      const { context, renderer } = createRenderer();
      renderer.resize(400, 300, 1);

      renderer.draw([particle], globalProgress, { width: 100, height: 120 });

      expect(context.clearRect).toHaveBeenCalledWith(0, 0, 400, 300);
      expect(context.ellipse).not.toHaveBeenCalled();
      expect(context.fill).not.toHaveBeenCalled();
    },
  );

  it("skips invalid particles and clamps valid fill state", () => {
    const { context, fillStates, renderer } = createRenderer();
    const invalidParticles: Particle[] = [
      { ...particle, targetX: Number.NaN },
      { ...particle, targetY: Number.POSITIVE_INFINITY },
      { ...particle, startX: Number.NEGATIVE_INFINITY },
      { ...particle, startY: Number.NaN },
      { ...particle, radius: Number.NaN },
      { ...particle, radius: 0 },
      { ...particle, alpha: Number.POSITIVE_INFINITY },
      { ...particle, tone: Number.NaN },
      { ...particle, stretch: Number.POSITIVE_INFINITY },
      { ...particle, stretch: 0 },
      { ...particle, delay: Number.NaN },
    ];
    const validParticle = { ...particle, alpha: 2, tone: 300.6 };
    renderer.resize(100, 120, 1);

    renderer.draw([...invalidParticles, validParticle], 1, {
      width: 100,
      height: 120,
    });

    expect(context.ellipse).toHaveBeenCalledTimes(1);
    expect(context.fill).toHaveBeenCalledTimes(1);
    expect(fillStates).toEqual([
      { alpha: 1, fillStyle: "rgb(255 255 255)" },
    ]);
  });

  it("clamps negative alpha and tone at fill time", () => {
    const { fillStates, renderer } = createRenderer();
    renderer.resize(100, 120, 1);

    renderer.draw([{ ...particle, alpha: -1, tone: -1.6 }], 1, {
      width: 100,
      height: 120,
    });

    expect(fillStates).toEqual([{ alpha: 0, fillStyle: "rgb(0 0 0)" }]);
  });

  it("draws no more particles than the configured limit", () => {
    const { context, renderer } = createRenderer(2);
    renderer.resize(100, 120, 1);

    renderer.draw([particle, { ...particle }, { ...particle }], 1, {
      width: 100,
      height: 120,
    });

    expect(context.ellipse).toHaveBeenCalledTimes(2);
    expect(context.fill).toHaveBeenCalledTimes(2);
  });

  it.each([
    { maxDrawParticles: -1, expectedFills: 0 },
    { maxDrawParticles: 0.5, expectedFills: 0 },
    { maxDrawParticles: 2.9, expectedFills: 2 },
    { maxDrawParticles: Number.NaN, expectedFills: 0 },
    { maxDrawParticles: Number.POSITIVE_INFINITY, expectedFills: 0 },
  ])(
    "normalizes draw limit $maxDrawParticles to $expectedFills fills",
    ({ maxDrawParticles, expectedFills }) => {
      const { context, renderer } = createRenderer(maxDrawParticles);
      renderer.resize(100, 120, 1);

      renderer.draw([particle, { ...particle }, { ...particle }], 1, {
        width: 100,
        height: 120,
      });

      expect(context.fill).toHaveBeenCalledTimes(expectedFills);
    },
  );

  it("restores prior canvas state when fill throws", () => {
    const { context, renderer } = createRenderer();
    const fillError = new Error("fill failed");
    context.globalAlpha = 0.35;
    context.fillStyle = "hotpink";
    context.fill.mockImplementationOnce(() => {
      throw fillError;
    });
    renderer.resize(100, 120, 1);

    expect(() =>
      renderer.draw([particle], 1, { width: 100, height: 120 }),
    ).toThrow(fillError);

    expect(context.save).toHaveBeenCalledTimes(1);
    expect(context.restore).toHaveBeenCalledTimes(1);
    expect(context.globalAlpha).toBe(0.35);
    expect(context.fillStyle).toBe("hotpink");
  });

  it("interpolates position, size, and alpha with particle progress", () => {
    const { context, fillStates, renderer } = createRenderer();
    renderer.resize(100, 120, 1);

    renderer.draw([particle], 0.55, { width: 100, height: 120 });

    const progress = 0.96875;
    const scale = 1.1;
    const radius = scale * (0.55 + progress * 0.45);
    const ellipseCall = context.ellipse.mock.calls[0];
    expect(ellipseCall?.[0]).toBeCloseTo(
      -5 + (-40 + (50 - -40) * progress) * scale,
    );
    expect(ellipseCall?.[1]).toBeCloseTo(
      -3.96 + (10 + (60 - 10) * progress) * scale,
    );
    expect(ellipseCall?.[2]).toBeCloseTo(radius * 1.2);
    expect(ellipseCall?.[3]).toBeCloseTo(radius);
    expect(ellipseCall?.slice(4)).toEqual([0, 0, Math.PI * 2]);
    expect(context.fill).toHaveBeenCalledTimes(1);
    expect(fillStates[0]?.alpha).toBeCloseTo(0.8 * progress);
    expect(context.globalAlpha).toBe(1);
  });
});
