import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";

import { PORTRAIT_GEOMETRY } from "../src/particles/portrait-geometry";

const originalPath = resolve("scripts/assets/portrait-original.png");
const originalMaskPath = resolve(
  "scripts/assets/portrait-subject-mask-original.png",
);
const outpaintPath = resolve("scripts/assets/portrait-arm-outpaint.png");
const productionPath = resolve("src/assets/portrait.png");

async function rgba(pathOrBuffer: string | Buffer) {
  const image = await loadImage(
    typeof pathOrBuffer === "string"
      ? readFileSync(pathOrBuffer)
      : pathOrBuffer,
  );
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return {
    width: image.width,
    height: image.height,
    data: context.getImageData(0, 0, image.width, image.height).data,
  };
}

describe("protected particle portrait source", () => {
  it("keeps immutable copies of the photograph and original subject mask", () => {
    expect(existsSync(originalPath)).toBe(true);
    expect(existsSync(originalMaskPath)).toBe(true);
  });

  it("builds deterministic fully opaque 1350x1425 source bytes", async () => {
    const { buildPortraitSource } = await import(
      "./build-portrait-arm-assets"
    );
    const first = await buildPortraitSource();
    const second = await buildPortraitSource();
    const pixels = await rgba(first);

    expect(first.equals(second)).toBe(true);
    expect([pixels.width, pixels.height]).toEqual([
      PORTRAIT_GEOMETRY.width,
      PORTRAIT_GEOMETRY.height,
    ]);
    let firstTransparentPixel: number | undefined;
    for (let index = 3; index < pixels.data.length; index += 4) {
      if (pixels.data[index] !== 255) {
        firstTransparentPixel = Math.floor(index / 4);
        break;
      }
    }
    expect(firstTransparentPixel).toBeUndefined();
  });

  it("preserves every fully masked real pixel inside the shaped identity and torso core", async () => {
    const { buildPortraitSource, portraitProtectedCoreForY } = await import(
      "./build-portrait-arm-assets"
    );
    const [built, original, originalMask] = await Promise.all([
      rgba(await buildPortraitSource()),
      rgba(originalPath),
      rgba(originalMaskPath),
    ]);

    let protectedPixels = 0;
    let firstMismatch: { x: number; y: number } | undefined;
    for (let y = 0; y < PORTRAIT_GEOMETRY.originalHeight; y += 1) {
      const protectedCore = portraitProtectedCoreForY(y);
      for (
        let x = protectedCore.minX;
        x <= protectedCore.maxX;
        x += 1
      ) {
        const originalIndex =
          (y * PORTRAIT_GEOMETRY.originalWidth + x) * 4;
        if (originalMask.data[originalIndex + 3] === 0) continue;

        protectedPixels += 1;
        const builtIndex =
          (y * PORTRAIT_GEOMETRY.width +
            x +
            PORTRAIT_GEOMETRY.originalOffsetX) *
          4;
        for (let channel = 0; channel < 4; channel += 1) {
          if (
            built.data[builtIndex + channel] !==
            original.data[originalIndex + channel]
          ) {
            firstMismatch = { x, y };
            break;
          }
        }
        if (firstMismatch) break;
      }
      if (firstMismatch) break;
    }

    expect(firstMismatch).toBeUndefined();
    expect(protectedPixels).toBeGreaterThan(225_000);
  });

  it("keeps the face, throat, collar, and central torso on exact source pixels", async () => {
    const { buildPortraitSource } = await import(
      "./build-portrait-arm-assets"
    );
    const [built, original] = await Promise.all([
      rgba(await buildPortraitSource()),
      rgba(originalPath),
    ]);
    const landmarks = [
      [410, 510, "left glasses"],
      [610, 510, "right glasses"],
      [520, 650, "nose and mouth"],
      [470, 815, "chin and jaw"],
      [535, 930, "Adam's apple"],
      [550, 1_030, "collar bridge"],
      [550, 1_220, "central torso"],
    ] as const;

    for (const [x, y, label] of landmarks) {
      const originalIndex =
        (y * PORTRAIT_GEOMETRY.originalWidth + x) * 4;
      const outputIndex =
        (y * PORTRAIT_GEOMETRY.width +
          x +
          PORTRAIT_GEOMETRY.originalOffsetX) *
        4;
      expect(
        Array.from(built.data.slice(outputIndex, outputIndex + 4)),
        label,
      ).toEqual(Array.from(original.data.slice(originalIndex, originalIndex + 4)));
    }
  });

  it("keeps protected background from the outpaint instead of restoring the wall", async () => {
    const { buildPortraitSource } = await import(
      "./build-portrait-arm-assets"
    );
    const [built, original, originalMask, outpaint] = await Promise.all([
      rgba(await buildPortraitSource()),
      rgba(originalPath),
      rgba(originalMaskPath),
      rgba(outpaintPath),
    ]);
    const originalX = PORTRAIT_GEOMETRY.protectedMinX;
    const outputX = originalX + PORTRAIT_GEOMETRY.originalOffsetX;
    const y = 100;
    const originalIndex =
      (y * PORTRAIT_GEOMETRY.originalWidth + originalX) * 4;
    const outputIndex = (y * PORTRAIT_GEOMETRY.width + outputX) * 4;

    expect(originalMask.data[originalIndex + 3]).toBe(0);
    expect(Array.from(built.data.slice(outputIndex, outputIndex + 4))).toEqual(
      Array.from(outpaint.data.slice(outputIndex, outputIndex + 4)),
    );
    expect(Array.from(built.data.slice(outputIndex, outputIndex + 3))).not.toEqual(
      Array.from(original.data.slice(originalIndex, originalIndex + 3)),
    );
  });

  it("matches the committed production source", async () => {
    const { buildPortraitSource } = await import(
      "./build-portrait-arm-assets"
    );
    expect(readFileSync(productionPath).equals(await buildPortraitSource())).toBe(
      true,
    );
  });
});
