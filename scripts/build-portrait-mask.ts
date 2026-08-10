import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createCanvas, loadImage } from "@napi-rs/canvas";

import { PORTRAIT_GEOMETRY } from "../src/particles/portrait-geometry";

export const MASK_WIDTH = PORTRAIT_GEOMETRY.width;
export const MASK_HEIGHT = PORTRAIT_GEOMETRY.height;

export const CANONICAL_MASK_PATH = resolve(
  process.env.PORTRAIT_MASK_SOURCE ??
    "scripts/assets/portrait-subject-mask.png",
);

const MASK_PATH = resolve(
  process.env.PORTRAIT_MASK_OUTPUT ?? "public/portrait-particle-mask.png",
);

export function portraitMaskPng(): Buffer {
  if (!existsSync(CANONICAL_MASK_PATH)) {
    throw new Error("Canonical portrait subject mask is missing.");
  }

  return readFileSync(CANONICAL_MASK_PATH);
}

const REQUIRED_POINTS = [
  [689, 206],
  [533, 510],
  [733, 510],
  [593, 815],
  [658, 930],
  [673, 1030],
  [120, 1220],
  [1180, 1220],
  [675, 1400],
] as const;

const FORBIDDEN_POINTS = [
  [0, 1220],
  [1349, 1220],
  [70, 900],
  [1260, 900],
  [1315, 1050],
  [67, 71],
  [162, 641],
  [1214, 797],
  [1241, 1068],
  [1309, 968],
  [1309, 1282],
] as const;

export async function validatePortraitMask(png: Buffer): Promise<void> {
  const image = await loadImage(png);

  if (image.width !== MASK_WIDTH || image.height !== MASK_HEIGHT) {
    throw new Error(
      `Portrait subject mask must be ${MASK_WIDTH}x${MASK_HEIGHT}.`,
    );
  }

  const canvas = createCanvas(MASK_WIDTH, MASK_HEIGHT);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const alphaAt = ([x, y]: readonly [number, number]): number => {
    return context.getImageData(x, y, 1, 1).data[3] ?? 0;
  };

  if (REQUIRED_POINTS.some((point) => alphaAt(point) <= 200)) {
    throw new Error("Portrait subject mask omits a required subject landmark.");
  }

  if (FORBIDDEN_POINTS.some((point) => alphaAt(point) !== 0)) {
    throw new Error(
      "Portrait subject mask includes a forbidden environment region.",
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const verify = args.length === 1 && args[0] === "--verify";

  if (args.length > 0 && !verify) {
    throw new Error(
      "Unsupported portrait mask arguments. Usage: tsx scripts/build-portrait-mask.ts [--verify]",
    );
  }

  const expected = portraitMaskPng();
  await validatePortraitMask(expected);

  if (verify) {
    if (!existsSync(MASK_PATH)) {
      throw new Error(
        "Portrait particle mask is missing. Run `npm run portrait-mask:generate` to create it.",
      );
    }

    const actual = readFileSync(MASK_PATH);
    if (!actual.equals(expected)) {
      throw new Error(
        "Portrait particle mask has drifted. Run `npm run portrait-mask:generate` and commit the regenerated asset.",
      );
    }

    console.log(`Verified portrait particle mask: ${MASK_WIDTH}x${MASK_HEIGHT}`);
    return;
  }

  writeFileSync(MASK_PATH, expected);
  console.log(`Generated portrait particle mask: ${MASK_WIDTH}x${MASK_HEIGHT}`);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
