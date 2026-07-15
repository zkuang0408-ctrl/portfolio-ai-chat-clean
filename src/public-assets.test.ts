// @vitest-environment node

import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "vitest";

const publicAssets = [
  "public/projects/atempo.png",
  "public/projects/inkseat.png",
  "public/projects/emovue.png",
  "public/projects/urosense.png",
  "public/projects/evolution-fruit.png",
  "public/projects/first-fly.png",
  "public/documents/zhao-shikuang-portfolio.pdf",
  "public/documents/zhao-shikuang-portfolio.pptx",
] as const;

test("ships every stable project and portfolio asset", () => {
  for (const asset of publicAssets) {
    expect(statSync(resolve(process.cwd(), asset)).size, asset).toBeGreaterThan(0);
  }
});

test("ships valid PDF and PPTX file signatures", () => {
  const pdf = readFileSync(
    resolve(process.cwd(), "public/documents/zhao-shikuang-portfolio.pdf"),
  );
  const pptx = readFileSync(
    resolve(process.cwd(), "public/documents/zhao-shikuang-portfolio.pptx"),
  );

  expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  expect(pptx.subarray(0, 2).toString("ascii")).toBe("PK");
});
