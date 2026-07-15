import { describe, expect, it } from "vitest";

import {
  edgeStrength,
  MAX_PARTICLES,
  samplePortrait,
  settledTargetForRegion,
} from "./sampler";
import type { ParticleSizeBand, PixelBuffer } from "./types";

function buffer(width: number, height: number, pixel: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < data.length; index += 4) {
    data[index] = pixel;
    data[index + 1] = pixel;
    data[index + 2] = pixel;
    data[index + 3] = 255;
  }

  return { data, width, height };
}

function setPixel(
  pixels: PixelBuffer,
  x: number,
  y: number,
  value: number,
): void {
  const index = (y * pixels.width + x) * 4;
  pixels.data[index] = value;
  pixels.data[index + 1] = value;
  pixels.data[index + 2] = value;
}

it("amplifies horizontal and vertical luminance edges equally", () => {
  const horizontalEdge = buffer(3, 3, 0);
  const verticalEdge = buffer(3, 3, 0);
  setPixel(horizontalEdge, 2, 1, 51);
  setPixel(verticalEdge, 1, 2, 51);

  expect(edgeStrength(horizontalEdge, 1, 1)).toBeCloseTo(0.36);
  expect(edgeStrength(verticalEdge, 1, 1)).toBeCloseTo(0.36);
});

it("keeps core particles exactly on their sampled landmark coordinates", () => {
  expect(settledTargetForRegion(40, 30, 100, "core", 1, 1)).toEqual([40, 30]);
});

it("caps face displacement while retaining broad edge splashes", () => {
  const face = settledTargetForRegion(40, 30, 100, "face", 1, 1);
  expect(face[0] - 40).toBeCloseTo(-0.6);
  expect(face[1] - 30).toBeCloseTo(0.35);

  const edge = settledTargetForRegion(40, 30, 100, "edge", 1, 1);
  expect(edge[0] - 40).toBeCloseTo(-15);
  expect(edge[1] - 30).toBeCloseTo(6);
});

