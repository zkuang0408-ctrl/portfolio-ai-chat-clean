// @vitest-environment node

import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "vitest";

const projectPdfs = [
  "public/projects/pdfs/inkseat.pdf",
  "public/projects/pdfs/emovue.pdf",
  "public/projects/pdfs/fruit-evolution.pdf",
  "public/projects/pdfs/atempo.pdf",
  "public/projects/pdfs/urosense.pdf",
  "public/projects/pdfs/first-fly.pdf",
] as const;

const documentAssets = [
  "public/documents/zhao-shikuang-portfolio.pdf",
  "public/documents/zhao-shikuang-portfolio.pptx",
] as const;

test("ships every stable project and portfolio asset", () => {
  for (const asset of [...projectPdfs, ...documentAssets]) {
    expect(statSync(resolve(process.cwd(), asset)).size, asset).toBeGreaterThan(0);
  }
});

test("ships valid PDF and PPTX file signatures", () => {
  for (const asset of projectPdfs) {
    const pdf = readFileSync(resolve(process.cwd(), asset));

    expect(pdf.subarray(0, 4).toString("ascii"), asset).toBe("%PDF");
  }

  const pdf = readFileSync(
    resolve(process.cwd(), "public/documents/zhao-shikuang-portfolio.pdf"),
  );
  const pptx = readFileSync(
    resolve(process.cwd(), "public/documents/zhao-shikuang-portfolio.pptx"),
  );

  expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  expect(pptx.subarray(0, 2).toString("ascii")).toBe("PK");
});
