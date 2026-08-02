import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";

import {
  MASK_HEIGHT,
  MASK_WIDTH,
  portraitMaskPng,
} from "./build-portrait-mask";

const maskPath = resolve("public/portrait-particle-mask.png");

function runVerify() {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm.cmd run portrait-mask:verify"]
      : ["run", "portrait-mask:verify"];

  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

describe.sequential("portrait particle mask", () => {
  it("has a committed generated asset", () => {
    expect(existsSync(maskPath)).toBe(true);
  });

  it("matches the deterministic generator byte for byte", () => {
    expect(portraitMaskPng().equals(readFileSync(maskPath))).toBe(true);
  });

  it("has the expected dimensions and subject-only alpha", async () => {
    const image = await loadImage(readFileSync(maskPath));
    expect([image.width, image.height]).toEqual([MASK_WIDTH, MASK_HEIGHT]);

    const canvas = createCanvas(MASK_WIDTH, MASK_HEIGHT);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);

    const alphaAt = (normalizedX: number, normalizedY: number): number => {
      const x = Math.round(normalizedX * (MASK_WIDTH - 1));
      const y = Math.round(normalizedY * (MASK_HEIGHT - 1));
      return context.getImageData(x, y, 1, 1).data[3]!;
    };

    expect(alphaAt(0.05, 0.05)).toBe(0);
    expect(alphaAt(0.93, 0.48)).toBe(0);
    expect(alphaAt(0.98, 0.65)).toBe(0);
    expect(alphaAt(0.5, 0.34)).toBe(255);
    expect(alphaAt(0.5, 0.6)).toBe(255);
    expect(alphaAt(0.5, 0.9)).toBe(255);
  });

  it("verifies the committed real bytes through the CLI", () => {
    const result = runVerify();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      `Verified portrait particle mask: ${MASK_WIDTH}x${MASK_HEIGHT}`,
    );
  });

  it("reports actionable drift when the committed bytes change", () => {
    const original = readFileSync(maskPath);

    try {
      writeFileSync(maskPath, Buffer.concat([original, Buffer.from([0])]));
      const result = runVerify();

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "Portrait particle mask has drifted. Run `npm run portrait-mask:generate` and commit the regenerated asset.",
      );
    } finally {
      writeFileSync(maskPath, original);
    }
  });
});
