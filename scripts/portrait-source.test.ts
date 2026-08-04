import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";

const originalPath = resolve("scripts/assets/portrait-original.png");
const productionPath = resolve("src/assets/portrait.png");
const WIDTH = 1104;
const HEIGHT = 1425;

async function pixelsAt(path: string): Promise<Uint8ClampedArray> {
  const image = await loadImage(readFileSync(path));
  expect([image.width, image.height]).toEqual([WIDTH, HEIGHT]);
  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, WIDTH, HEIGHT).data;
}

describe("particle portrait source", () => {
  it("keeps an immutable copy of the user-supplied photograph", () => {
    expect(existsSync(originalPath)).toBe(true);
  });

  it("limits generated repair pixels to the lower-right sweater arm", async () => {
    const [original, production] = await Promise.all([
      pixelsAt(originalPath),
      pixelsAt(productionPath),
    ]);
    let changedPixels = 0;

    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        const index = (y * WIDTH + x) * 4;
        const changed = [0, 1, 2, 3].some(
          (channel) => original[index + channel] !== production[index + channel],
        );
        if (!changed) continue;

        changedPixels += 1;
        expect(x, `changed x at ${x},${y}`).toBeGreaterThanOrEqual(920);
        expect(y, `changed y at ${x},${y}`).toBeGreaterThanOrEqual(980);
      }
    }

    expect(changedPixels).toBeGreaterThan(1_000);
  });
});