describe("samplePortrait", () => {
  it("does not sample particles from a black portrait", () => {
    expect(
      samplePortrait(buffer(40, 60, 0), { maxParticles: 500, seed: 1 }),
    ).toHaveLength(0);
  });

  it("floors fractional particle limits and rejects negative limits", () => {
    const pixels = buffer(80, 120, 255);

    expect(samplePortrait(pixels, { maxParticles: 0.5, seed: 8 })).toHaveLength(
      0,
    );
    expect(
      samplePortrait(pixels, { maxParticles: 2.8, seed: 8 }).length,
    ).toBeLessThanOrEqual(2);
    expect(
      samplePortrait(pixels, { maxParticles: -4, seed: 8 }),
    ).toHaveLength(0);
  });

  it("rejects non-finite particle limits", () => {
    const pixels = buffer(80, 120, 255);

    expect(
      samplePortrait(pixels, { maxParticles: Number.POSITIVE_INFINITY, seed: 8 }),
    ).toHaveLength(0);
    expect(
      samplePortrait(pixels, { maxParticles: Number.NaN, seed: 8 }),
    ).toHaveLength(0);
  });

  it("caps excessive particle limits", () => {
    const particles = samplePortrait(buffer(80, 120, 255), {
      maxParticles: MAX_PARTICLES + 1_000,
      seed: 8,
    });

    expect(particles).toHaveLength(MAX_PARTICLES);
  });

  it("is deterministic and fills a useful portion of the particle budget", () => {
    const pixels = buffer(80, 120, 255);
    const options = { maxParticles: 300, seed: 8 };
    const first = samplePortrait(pixels, options);
    const second = samplePortrait(pixels, options);

    expect(first).toEqual(second);
    expect(first.length).toBeLessThanOrEqual(300);
    expect(first.length).toBeGreaterThan(120);
  });

  it.each([7_000, 14_000])(
    "assigns the final %i-particle production budget to exact 65/25/8/2 quotas",
    (maxParticles) => {
      const pixels = buffer(320, 480, 255);
      const options = { maxParticles, seed: 20260714 };
      const first = samplePortrait(pixels, options);
      const second = samplePortrait(pixels, options);
      const counts: Record<ParticleSizeBand, number> = {
        micro: 0,
        medium: 0,
        large: 0,
        splash: 0,
      };

      for (const particle of first) counts[particle.band] += 1;

      expect(first).toHaveLength(maxParticles);
      expect(second).toEqual(first);
      expect(counts).toEqual({
        micro: maxParticles * 0.65,
        medium: maxParticles * 0.25,
        large: maxParticles * 0.08,
        splash: maxParticles * 0.02,
      });
      expect(
        first.filter(
          ({ band, region }) =>
            region === "core" && (band === "large" || band === "splash"),
        ),
      ).toHaveLength(0);
      expect(
        first.filter(
          ({ band, region }) => region === "face" && band === "splash",
        ),
      ).toHaveLength(0);
    },
  );

  it("keeps large and splash particles out of the facial core", () => {
    const particles = samplePortrait(buffer(100, 150, 255), {
      maxParticles: 1_000,
      seed: 12,
    });
    const oversizedCoreParticles = particles.filter(
      ({ band, region }) =>
        region === "core" && (band === "large" || band === "splash"),
    );

    expect(oversizedCoreParticles).toHaveLength(0);
  });

  it("reserves micro particles for strong edges in the facial core", () => {
    const pixels = buffer(120, 180, 190);
    for (let x = 42; x <= 52; x += 1) setPixel(pixels, x, 54, 8);
    for (let x = 68; x <= 78; x += 1) setPixel(pixels, x, 54, 8);
    for (let y = 58; y <= 78; y += 1) setPixel(pixels, 60, y, 12);
    for (let x = 50; x <= 70; x += 1) setPixel(pixels, x, 86, 10);

    const particles = samplePortrait(pixels, {
      maxParticles: 3_000,
      seed: 20260714,
    });
    const strongCoreEdges = particles.filter(
      (particle) =>
        particle.region === "core" &&
        edgeStrength(pixels, particle.targetX, particle.targetY) >= 0.18,
    );

    expect(strongCoreEdges.length).toBeGreaterThan(20);
    expect(new Set(strongCoreEdges.map(({ band }) => band))).toEqual(
      new Set(["micro"]),
    );
  });

  it("leaves spatial cells empty between populated particle clusters", () => {
    const width = 80;
    const height = 120;
    const particles = samplePortrait(buffer(width, height, 255), {
      maxParticles: 1_000,
      seed: 2,
    });
    const occupiedCells = new Set(
      particles
        .filter(
          ({ targetX, targetY }) =>
            targetX >= 0 &&
            targetX < width &&
            targetY >= 0 &&
            targetY < height,
        )
        .map(
          ({ targetX, targetY }) =>
            `${Math.floor(targetX / 9)},${Math.floor(targetY / 9)}`,
        ),
    );
    const totalCells = Math.ceil(width / 9) * Math.ceil(height / 9);
    const emptyCells = totalCells - occupiedCells.size;

    expect(occupiedCells.size).toBeGreaterThan(100);
    expect(emptyCells).toBeGreaterThanOrEqual(8);
  });

  it("changes samples with the seed while keeping visual values bounded", () => {
    const pixels = buffer(80, 120, 255);
    const first = samplePortrait(pixels, { maxParticles: 300, seed: 4 });
    const second = samplePortrait(pixels, { maxParticles: 300, seed: 5 });

    expect(first).not.toEqual(second);
    for (const particle of [...first, ...second]) {
      for (const value of [
        particle.targetX,
        particle.targetY,
        particle.startX,
        particle.startY,
        particle.tone,
        particle.alpha,
        particle.radius,
        particle.stretch,
        particle.delay,
      ]) {
        expect(Number.isFinite(value)).toBe(true);
      }
      expect(particle.tone).toBeGreaterThanOrEqual(150);
      expect(particle.tone).toBeLessThanOrEqual(255);
      expect(particle.alpha).toBeGreaterThanOrEqual(0);
      expect(particle.alpha).toBeLessThanOrEqual(0.96);
      expect(particle.radius).toBeGreaterThanOrEqual(0.45);
      expect(particle.radius).toBeLessThanOrEqual(7.5);
      expect(particle.stretch).toBeGreaterThanOrEqual(0.82);
      expect(particle.stretch).toBeLessThanOrEqual(1.55);
      expect(particle.delay).toBeGreaterThanOrEqual(0.1);
      expect(particle.delay).toBeLessThanOrEqual(0.72);
    }
  });
});
