import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createCanvas, loadImage } from "@napi-rs/canvas";

import { PORTRAIT_GEOMETRY } from "../src/particles/portrait-geometry";

const ORIGINAL_SOURCE_PATH = resolve("scripts/assets/portrait-original.png");
const ORIGINAL_MASK_PATH = resolve(
  "scripts/assets/portrait-subject-mask-original.png",
);
const OUTPAINT_PATH = resolve("scripts/assets/portrait-arm-outpaint.png");
const PORTRAIT_OUTPUT_PATH = resolve("src/assets/portrait.png");
const MASK_OUTPUT_PATH = resolve("scripts/assets/portrait-subject-mask.png");
const FEATHER_WIDTH = 96;
const GARMENT_START_Y = 850;
const SHOULDER_MATTE_START_Y = 820;
const SHOULDER_MATTE_END_Y = 1_050;
const SHOULDER_LEFT_INSET = 210;
const SHOULDER_RIGHT_INSET = 200;
const DARK_GARMENT_LUMINANCE = 155;
const MIN_GARMENT_RUN_LENGTH = 20;

function assertDimensions(
  label: string,
  image: { width: number; height: number },
  width: number,
  height: number,
): void {
  if (image.width !== width || image.height !== height) {
    throw new Error(
      `${label} must be ${width}x${height}; received ${image.width}x${image.height}.`,
    );
  }
}

