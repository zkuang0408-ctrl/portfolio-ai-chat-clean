import { describe, expect, it } from "vitest";

import { samplePortrait } from "./sampler";
import type { PixelBuffer } from "./types";

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

describe("samplePortrait", () => {
  it("does not sample particles from a black portrait", () => {
    expect(
      samplePortrait(buffer(40, 60, 0), { maxParticles: 500, seed: 1 }),
    ).toHaveLength(0);
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

  it("samples sparse target coordinates instead of covering the pixel grid", () => {
    const width = 80;
    const height = 120;
    const particles = samplePortrait(buffer(width, height, 255), {
      maxParticles: 600,
      seed: 2,
    });
    const occupiedCoordinates = new Set(
      particles.map(
        ({ targetX, targetY }) => `${Math.round(targetX)},${Math.round(targetY)}`,
      ),
    );

    expect(occupiedCoordinates.size).toBeLessThan(width * height * 0.25);
  });

  it("changes samples with the seed while keeping visual values bounded", () => {
    const pixels = buffer(80, 120, 255);
    const first = samplePortrait(pixels, { maxParticles: 300, seed: 4 });
    const second = samplePortrait(pixels, { maxParticles: 300, seed: 5 });

    expect(first).not.toEqual(second);
    for (const particle of [...first, ...second]) {
      expect(Number.isFinite(particle.tone)).toBe(true);
      expect(Number.isFinite(particle.alpha)).toBe(true);
      expect(Number.isFinite(particle.radius)).toBe(true);
      expect(particle.tone).toBeGreaterThanOrEqual(150);
      expect(particle.tone).toBeLessThanOrEqual(255);
      expect(particle.alpha).toBeGreaterThanOrEqual(0);
      expect(particle.alpha).toBeLessThanOrEqual(0.96);
      expect(particle.radius).toBeGreaterThanOrEqual(0.45);
      expect(particle.radius).toBeLessThanOrEqual(7.5);
    }
  });
});
