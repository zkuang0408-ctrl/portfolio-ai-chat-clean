import { describe, expect, it } from "vitest";

import { createRandom, pickSizeBand, spatialNoise } from "./random";
import type { ParticleSizeBand } from "./types";

describe("particle randomness", () => {
  it("replays the same sequence for the same seed", () => {
    const first = createRandom(20260714);
    const second = createRandom(20260714);

    expect([first(), first(), first()]).toEqual([
      second(),
      second(),
      second(),
    ]);
  });

  it("produces distinct bounded sequences for different seeds", () => {
    const first = createRandom(20260714);
    const second = createRandom(20260715);
    const firstSequence = Array.from({ length: 12 }, () => first());
    const secondSequence = Array.from({ length: 12 }, () => second());

    expect(firstSequence).not.toEqual(secondSequence);
    for (const value of [...firstSequence, ...secondSequence]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("weights size bands toward fine particles", () => {
    const random = createRandom(42);
    const counts: Record<ParticleSizeBand, number> = {
      micro: 0,
      medium: 0,
      large: 0,
      splash: 0,
    };

    for (let index = 0; index < 20_000; index += 1) {
      counts[pickSizeBand(random)] += 1;
    }

    expect(Math.abs(counts.micro / 20_000 - 0.65)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(counts.medium / 20_000 - 0.25)).toBeLessThanOrEqual(
      0.01,
    );
    expect(Math.abs(counts.large / 20_000 - 0.08)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(counts.splash / 20_000 - 0.02)).toBeLessThanOrEqual(
      0.01,
    );
  });

  it("produces reproducible spatial noise that changes between cells", () => {
    const value = spatialNoise(12, 18, 9);

    expect(spatialNoise(12, 18, 9)).toBe(value);
    expect(spatialNoise(13, 18, 9)).not.toBe(value);
  });

  it("keeps spatial noise in the normalized range", () => {
    const values = [
      spatialNoise(12, 18, 9),
      spatialNoise(-12, 18, 9),
      spatialNoise(1_000_000, -1_000_000, 9),
    ];

    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
