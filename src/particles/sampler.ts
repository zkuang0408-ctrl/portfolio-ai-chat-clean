import { createRandom, spatialNoise } from "./random";
import type {
  Particle,
  ParticleRegion,
  ParticleSizeBand,
  PixelBuffer,
  RandomSource,
  SampleOptions,
} from "./types";

const RADIUS_RANGES: Record<ParticleSizeBand, readonly [number, number]> = {
  micro: [0.45, 1.2],
  medium: [1.2, 2.35],
  large: [2.4, 4.4],
  splash: [4.5, 7.5],
};

const SIZE_BAND_SHARES: Record<ParticleSizeBand, number> = {
  micro: 0.65,
  medium: 0.25,
  large: 0.08,
  splash: 0.02,
};

const SIZE_BANDS: readonly ParticleSizeBand[] = [
  "micro",
  "medium",
  "large",
  "splash",
];

interface ParticleCandidate
  extends Omit<Particle, "band" | "radius" | "stretch"> {
  assignmentOrder: number;
  edgeScore: number;
  radiusRoll: number;
  stretchRoll: number;
}

export const MAX_PARTICLES = 50_000;

const STRONG_CORE_EDGE = 0.18;
const STRONG_FACE_EDGE = 0.14;

function between(
  random: RandomSource,
  minimum: number,
  maximum: number,
): number {
  return minimum + random() * (maximum - minimum);
}

function radiusByBand(
  band: ParticleSizeBand,
  roll: number,
): number {
  const [minimum, maximum] = RADIUS_RANGES[band];
  return minimum + roll * (maximum - minimum);
}

