import type { ParticleSizeBand, RandomSource } from "./types";

export function createRandom(seed: number): RandomSource {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function pickSizeBand(random: RandomSource): ParticleSizeBand {
  const roll = random();

  if (roll < 0.65) return "micro";
  if (roll < 0.9) return "medium";
  if (roll < 0.98) return "large";
  return "splash";
}

export function spatialNoise(x: number, y: number, seed: number): number {
  let hash =
    Math.imul(x | 0, 374_761_393) ^
    Math.imul(y | 0, 668_265_263) ^
    Math.imul(seed | 0, 2_147_483_647);
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4_294_967_296;
}
