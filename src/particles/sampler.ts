import { createRandom, pickSizeBand, spatialNoise } from "./random";
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

export const MAX_PARTICLES = 50_000;

function between(
  random: RandomSource,
  minimum: number,
  maximum: number,
): number {
  return minimum + random() * (maximum - minimum);
}

function radiusByBand(
  band: ParticleSizeBand,
  random: RandomSource,
): number {
  const [minimum, maximum] = RADIUS_RANGES[band];
  return between(random, minimum, maximum);
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

function bandForRegion(
  region: ParticleRegion,
  random: RandomSource,
): ParticleSizeBand {
  const band = pickSizeBand(random);

  if (region === "core" && (band === "large" || band === "splash")) {
    return random() < 0.72 ? "micro" : "medium";
  }

  if (region === "face" && band === "splash") return "medium";
  return band;
}

function targetForRegion(
  x: number,
  y: number,
  width: number,
  region: ParticleRegion,
  random: RandomSource,
): readonly [number, number] {
  const outwardDirection = x < width / 2 ? -1 : 1;

  if (region === "edge") {
    return [
      x + outwardDirection * width * between(random, 0.02, 0.15),
      y + between(random, -4, 6),
    ];
  }

  return [
    x + outwardDirection * width * between(random, 0, 0.025),
    y + between(random, -1, 1),
  ];
}

export function samplePortrait(
  buffer: PixelBuffer,
  options: SampleOptions,
): Particle[] {
  const { maxParticles, seed } = options;
  const particleLimit = Number.isFinite(maxParticles)
    ? Math.min(MAX_PARTICLES, Math.max(0, Math.floor(maxParticles)))
    : 0;
  const particles: Particle[] = [];

  if (particleLimit === 0 || buffer.width <= 0 || buffer.height <= 0) {
    return particles;
  }

  const random = createRandom(seed);
  const attempts = particleLimit * 28;

  for (
    let attempt = 0;
    attempt < attempts && particles.length < particleLimit;
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
    const band = bandForRegion(region, random);
    const radius = radiusByBand(band, random);
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
    const stretchMaximum = band === "micro" ? 1.18 : 1.55;
    const delayRange: readonly [number, number] =
      region === "core"
        ? [0.1, 0.24]
        : region === "face"
          ? [0.22, 0.48]
          : [0.42, 0.72];

    particles.push({
      targetX,
      targetY,
      startX: targetX + Math.cos(angle) * travel,
      startY: targetY + Math.sin(angle) * travel,
      radius,
      alpha: between(random, 0.48, 0.96) * Math.max(0.35, light),
      tone: Math.round(150 + light * 105),
      stretch: between(random, 0.82, stretchMaximum),
      delay: between(random, delayRange[0], delayRange[1]),
      band,
      region,
    });
  }

  return particles;
}