function luminance(buffer: PixelBuffer, x: number, y: number): number {
  if (buffer.width <= 0 || buffer.height <= 0) return 0;

  const clampedX = Math.max(0, Math.min(buffer.width - 1, Math.floor(x)));
  const clampedY = Math.max(0, Math.min(buffer.height - 1, Math.floor(y)));
  const index = (clampedY * buffer.width + clampedX) * 4;
  const red = buffer.data[index] ?? 0;
  const green = buffer.data[index + 1] ?? 0;
  const blue = buffer.data[index + 2] ?? 0;

  return (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
}

export function edgeStrength(
  buffer: PixelBuffer,
  x: number,
  y: number,
): number {
  const dx = Math.abs(
    luminance(buffer, x + 1, y) - luminance(buffer, x - 1, y),
  );
  const dy = Math.abs(
    luminance(buffer, x, y + 1) - luminance(buffer, x, y - 1),
  );

  return Math.min(1, (dx + dy) * 1.8);
}

function isInsideEllipse(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
): boolean {
  const normalizedX = (x - centerX) / radiusX;
  const normalizedY = (y - centerY) / radiusY;
  return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
}

function regionAt(
  x: number,
  y: number,
  width: number,
  height: number,
): ParticleRegion {
  const normalizedX = x / width;
  const normalizedY = y / height;

  if (isInsideEllipse(normalizedX, normalizedY, 0.5, 0.34, 0.19, 0.23)) {
    return "core";
  }

  if (isInsideEllipse(normalizedX, normalizedY, 0.5, 0.39, 0.3, 0.34)) {
    return "face";
  }

  return "edge";
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function visualForRegion(
  light: number,
  region: ParticleRegion,
  opacityRoll: number,
): { alpha: number; tone: number } {
  const safeLight = clamp01(Number.isFinite(light) ? light : 0);
  const safeRoll = clamp01(Number.isFinite(opacityRoll) ? opacityRoll : 0);
  const mapped =
    region === "core"
      ? clamp01((safeLight - 0.16) * 1.28 + 0.16)
      : safeLight;
  const minimumTone = region === "core" ? 132 : 150;
  const maximumTone = region === "core" ? 245 : 255;

  return {
    alpha: Math.min(
      0.96,
      (0.48 + safeRoll * 0.48) * Math.max(0.24, mapped),
    ),
    tone: Math.round(minimumTone + mapped * (maximumTone - minimumTone)),
  };
}

export function visualForSample(
  light: number,
  region: ParticleRegion,
  opacityRoll: number,
  edgeScore: number,
): { alpha: number; tone: number } {
  const base = visualForRegion(light, region, opacityRoll);
  const safeRoll = clamp01(
    Number.isFinite(opacityRoll) ? opacityRoll : 0,
  );
  const safeEdge = clamp01(Number.isFinite(edgeScore) ? edgeScore : 0);

  if (region !== "core" || safeEdge < STRONG_CORE_EDGE) return base;

  const emphasis = clamp01((safeEdge - STRONG_CORE_EDGE) / 0.32);
  const contourAlpha =
    (0.58 + safeRoll * 0.3) * (0.9 + emphasis * 0.1);
  const contourTone = Math.round(218 + emphasis * 22);

  return {
    alpha: Math.min(0.96, Math.max(base.alpha, contourAlpha)),
    tone: Math.min(245, Math.max(base.tone, contourTone)),
  };
}

export function settledTargetForRegion(
  x: number,
  y: number,
  width: number,
  region: ParticleRegion,
  horizontalRoll: number,
  verticalRoll: number,
): readonly [number, number] {
  const outwardDirection = x < width / 2 ? -1 : 1;

  if (region === "core") return [x, y];
  if (region === "face") {
    return [
      x + outwardDirection * width * horizontalRoll * 0.006,
      y + (verticalRoll * 0.7 - 0.35),
    ];
  }

  return [
    x + outwardDirection * width * (0.02 + horizontalRoll * 0.13),
    y + (verticalRoll * 10 - 4),
  ];
}

function targetForRegion(
  x: number,
  y: number,
  width: number,
  region: ParticleRegion,
  random: RandomSource,
): readonly [number, number] {
  return settledTargetForRegion(x, y, width, region, random(), random());
}

function sizeBandQuotas(
  particleCount: number,
): Record<ParticleSizeBand, number> {
  const allocations = SIZE_BANDS.map((band, index) => {
    const exact = particleCount * SIZE_BAND_SHARES[band];
    return { band, count: Math.floor(exact), index, remainder: exact % 1 };
  });
  let unassigned =
    particleCount - allocations.reduce((sum, item) => sum + item.count, 0);

  for (const allocation of [...allocations].sort(
    (left, right) =>
      right.remainder - left.remainder || left.index - right.index,
  )) {
    if (unassigned === 0) break;
    allocation.count += 1;
    unassigned -= 1;
  }

  return Object.fromEntries(
    allocations.map(({ band, count }) => [band, count]),
  ) as Record<ParticleSizeBand, number>;
}

export function hasFeasibleParticleSizeQuotas(
  particleCount: number,
  edgeCount: number,
  largeEligibleCount: number,
  strongCoreCount: number,
): boolean {
  const quotas = sizeBandQuotas(particleCount);

  return (
    quotas.splash <= edgeCount &&
    quotas.splash + quotas.large <= largeEligibleCount &&
    strongCoreCount <= quotas.micro
  );
}

function rankedCandidateIndices(candidates: ParticleCandidate[]): number[] {
  return candidates
    .map(({ assignmentOrder }, index) => ({ assignmentOrder, index }))
    .sort(
      (left, right) =>
        left.assignmentOrder - right.assignmentOrder || left.index - right.index,
    )
    .map(({ index }) => index);
}

function isStrongCoreEdge(candidate: ParticleCandidate): boolean {
  return (
    candidate.region === "core" && candidate.edgeScore >= STRONG_CORE_EDGE
  );
}

export function isLargeParticleEligible(
  region: ParticleRegion,
  edgeScore: number,
): boolean {
  return (
    region === "edge" || (region === "face" && edgeScore < STRONG_FACE_EDGE)
  );
}

function selectFeasibleCandidates(
  candidates: ParticleCandidate[],
): ParticleCandidate[] {
  const rankedIndices = rankedCandidateIndices(candidates);
  const active = candidates.map(() => true);
  const strongCorePool = rankedIndices.filter((index) => {
    const candidate = candidates[index];
    return candidate !== undefined && isStrongCoreEdge(candidate);
  });
  const corePool = rankedIndices.filter(
    (index) => candidates[index]?.region === "core",
  );
  const facePool = rankedIndices.filter(
    (index) => candidates[index]?.region === "face",
  );
  const strongFacePool = rankedIndices.filter((index) => {
    const candidate = candidates[index];
    return (
      candidate?.region === "face" && candidate.edgeScore >= STRONG_FACE_EDGE
    );
  });
  let activeCount = candidates.length;
  let edgeCount = candidates.filter(({ region }) => region === "edge").length;
  let largeEligibleCount = candidates.filter(({ edgeScore, region }) =>
    isLargeParticleEligible(region, edgeScore),
  ).length;
  let strongCoreCount = candidates.filter(isStrongCoreEdge).length;

  const removeLeastPreferred = (pools: number[][]): void => {
    for (const pool of pools) {
      while (pool.length > 0) {
        const index = pool.pop();
        if (index === undefined || active[index] !== true) continue;
        const candidate = candidates[index];
        if (candidate === undefined) continue;

        active[index] = false;
        activeCount -= 1;
        if (candidate.region === "edge") edgeCount -= 1;
        if (isLargeParticleEligible(candidate.region, candidate.edgeScore)) {
          largeEligibleCount -= 1;
        }
        if (isStrongCoreEdge(candidate)) strongCoreCount -= 1;
        return;
      }
    }

    throw new Error("Unable to satisfy particle size quotas");
  };

  while (activeCount > 0) {
    if (
      hasFeasibleParticleSizeQuotas(
        activeCount,
        edgeCount,
        largeEligibleCount,
        strongCoreCount,
      )
    ) {
      break;
    }
    const quotas = sizeBandQuotas(activeCount);

    if (quotas.splash > edgeCount) {
      removeLeastPreferred([
        strongCorePool,
        corePool,
        strongFacePool,
        facePool,
      ]);
      continue;
    }
    if (quotas.splash + quotas.large > largeEligibleCount) {
      removeLeastPreferred([strongCorePool, corePool, strongFacePool]);
      continue;
    }
    if (strongCoreCount > quotas.micro) {
      removeLeastPreferred([strongCorePool]);
      continue;
    }
  }

  return candidates.filter((_, index) => active[index] === true);
}

function finalizeCandidates(allCandidates: ParticleCandidate[]): Particle[] {
  const candidates = selectFeasibleCandidates(allCandidates);
  const quotas = sizeBandQuotas(candidates.length);
  const bands: Array<ParticleSizeBand | undefined> = new Array(
    candidates.length,
  );
  const rankedIndices = rankedCandidateIndices(candidates);

  const assign = (
    band: ParticleSizeBand,
    count: number,
    eligible: (candidate: ParticleCandidate) => boolean,
    indices: number[] = rankedIndices,
  ): void => {
    let assigned = 0;

    for (const index of indices) {
      if (assigned === count) return;
      const candidate = candidates[index];
      if (
        candidate === undefined ||
        bands[index] !== undefined ||
        !eligible(candidate)
      ) {
        continue;
      }
      bands[index] = band;
      assigned += 1;
    }

    if (assigned !== count) {
      throw new Error(`Unable to assign ${count} ${band} particles`);
    }
  };

  assign("splash", quotas.splash, ({ region }) => region === "edge");
  assign("large", quotas.large, ({ edgeScore, region }) =>
    isLargeParticleEligible(region, edgeScore),
  );
  assign(
    "medium",
    quotas.medium,
    (candidate) => !isStrongCoreEdge(candidate),
  );

  return candidates.map((candidate, index) => {
    const {
      assignmentOrder: _assignmentOrder,
      edgeScore: _edgeScore,
      radiusRoll,
      stretchRoll,
      ...particle
    } = candidate;
    const band = bands[index] ?? "micro";
    const stretchMaximum = band === "micro" ? 1.18 : 1.55;

    return {
      ...particle,
      radius: radiusByBand(band, radiusRoll),
      stretch: 0.82 + stretchRoll * (stretchMaximum - 0.82),
      band,
    };
  });
}

export function samplePortrait(
  buffer: PixelBuffer,
  options: SampleOptions,
): Particle[] {
  const { maxParticles, seed } = options;
  const particleLimit = Number.isFinite(maxParticles)
    ? Math.min(MAX_PARTICLES, Math.max(0, Math.floor(maxParticles)))
    : 0;
  const candidates: ParticleCandidate[] = [];

  if (particleLimit === 0 || buffer.width <= 0 || buffer.height <= 0) {
    return [];
  }

  const random = createRandom(seed);
  const attempts = particleLimit * 28;

  for (
    let attempt = 0;
    attempt < attempts && candidates.length < particleLimit;
    attempt += 1
  ) {
    const x = random() * buffer.width;
    const y = random() * buffer.height;
    const light = luminance(buffer, x, y);

    if (light < 0.035) continue;

    const edge = edgeStrength(buffer, x, y);
    const cluster = spatialNoise(Math.floor(x / 9), Math.floor(y / 9), seed);

    if (cluster < 0.26) continue;

    const acceptance =
      Math.min(0.94, 0.08 + light * 0.48 + edge * 0.52) *
      (0.34 + cluster * 0.66);

    if (random() > acceptance) continue;

    const region = regionAt(x, y, buffer.width, buffer.height);
    const assignmentOrder = random();
    const radiusRoll = random();
    const stretchRoll = random();
    const [targetX, targetY] = targetForRegion(
      x,
      y,
      buffer.width,
      region,
      random,
    );
    const angle = random() * Math.PI * 2;
    const travel =
      region === "core"
        ? between(random, 24, 90)
        : between(random, 60, 220);
    const delayRange: readonly [number, number] =
      region === "core"
        ? [0.1, 0.24]
        : region === "face"
          ? [0.22, 0.48]
          : [0.42, 0.72];
    const visual = visualForSample(light, region, random(), edge);

    candidates.push({
      targetX,
      targetY,
      startX: targetX + Math.cos(angle) * travel,
      startY: targetY + Math.sin(angle) * travel,
      alpha: visual.alpha,
      tone: visual.tone,
      delay: between(random, delayRange[0], delayRange[1]),
      region,
      assignmentOrder,
      edgeScore: edge,
      radiusRoll,
      stretchRoll,
    });
  }

  return finalizeCandidates(candidates);
}
