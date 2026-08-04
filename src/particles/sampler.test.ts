import { describe, expect, it } from "vitest";

import {
  edgeStrength,
  hasFeasibleParticleSizeQuotas,
  invertPortraitLuminance,
  isLargeParticleEligible,
  MAX_PARTICLES,
  particleAcceptance,
  radiusByBand,
  samplePortrait,
  settledTargetForRegion,
  visualForRegion,
  visualForSample,
} from "./sampler";
import type {
  Particle,
  ParticleRegion,
  ParticleSizeBand,
  PixelBuffer,
} from "./types";

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

function setAlpha(
  pixels: PixelBuffer,
  x: number,
  y: number,
  value: number,
): void {
  pixels.data[(y * pixels.width + x) * 4 + 3] = value;
}

function isMaskAccepted(mask: PixelBuffer, x: number, y: number): boolean {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    y < 0 ||
    x >= mask.width ||
    y >= mask.height
  ) {
    return false;
  }

  const alphaIndex =
    (Math.floor(y) * mask.width + Math.floor(x)) * 4 + 3;
  return (mask.data[alphaIndex] ?? 0) > 0;
}

function fixtureRegionAtPixel(
  x: number,
  y: number,
  width: number,
  height: number,
): ParticleRegion {
  const normalizedX = (x + 0.5) / width;
  const normalizedY = (y + 0.5) / height;
  const inside = (
    centerX: number,
    centerY: number,
    radiusX: number,
    radiusY: number,
  ): boolean => {
    const ellipseX = (normalizedX - centerX) / radiusX;
    const ellipseY = (normalizedY - centerY) / radiusY;
    return ellipseX * ellipseX + ellipseY * ellipseY <= 1;
  };

  if (inside(0.5, 0.34, 0.19, 0.23)) return "core";
  if (inside(0.5, 0.39, 0.3, 0.34)) return "face";
  return "edge";
}

function bandCounts(particles: Particle[]): Record<ParticleSizeBand, number> {
  const counts: Record<ParticleSizeBand, number> = {
    micro: 0,
    medium: 0,
    large: 0,
    splash: 0,
  };

  for (const particle of particles) counts[particle.band] += 1;
  return counts;
}

it("amplifies horizontal and vertical luminance edges equally", () => {
  const horizontalEdge = buffer(3, 3, 0);
  const verticalEdge = buffer(3, 3, 0);
  setPixel(horizontalEdge, 2, 1, 51);
  setPixel(verticalEdge, 1, 2, 51);

  expect(edgeStrength(horizontalEdge, 1, 1)).toBeCloseTo(0.36);
  expect(edgeStrength(verticalEdge, 1, 1)).toBeCloseTo(0.36);
});

it("inverts source luminance before portrait acceptance and visual mapping", () => {
  const darkSource = invertPortraitLuminance(0.1);
  const brightSource = invertPortraitLuminance(0.9);

  expect(darkSource).toBeCloseTo(0.9);
  expect(brightSource).toBeCloseTo(0.1);
  expect(particleAcceptance(darkSource, 0, 1, "face")).toBeGreaterThan(
    particleAcceptance(brightSource, 0, 1, "face"),
  );

  const darkVisual = visualForSample(darkSource, "face", 0.5, 0);
  const brightVisual = visualForSample(brightSource, "face", 0.5, 0);
  expect(darkVisual.alpha).toBeGreaterThan(brightVisual.alpha);
  expect(darkVisual.tone).toBeGreaterThan(brightVisual.tone);
});

it("keeps inverted portrait luminance inside the normalized range", () => {
  expect(invertPortraitLuminance(-1)).toBe(1);
  expect(invertPortraitLuminance(2)).toBe(0);
  expect(invertPortraitLuminance(Number.NaN)).toBe(1);
});