function smoothstep(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

export function portraitProtectedCoreForY(y: number): {
  minX: number;
  maxX: number;
} {
  const geometry = PORTRAIT_GEOMETRY;
  if (y <= SHOULDER_MATTE_START_Y || y >= SHOULDER_MATTE_END_Y) {
    return {
      minX: geometry.protectedMinX,
      maxX: geometry.protectedMaxX,
    };
  }

  const progress =
    (y - SHOULDER_MATTE_START_Y) /
    (SHOULDER_MATTE_END_Y - SHOULDER_MATTE_START_Y);
  const shoulderInset = Math.sin(Math.PI * progress);
  return {
    minX: Math.round(
      geometry.protectedMinX + SHOULDER_LEFT_INSET * shoulderInset,
    ),
    maxX: Math.round(
      geometry.protectedMaxX - SHOULDER_RIGHT_INSET * shoulderInset,
    ),
  };
}

export async function buildPortraitSource(): Promise<Buffer> {
  const [original, originalMask, outpaint] = await Promise.all([
    loadImage(readFileSync(ORIGINAL_SOURCE_PATH)),
    loadImage(readFileSync(ORIGINAL_MASK_PATH)),
    loadImage(readFileSync(OUTPAINT_PATH)),
  ]);
  const geometry = PORTRAIT_GEOMETRY;
  assertDimensions(
    "Original portrait",
    original,
    geometry.originalWidth,
    geometry.originalHeight,
  );
  assertDimensions(
    "Original portrait subject mask",
    originalMask,
    geometry.originalWidth,
    geometry.originalHeight,
  );
  assertDimensions(
    "Portrait arm outpaint",
    outpaint,
    geometry.width,
    geometry.height,
  );

  const originalCanvas = createCanvas(
    geometry.originalWidth,
    geometry.originalHeight,
  );
  const originalContext = originalCanvas.getContext("2d");
  originalContext.drawImage(original, 0, 0);
  const originalPixels = originalContext.getImageData(
    0,
    0,
    geometry.originalWidth,
    geometry.originalHeight,
  ).data;

  const maskCanvas = createCanvas(
    geometry.originalWidth,
    geometry.originalHeight,
  );
  const maskContext = maskCanvas.getContext("2d");
  maskContext.drawImage(originalMask, 0, 0);
  const maskPixels = maskContext.getImageData(
    0,
    0,
    geometry.originalWidth,
    geometry.originalHeight,
  ).data;

  const outputCanvas = createCanvas(geometry.width, geometry.height);
  const outputContext = outputCanvas.getContext("2d");
  outputContext.drawImage(outpaint, 0, 0);
  const outputImageData = outputContext.getImageData(
    0,
    0,
    geometry.width,
    geometry.height,
  );
  const outputPixels = outputImageData.data;

  for (let y = 0; y < geometry.originalHeight; y += 1) {
    const protectedCore = portraitProtectedCoreForY(y);
    for (let x = 0; x < geometry.originalWidth; x += 1) {
      const originalIndex = (y * geometry.originalWidth + x) * 4;
      const subjectAlpha = maskPixels[originalIndex + 3] ?? 0;
      if (subjectAlpha === 0) continue;

      let blend = 0;
      if (x >= protectedCore.minX && x <= protectedCore.maxX) {
        blend = 1;
      } else if (
        x >= protectedCore.minX - FEATHER_WIDTH &&
        x < protectedCore.minX
      ) {
        blend = smoothstep(
          (x - (protectedCore.minX - FEATHER_WIDTH)) / FEATHER_WIDTH,
        ) * (subjectAlpha / 255);
      } else if (
        x > protectedCore.maxX &&
        x <= protectedCore.maxX + FEATHER_WIDTH
      ) {
        blend = smoothstep(
          (protectedCore.maxX + FEATHER_WIDTH - x) / FEATHER_WIDTH,
        ) * (subjectAlpha / 255);
      }
      if (blend === 0) continue;

      const outputX = x + geometry.originalOffsetX;
      const outputIndex = (y * geometry.width + outputX) * 4;
      if (blend === 1) {
        outputPixels[outputIndex] = originalPixels[originalIndex]!;
        outputPixels[outputIndex + 1] = originalPixels[originalIndex + 1]!;
        outputPixels[outputIndex + 2] = originalPixels[originalIndex + 2]!;
      } else {
        for (let channel = 0; channel < 3; channel += 1) {
          const current = outputPixels[outputIndex + channel]!;
          const restored = originalPixels[originalIndex + channel]!;
          outputPixels[outputIndex + channel] = Math.round(
            current + (restored - current) * blend,
          );
        }
      }
    }
  }

  for (let index = 3; index < outputPixels.length; index += 4) {
    outputPixels[index] = 255;
  }
  outputContext.putImageData(outputImageData, 0, 0);
  return outputCanvas.toBuffer("image/png");
}

function luminanceAt(pixels: Uint8ClampedArray, index: number): number {
  return (
    pixels[index]! * 0.2126 +
    pixels[index + 1]! * 0.7152 +
    pixels[index + 2]! * 0.0722
  );
}

export async function buildPortraitMask(): Promise<Buffer> {
  const [originalMask, outpaint] = await Promise.all([
    loadImage(readFileSync(ORIGINAL_MASK_PATH)),
    loadImage(readFileSync(OUTPAINT_PATH)),
  ]);
  const geometry = PORTRAIT_GEOMETRY;
  assertDimensions(
    "Original portrait subject mask",
    originalMask,
    geometry.originalWidth,
    geometry.originalHeight,
  );
  assertDimensions(
    "Portrait arm outpaint",
    outpaint,
    geometry.width,
    geometry.height,
  );

  const canvas = createCanvas(geometry.width, geometry.height);
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, geometry.width, geometry.height);
  const maskImageData = context.getImageData(
    0,
    0,
    geometry.width,
    geometry.height,
  );
  const maskPixels = maskImageData.data;

  const originalMaskCanvas = createCanvas(
    geometry.originalWidth,
    geometry.originalHeight,
  );
  const originalMaskContext = originalMaskCanvas.getContext("2d");
  originalMaskContext.drawImage(originalMask, 0, 0);
  const originalMaskPixels = originalMaskContext.getImageData(
    0,
    0,
    geometry.originalWidth,
    geometry.originalHeight,
  ).data;
  const protectedMinX =
    geometry.protectedMinX + geometry.originalOffsetX;
  const protectedMaxX =
    geometry.protectedMaxX + geometry.originalOffsetX;

  for (let y = 0; y < geometry.originalHeight; y += 1) {
    for (
      let originalX = geometry.protectedMinX;
      originalX <= geometry.protectedMaxX;
      originalX += 1
    ) {
      const originalIndex =
        (y * geometry.originalWidth + originalX) * 4;
      const outputIndex =
        (y * geometry.width + originalX + geometry.originalOffsetX) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        maskPixels[outputIndex + channel] =
          originalMaskPixels[originalIndex + channel]!;
      }
    }
  }

  const outpaintCanvas = createCanvas(geometry.width, geometry.height);
  const outpaintContext = outpaintCanvas.getContext("2d");
  outpaintContext.drawImage(outpaint, 0, 0);
  const outpaintPixels = outpaintContext.getImageData(
    0,
    0,
    geometry.width,
    geometry.height,
  ).data;

  for (let y = GARMENT_START_Y; y < geometry.height; y += 1) {
    const runs: Array<{ start: number; end: number }> = [];
    let runStart = -1;
    for (let x = 0; x <= geometry.width; x += 1) {
      const pixelIndex = (y * geometry.width + x) * 4;
      const isDarkGarment =
        x < geometry.width &&
        luminanceAt(outpaintPixels, pixelIndex) < DARK_GARMENT_LUMINANCE;
      if (isDarkGarment && runStart < 0) runStart = x;
      if (isDarkGarment || runStart < 0) continue;

      const end = x - 1;
      if (end - runStart + 1 >= MIN_GARMENT_RUN_LENGTH) {
        let touchesProtectedSubject = false;
        const overlapStart = Math.max(runStart, protectedMinX);
        const overlapEnd = Math.min(end, protectedMaxX);
        for (
          let candidateX = overlapStart;
          candidateX <= overlapEnd;
          candidateX += 1
        ) {
          const candidateIndex = (y * geometry.width + candidateX) * 4;
          if (maskPixels[candidateIndex + 3]! > 0) {
            touchesProtectedSubject = true;
            break;
          }
        }
        if (touchesProtectedSubject) runs.push({ start: runStart, end });
      }
      runStart = -1;
    }
    if (runs.length === 0) continue;

    const start = Math.min(...runs.map((run) => run.start));
    const end = Math.max(...runs.map((run) => run.end));
    for (let x = start; x <= end; x += 1) {
      const index = (y * geometry.width + x) * 4;
      if (maskPixels[index + 3]! > 0) continue;
      maskPixels[index] = 255;
      maskPixels[index + 1] = 255;
      maskPixels[index + 2] = 255;
      maskPixels[index + 3] = 255;
    }
  }

  context.putImageData(maskImageData, 0, 0);
  return canvas.toBuffer("image/png");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const verify = args.length === 1 && args[0] === "--verify";
  if (args.length > 0 && !verify) {
    throw new Error(
      "Unsupported portrait arm asset arguments. Usage: tsx scripts/build-portrait-arm-assets.ts [--verify]",
    );
  }

  const [portrait, mask] = await Promise.all([
    buildPortraitSource(),
    buildPortraitMask(),
  ]);
  if (verify) {
    if (!existsSync(PORTRAIT_OUTPUT_PATH) || !existsSync(MASK_OUTPUT_PATH)) {
      throw new Error(
        "Portrait arm assets are missing. Run `npm run portrait-arm-assets:generate` to create them.",
      );
    }
    if (
      !readFileSync(PORTRAIT_OUTPUT_PATH).equals(portrait) ||
      !readFileSync(MASK_OUTPUT_PATH).equals(mask)
    ) {
      throw new Error(
        "Portrait arm assets have drifted. Run `npm run portrait-arm-assets:generate` and commit the regenerated assets.",
      );
    }
    console.log(
      `Verified portrait arm assets: ${PORTRAIT_GEOMETRY.width}x${PORTRAIT_GEOMETRY.height}`,
    );
    return;
  }

  writeFileSync(PORTRAIT_OUTPUT_PATH, portrait);
  writeFileSync(MASK_OUTPUT_PATH, mask);
  console.log(
    `Generated portrait arm assets: ${PORTRAIT_GEOMETRY.width}x${PORTRAIT_GEOMETRY.height}`,
  );
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
