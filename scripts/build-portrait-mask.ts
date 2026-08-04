import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createCanvas, loadImage } from "@napi-rs/canvas";

export const MASK_WIDTH = 1104;
export const MASK_HEIGHT = 1425;

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
  [0.52, 0.17],
  [0.37, 0.36],
  [0.55, 0.37],
  [0.48, 0.49],
  [0.43, 0.58],
  [0.49, 0.66],
  [0.5, 0.75],
  [0.88, 0.83],
  [0.5, 0.92],
] as const;

const FORBIDDEN_POINTS = [
  [0.05, 0.05],
  [0.12, 0.45],
  [0.9, 0.56],
  [0.92, 0.75],
  [0.97, 0.68],
  [0.97, 0.9],
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
  const alphaAt = ([normalizedX, normalizedY]: readonly [
    number,
    number,
  ]): number => {
    const x = Math.round(normalizedX * (MASK_WIDTH - 1));
    const y = Math.round(normalizedY * (MASK_HEIGHT - 1));
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