it("samples bright facial edge sides while preserving dark feature gaps", () => {
  const smoothCore = particleAcceptance(0.7, 0, 1, "core");
  const darkEdge = particleAcceptance(0.1, 0.2, 1, "core");
  const brightEdge = particleAcceptance(0.7, 0.2, 1, "core");

  expect(smoothCore).toBeCloseTo(0.161);
  expect(darkEdge).toBeCloseTo(0.0735714286);
  expect(darkEdge).toBeLessThan(smoothCore);
  expect(brightEdge).toBeCloseTo(0.521);
  expect(brightEdge).toBeGreaterThan(smoothCore);
  expect(particleAcceptance(0.5, 1, 1, "core")).toBe(0.94);
});

it("keeps dark core gaps below smooth and bright-edge visible contribution", () => {
  const visibleContribution = (light: number, edge: number): number =>
    particleAcceptance(light, edge, 1, "core") *
    visualForSample(light, "core", 0.5, edge).alpha;
  const darkEdge = visibleContribution(0.1, 0.2);
  const smoothCore = visibleContribution(0.7, 0);
  const brightEdge = visibleContribution(0.7, 0.2);

  expect(darkEdge).toBeLessThan(smoothCore);
  expect(brightEdge).toBeGreaterThan(smoothCore);
});

it("keeps face acceptance denser than the matching outer edge", () => {
  expect(particleAcceptance(0.7, 0, 1, "face")).toBeCloseTo(0.416);
  expect(particleAcceptance(0.7, 0, 1, "edge")).toBeCloseTo(0.217);
  expect(particleAcceptance(0.7, 0, 0, "face")).toBeCloseTo(0.416 * 0.34);
});

it("clamps invalid particle acceptance inputs to finite bounds", () => {
  const invalidCore = particleAcceptance(
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    "core",
  );
  const extremeEdge = particleAcceptance(10, -10, 10, "edge");

  expect(invalidCore).toBeCloseTo(0.035 * 0.34);
  expect(Number.isFinite(invalidCore)).toBe(true);
  expect(extremeEdge).toBeCloseTo(0.295);
  expect(invalidCore).toBeGreaterThanOrEqual(0);
  expect(extremeEdge).toBeLessThanOrEqual(0.94);
});

it("restricts large particles to edges and weak face candidates", () => {
  expect(isLargeParticleEligible("edge", 0)).toBe(true);
  expect(isLargeParticleEligible("edge", 1)).toBe(true);
  expect(isLargeParticleEligible("face", 0.139999)).toBe(true);
  expect(isLargeParticleEligible("face", 0.14)).toBe(false);
  expect(isLargeParticleEligible("core", 0)).toBe(false);
});

it.each([
  ["micro", 0, 0.37],
  ["micro", 1, 0.88],
  ["medium", 0, 0.9],
  ["medium", 1, 1.48],
  ["large", 0, 1.56],
  ["large", 1, 2.34],
] as const)("maps %s radius roll %s to %s", (band, roll, expected) => {
  expect(radiusByBand(band, roll)).toBeCloseTo(expected, 8);
});

