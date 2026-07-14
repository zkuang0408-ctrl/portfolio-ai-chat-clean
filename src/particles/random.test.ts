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

    expect(counts.micro / 20_000).toBeCloseTo(0.65, 1);
    expect(counts.medium / 20_000).toBeCloseTo(0.25, 1);
    expect(counts.large / 20_000).toBeCloseTo(0.08, 1);
    expect(counts.splash / 20_000).toBeCloseTo(0.02, 1);
  });

  it("produces reproducible spatial noise that changes between cells", () => {
    const value = spatialNoise(12, 18, 9);

    expect(spatialNoise(12, 18, 9)).toBe(value);
    expect(spatialNoise(13, 18, 9)).not.toBe(value);
  });
});
