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

function finalizeCandidates(candidates: ParticleCandidate[]): Particle[] {
  const quotas = sizeBandQuotas(candidates.length);
  const bands: Array<ParticleSizeBand | undefined> = new Array(
    candidates.length,
  );
  const rankedIndices = candidates
    .map(({ assignmentOrder }, index) => ({ assignmentOrder, index }))
    .sort(
      (left, right) =>
        left.assignmentOrder - right.assignmentOrder || left.index - right.index,
    )
    .map(({ index }) => index);

  const assign = (
    band: ParticleSizeBand,
    count: number,
    eligible: (candidate: ParticleCandidate) => boolean,
  ): void => {
    let assigned = 0;

    for (const index of rankedIndices) {
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
  };

  assign("splash", quotas.splash, ({ region }) => region === "edge");
  assign(
    "large",
    quotas.large,
    ({ edgeScore, region }) =>
      region === "edge" || (region === "face" && edgeScore < STRONG_FACE_EDGE),
  );
  assign(
    "medium",
    quotas.medium,
    ({ edgeScore, region }) =>
      !(region === "core" && edgeScore >= STRONG_CORE_EDGE),
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

    candidates.push({
      targetX,
      targetY,
      startX: targetX + Math.cos(angle) * travel,
      startY: targetY + Math.sin(angle) * travel,
      alpha: between(random, 0.48, 0.96) * Math.max(0.35, light),
      tone: Math.round(150 + light * 105),
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