it("checks every hard capacity when evaluating particle quota feasibility", () => {
  expect(hasFeasibleParticleSizeQuotas(100, 0, 3, 82)).toBe(true);
  expect(hasFeasibleParticleSizeQuotas(100, 0, 2, 82)).toBe(false);
  expect(hasFeasibleParticleSizeQuotas(100, 0, 3, 83)).toBe(false);
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

it("uses a steeper bounded visual curve in the facial core", () => {
  expect(visualForRegion(0.12, "core", 1).alpha).toBeCloseTo(0.2304);
  expect(visualForRegion(0.12, "core", 1).tone).toBe(144);
  expect(visualForRegion(0.5, "core", 1).alpha).toBeCloseTo(0.571392);
  expect(visualForRegion(0.5, "core", 1).tone).toBe(199);
  expect(visualForRegion(1, "core", 1)).toEqual({ alpha: 0.96, tone: 245 });
  expect(visualForRegion(1, "edge", 1)).toEqual({ alpha: 0.96, tone: 255 });
});

it("clamps invalid visual inputs to finite bounded values", () => {
  expect(visualForRegion(Number.NaN, "core", Number.POSITIVE_INFINITY)).toEqual(
    { alpha: 0.1152, tone: 132 },
  );
  expect(visualForRegion(-10, "edge", -2)).toEqual({
    alpha: 0.1152,
    tone: 150,
  });
  expect(visualForRegion(10, "face", 3)).toEqual({
    alpha: 0.96,
    tone: 255,
  });
});

it("emphasizes strong facial-core contours without exceeding visual bounds", () => {
  expect(visualForSample(0.12, "core", 1, 0.1)).toEqual(
    visualForRegion(0.12, "core", 1),
  );
  expect(visualForSample(0.12, "core", 1, 0.18)).toEqual({
    alpha: expect.closeTo(0.245248),
    tone: 146,
  });
  expect(visualForSample(0.12, "core", 1, 0.5)).toEqual({
    alpha: expect.closeTo(0.30464),
    tone: 155,
  });
});

it("gates contour emphasis away from dark edges while preserving bright detail", () => {
  const darkEdge = visualForSample(0.1, "core", 0.5, 1);
  const smoothFace = visualForSample(0.7, "core", 0.5, 0);
  const brightEdge = visualForSample(0.7, "core", 0.5, 0.2);

  expect(
    particleAcceptance(0.1, 1, 1, "core") * darkEdge.alpha,
  ).toBeLessThan(
    particleAcceptance(0.7, 0, 1, "core") * smoothFace.alpha,
  );
  expect(brightEdge.alpha).toBeGreaterThan(smoothFace.alpha);
  expect(brightEdge.tone).toBeGreaterThan(smoothFace.tone);
});

it("never reduces an already saturated facial-core visual", () => {
  const base = visualForRegion(1, "core", 1);

  expect(visualForSample(1, "core", 1, 0.5)).toEqual(base);
  expect(base).toEqual({ alpha: 0.96, tone: 245 });
});

it.each([0.1, 0.18])(
  "keeps facial contour emphasis continuous around edge score %f",
  (boundary) => {
    const below = visualForSample(0.12, "core", 1, boundary - 0.000001);
    const above = visualForSample(0.12, "core", 1, boundary + 0.000001);

    expect(Math.abs(above.alpha - below.alpha)).toBeLessThan(0.0001);
    expect(Math.abs(above.tone - below.tone)).toBeLessThanOrEqual(1);
  },
);

it("leaves weak-core and non-core samples on the regional visual curve", () => {
  expect(visualForSample(0.12, "core", 1, 0.099999)).toEqual(
    visualForRegion(0.12, "core", 1),
  );
  expect(visualForSample(0.12, "face", 1, 1)).toEqual(
    visualForRegion(0.12, "face", 1),
  );
  expect(visualForSample(0.12, "edge", 1, 1)).toEqual(
    visualForRegion(0.12, "edge", 1),
  );
});

it("keeps contour visuals bounded when inputs are non-finite", () => {
  const visual = visualForSample(
    Number.NaN,
    "core",
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  );

  expect(visual).toEqual(visualForRegion(Number.NaN, "core", 0));
  expect(Number.isFinite(visual.alpha)).toBe(true);
  expect(Number.isFinite(visual.tone)).toBe(true);
  expect(visual.alpha).toBeGreaterThanOrEqual(0);
  expect(visual.alpha).toBeLessThanOrEqual(0.96);
  expect(visual.tone).toBeGreaterThanOrEqual(132);
  expect(visual.tone).toBeLessThanOrEqual(245);
});

describe("samplePortrait", () => {
  it("samples only pixels whose aligned subject-mask alpha is nonzero", () => {
    const pixels = buffer(80, 120, 0);
    const mask = buffer(80, 120, 255);

    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) setAlpha(mask, x, y, 0);
    }
    for (let y = 34; y < 48; y += 1) {
      for (let x = 34; x < 46; x += 1) setAlpha(mask, x, y, 255);
    }

    const particles = samplePortrait(pixels, {
      maxParticles: 300,
      seed: 20260802,
      mask,
    });

    expect(particles.length).toBeGreaterThan(0);
    expect(
      particles.every(({ targetX, targetY }) =>
        isMaskAccepted(mask, targetX, targetY),
      ),
    ).toBe(true);
    expect(
      particles.every(({ band, region }) =>
        region !== "core" || (band !== "large" && band !== "splash"),
      ),
    ).toBe(true);
  });

  it("keeps displaced face and boundary-edge targets inside the subject mask", () => {
    const pixels = buffer(120, 180, 0);
    const mask = buffer(120, 180, 255);

    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) setAlpha(mask, x, y, 0);
    }
    for (let y = 55; y < 95; y += 1) {
      for (let x = 32; x < 38; x += 1) setAlpha(mask, x, y, 255);
    }
    for (let y = 80; y < 120; y += 1) {
      for (let x = 0; x < 6; x += 1) setAlpha(mask, x, y, 255);
    }

    const particles = samplePortrait(pixels, {
      maxParticles: 1_000,
      seed: 20260802,
      mask,
    });

    expect(particles.length).toBeGreaterThan(0);
    const regions = new Set(particles.map(({ region }) => region));
    expect(regions.has("face")).toBe(true);
    expect(regions.has("edge")).toBe(true);
    expect(
      particles.every(({ targetX, targetY }) =>
        isMaskAccepted(mask, targetX, targetY),
      ),
    ).toBe(true);
  });

  it("rejects subject masks whose dimensions do not match the source", () => {
    expect(() =>
      samplePortrait(buffer(40, 60, 0), {
        maxParticles: 100,
        seed: 1,
        mask: buffer(41, 60, 255),
      }),
    ).toThrowError("Portrait mask dimensions must match source pixels.");
  });

  it("returns no particles for an all-transparent subject mask", () => {
    const mask = buffer(40, 60, 255);
    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) setAlpha(mask, x, y, 0);
    }

    expect(
      samplePortrait(buffer(40, 60, 0), {
        maxParticles: 500,
        seed: 1,
        mask,
      }),
    ).toHaveLength(0);
  });

  it("does not sample particles from a white portrait", () => {
    expect(
      samplePortrait(buffer(40, 60, 255), { maxParticles: 500, seed: 1 }),
    ).toHaveLength(0);
  });

  it("floors fractional particle limits and rejects negative limits", () => {
    const pixels = buffer(80, 120, 0);

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
    const pixels = buffer(80, 120, 0);

    expect(
      samplePortrait(pixels, { maxParticles: Number.POSITIVE_INFINITY, seed: 8 }),
    ).toHaveLength(0);
    expect(
      samplePortrait(pixels, { maxParticles: Number.NaN, seed: 8 }),
    ).toHaveLength(0);
  });

  it("caps excessive particle limits", () => {
    const particles = samplePortrait(buffer(80, 120, 0), {
      maxParticles: MAX_PARTICLES + 1_000,
      seed: 8,
    });

    expect(particles).toHaveLength(MAX_PARTICLES);
  });

  it("is deterministic and fills a useful portion of the particle budget", () => {
    const pixels = buffer(80, 120, 0);
    const options = { maxParticles: 300, seed: 8 };
    const first = samplePortrait(pixels, options);
    const second = samplePortrait(pixels, options);

    expect(first).toEqual(second);
    expect(first.length).toBeLessThanOrEqual(300);
    expect(first.length).toBeGreaterThan(120);
    expect(first.every(({ depth }) => depth >= 0 && depth <= 1)).toBe(true);
    expect(first.filter(({ band }) => band === "micro").length).toBeGreaterThan(
      first.filter(({ band }) => band === "large").length,
    );
  });

  it.each([7_000, 14_000])(
    "assigns the final %i-particle production budget to exact 82/15/3/0 quotas",
    (maxParticles) => {
      const pixels = buffer(320, 480, 0);
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
        micro: maxParticles * 0.82,
        medium: maxParticles * 0.15,
        large: maxParticles * 0.03,
        splash: 0,
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
    const particles = samplePortrait(buffer(100, 150, 0), {
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
    const pixels = buffer(120, 180, 65);
    for (let x = 42; x <= 52; x += 1) setPixel(pixels, x, 54, 247);
    for (let x = 68; x <= 78; x += 1) setPixel(pixels, x, 54, 247);
    for (let y = 58; y <= 78; y += 1) setPixel(pixels, 60, y, 243);
    for (let x = 50; x <= 70; x += 1) setPixel(pixels, x, 86, 245);

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

  it("preserves the full M2 quota when large candidates are scarce", () => {
    const pixels = buffer(120, 180, 255);
    for (let y = 0; y < pixels.height; y += 1) {
      for (let x = 0; x < pixels.width; x += 1) {
        if (
          fixtureRegionAtPixel(x, y, pixels.width, pixels.height) === "face" &&
          x % 4 < 2
        ) {
          setPixel(pixels, x, y, 0);
        }
      }
    }
    for (let x = 0; x < pixels.width; x += 1) {
      setPixel(pixels, x, pixels.height - 1, 0);
    }

    const options = { maxParticles: 3_000, seed: 1 };
    const first = samplePortrait(pixels, options);
    const second = samplePortrait(pixels, options);

    expect(second).toEqual(first);
    expect(first).toHaveLength(3_000);
    expect(bandCounts(first)).toEqual({
      micro: 2_460,
      medium: 450,
      large: 90,
      splash: 0,
    });
    expect(
      first.filter(
        ({ band, region }) =>
          region === "core" && (band === "large" || band === "splash"),
      ),
    ).toHaveLength(0);
    expect(
      first.filter(({ band, region }) => region === "face" && band === "splash"),
    ).toHaveLength(0);
  });

  it("keeps strong core edges micro-only under the M2 profile", () => {
    const pixels = buffer(120, 180, 255);
    for (let y = 0; y < pixels.height; y += 1) {
      for (let x = 0; x < pixels.width; x += 1) {
        if (
          fixtureRegionAtPixel(x, y, pixels.width, pixels.height) === "core" &&
          x % 4 < 2
        ) {
          setPixel(pixels, x, y, 0);
        }
      }
    }
    for (let y = pixels.height - 9; y < pixels.height; y += 1) {
      for (let x = 0; x < pixels.width; x += 1) {
        setPixel(pixels, x, y, 0);
      }
    }

    const options = { maxParticles: 3_000, seed: 20260714 };
    const first = samplePortrait(pixels, options);
    const second = samplePortrait(pixels, options);
    const strongCoreEdges = first.filter(
      (particle) =>
        particle.region === "core" &&
        edgeStrength(pixels, particle.targetX, particle.targetY) >= 0.18,
    );

    expect(first).toHaveLength(3_000);
    expect(second).toEqual(first);
    expect(bandCounts(first)).toEqual({
      micro: 2_460,
      medium: 450,
      large: 90,
      splash: 0,
    });
    expect(new Set(strongCoreEdges.map(({ band }) => band))).toEqual(
      new Set(["micro"]),
    );
    expect(
      first.filter(
        ({ band, region }) =>
          region === "core" && (band === "large" || band === "splash"),
      ),
    ).toHaveLength(0);
    expect(
      first.filter(({ band, region }) => region === "face" && band === "splash"),
    ).toHaveLength(0);
  });

  it("leaves spatial cells empty between populated particle clusters", () => {
    const width = 80;
    const height = 120;
    const particles = samplePortrait(buffer(width, height, 0), {
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
    const pixels = buffer(80, 120, 0);
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
      expect(particle.tone).toBeGreaterThanOrEqual(132);
      expect(particle.tone).toBeLessThanOrEqual(255);
      expect(particle.alpha).toBeGreaterThanOrEqual(0);
      expect(particle.alpha).toBeLessThanOrEqual(0.96);
      expect(particle.radius).toBeGreaterThanOrEqual(0.37);
      expect(particle.radius).toBeLessThanOrEqual(2.34);
      expect(particle.stretch).toBeGreaterThanOrEqual(0.82);
      expect(particle.stretch).toBeLessThanOrEqual(1.55);
      expect(particle.delay).toBeGreaterThanOrEqual(0.1);
      expect(particle.delay).toBeLessThanOrEqual(0.72);
    }
    expect(
      [...first, ...second].every(({ band }) => band !== "splash"),
    ).toBe(true);
  });
});
