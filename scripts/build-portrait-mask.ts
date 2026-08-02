import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createCanvas } from "@napi-rs/canvas";

export const MASK_WIDTH = 1104;
export const MASK_HEIGHT = 1425;

const MASK_PATH = resolve(
  process.env.PORTRAIT_MASK_OUTPUT ?? "public/portrait-particle-mask.png",
);

export function portraitMaskPng(): Buffer {
  const canvas = createCanvas(MASK_WIDTH, MASK_HEIGHT);
  const context = canvas.getContext("2d");

  context.fillStyle = "#ffffff";
  context.beginPath();
  context.moveTo(0.28 * MASK_WIDTH, 0.18 * MASK_HEIGHT);
  context.bezierCurveTo(
    0.34 * MASK_WIDTH,
    0.1 * MASK_HEIGHT,
    0.64 * MASK_WIDTH,
    0.09 * MASK_HEIGHT,
    0.76 * MASK_WIDTH,
    0.18 * MASK_HEIGHT,
  );
  context.bezierCurveTo(
    0.86 * MASK_WIDTH,
    0.27 * MASK_HEIGHT,
    0.84 * MASK_WIDTH,
    0.52 * MASK_HEIGHT,
    0.72 * MASK_WIDTH,
    0.63 * MASK_HEIGHT,
  );
  context.bezierCurveTo(
    0.69 * MASK_WIDTH,
    0.68 * MASK_HEIGHT,
    0.72 * MASK_WIDTH,
    0.72 * MASK_HEIGHT,
    0.82 * MASK_WIDTH,
    0.75 * MASK_HEIGHT,
  );
  context.bezierCurveTo(
    0.92 * MASK_WIDTH,
    0.78 * MASK_HEIGHT,
    0.98 * MASK_WIDTH,
    0.86 * MASK_HEIGHT,
    MASK_WIDTH,
    MASK_HEIGHT,
  );
  context.lineTo(0, MASK_HEIGHT);
  context.bezierCurveTo(
    0.02 * MASK_WIDTH,
    0.85 * MASK_HEIGHT,
    0.12 * MASK_WIDTH,
    0.78 * MASK_HEIGHT,
    0.31 * MASK_WIDTH,
    0.74 * MASK_HEIGHT,
  );
  context.bezierCurveTo(
    0.39 * MASK_WIDTH,
    0.72 * MASK_HEIGHT,
    0.41 * MASK_WIDTH,
    0.68 * MASK_HEIGHT,
    0.38 * MASK_WIDTH,
    0.63 * MASK_HEIGHT,
  );
  context.bezierCurveTo(
    0.25 * MASK_WIDTH,
    0.54 * MASK_HEIGHT,
    0.22 * MASK_WIDTH,
    0.3 * MASK_HEIGHT,
    0.28 * MASK_WIDTH,
    0.18 * MASK_HEIGHT,
  );
  context.closePath();
  context.fill();

  return canvas.toBuffer("image/png");
}

function main(): void {
  const args = process.argv.slice(2);
  const verify = args.length === 1 && args[0] === "--verify";

  if (args.length > 0 && !verify) {
    throw new Error(
      "Unsupported portrait mask arguments. Usage: tsx scripts/build-portrait-mask.ts [--verify]",
    );
  }

  const expected = portraitMaskPng();

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
  main();
}
