import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";

import { PORTRAIT_GEOMETRY } from "../src/particles/portrait-geometry";

const canonicalMaskPath = resolve(
  "scripts/assets/portrait-subject-mask.png",
);
const originalMaskPath = resolve(
  "scripts/assets/portrait-subject-mask-original.png",
);

async function maskPixels(buffer: Buffer) {
  const image = await loadImage(buffer);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return {
    width: image.width,
    height: image.height,
    data: context.getImageData(0, 0, image.width, image.height).data,
  };
}

describe("extended portrait subject mask", () => {
  it("keeps the immutable 1104x1425 mask separate from the canonical output", async () => {
    expect(existsSync(originalMaskPath)).toBe(true);
    const original = await maskPixels(readFileSync(originalMaskPath));
    expect([original.width, original.height]).toEqual([
      PORTRAIT_GEOMETRY.originalWidth,
      PORTRAIT_GEOMETRY.originalHeight,
    ]);
  });

  it("builds deterministic 1350x1425 canonical mask bytes", async () => {
    const { buildPortraitMask } = await import("./build-portrait-arm-assets");
    const first = await buildPortraitMask();
    const second = await buildPortraitMask();
    const mask = await maskPixels(first);

    expect(first.equals(second)).toBe(true);
    expect([mask.width, mask.height]).toEqual([
      PORTRAIT_GEOMETRY.width,
      PORTRAIT_GEOMETRY.height,
    ]);
  });

  it("connects both upper arms at the bottom without filling the surrounding background", async () => {
    const { buildPortraitMask } = await import("./build-portrait-arm-assets");
    const { width, data } = await maskPixels(await buildPortraitMask());
    const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3]!;

    expect(alphaAt(120, 1220), "left upper arm").toBeGreaterThan(200);
    expect(alphaAt(1180, 1220), "right upper arm").toBeGreaterThan(200);
    expect(alphaAt(0, 1220), "left canvas edge").toBe(0);
    expect(alphaAt(1349, 1220), "right canvas edge").toBe(0);
    expect(alphaAt(75, 900), "above left shoulder").toBe(0);
    expect(alphaAt(1220, 900), "above right shoulder").toBe(0);
    expect(alphaAt(1120, 980), "outside the upper-right shoulder").toBe(0);
    expect(alphaAt(100, 1050), "outside the upper-left shoulder").toBe(0);
    expect(alphaAt(75, 1220), "background beside left arm").toBe(0);
    expect(alphaAt(1220, 1220), "background beside right arm").toBe(0);
    expect(alphaAt(230, 1000), "left shoulder connection").toBeGreaterThan(
      200,
    );
    expect(alphaAt(1040, 1000), "right shoulder connection").toBeGreaterThan(
      200,
    );
    expect(alphaAt(550, 900), "upper-left shoulder connection").toBeGreaterThan(
      200,
    );
    expect(alphaAt(850, 925), "upper-right shoulder connection").toBeGreaterThan(
      200,
    );
  });

  it("keeps the former shoulder arcs and restoration fringe out of the opaque mask", async () => {
    const { buildPortraitMask } = await import("./build-portrait-arm-assets");
    const { width, data } = await maskPixels(await buildPortraitMask());
    const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3]!;

    expect(alphaAt(350, 900), "left background arc at shoulder height").toBe(0);
    expect(alphaAt(300, 925), "left background arc above the sweater").toBe(0);
    expect(alphaAt(275, 950), "left background band outside the sweater").toBe(0);
    expect(alphaAt(140, 1050), "left shoulder halo outside the sweater").toBe(0);
    expect(alphaAt(928, 975), "right restoration fringe").toBeLessThan(200);
    expect(alphaAt(972, 1000), "right restoration fringe").toBeLessThan(200);
    expect(alphaAt(1012, 1025), "right restoration fringe").toBeLessThan(200);
  });

  it("preserves every shifted alpha value inside the protected identity and torso core", async () => {
    const { buildPortraitMask } = await import("./build-portrait-arm-assets");
    const [built, original] = await Promise.all([
      maskPixels(await buildPortraitMask()),
      maskPixels(readFileSync(originalMaskPath)),
    ]);

    let protectedPixels = 0;
    let firstMissingPixel: { x: number; y: number } | undefined;
    for (let y = 0; y < original.height; y += 1) {
      for (
        let x = PORTRAIT_GEOMETRY.protectedMinX;
        x <= PORTRAIT_GEOMETRY.protectedMaxX;
        x += 1
      ) {
        const originalAlpha = original.data[(y * original.width + x) * 4 + 3]!;
        if (originalAlpha === 0) continue;

        protectedPixels += 1;
        const outputAlpha =
          built.data[
            (y * built.width + x + PORTRAIT_GEOMETRY.originalOffsetX) * 4 + 3
          ]!;
        if (outputAlpha !== originalAlpha) {
          firstMissingPixel = { x, y };
          break;
        }
      }
      if (firstMissingPixel) break;
    }
    expect(firstMissingPixel).toBeUndefined();
    expect(protectedPixels).toBeGreaterThan(250_000);
  });

  it("matches the committed canonical mask", async () => {
    const { buildPortraitMask } = await import("./build-portrait-arm-assets");
    expect(readFileSync(canonicalMaskPath).equals(await buildPortraitMask())).toBe(
      true,
    );
  });
});
