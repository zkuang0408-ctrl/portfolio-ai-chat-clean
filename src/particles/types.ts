export type ParticleSizeBand = "micro" | "medium" | "large" | "splash";

export type ParticleRegion = "core" | "face" | "edge";

export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Particle {
  targetX: number;
  targetY: number;
  startX: number;
  startY: number;
  radius: number;
  alpha: number;
  tone: number;
  stretch: number;
  delay: number;
  band: ParticleSizeBand;
  region: ParticleRegion;
  depth: number;
}

export interface SampleOptions {
  maxParticles: number;
  seed: number;
}

export type RandomSource = () => number;
