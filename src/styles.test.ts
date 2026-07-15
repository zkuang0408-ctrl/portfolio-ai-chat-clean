import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

test("uses the visible viewport height at the mobile breakpoint", () => {
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.hero\s*\{\s*min-height:\s*100svh;/,
  );
  expect(styles).not.toMatch(/min-height:\s*760px/);
});

test("compresses the hero composition for short mobile viewports", () => {
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)\s*and\s*\(max-height:\s*680px\)/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)\s*and\s*\(max-height:\s*680px\)[\s\S]*?\.identity\s*\{\s*top:\s*12px;/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)\s*and\s*\(max-height:\s*680px\)[\s\S]*?\.portrait-stage\s*\{[\s\S]*?top:\s*80px;[\s\S]*?bottom:\s*18px;/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)\s*and\s*\(max-height:\s*680px\)[\s\S]*?\.headline-wrap\s*\{[\s\S]*?bottom:\s*18px;/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)\s*and\s*\(max-height:\s*680px\)[\s\S]*?\.headline\s*\{\s*font-size:\s*clamp\(38px,\s*12vw,\s*52px\);/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)\s*and\s*\(max-height:\s*680px\)[\s\S]*?\.headline-wrap small\s*\{\s*margin-top:\s*8px;/,
  );
});

test("hides the canvas in controller fallback and error states", () => {
  expect(styles).toMatch(
    /\.portrait-stage--fallback \.portrait-canvas,\s*\.portrait-stage--error \.portrait-canvas,\s*\.portrait-stage\.is-error \.portrait-canvas\s*\{\s*display:\s*none;/,
  );
});

test("never presents the portrait sampling image", () => {
  expect(styles).toMatch(
    /\.portrait-base\s*\{[\s\S]*?opacity:\s*0;/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.portrait-base\s*\{\s*opacity:\s*0;/,
  );
  expect(styles).toMatch(
    /\.portrait-stage--fallback \.portrait-base,\s*\.portrait-stage--error \.portrait-base,\s*\.portrait-stage\.is-error \.portrait-base\s*\{[\s\S]*?opacity:\s*0;/,
  );
  expect(styles).not.toMatch(/opacity:\s*0\.(?:28|32|46)/);
});

test("reveals an accessible status message in error states", () => {
  expect(styles).toMatch(
    /\.portrait-stage--error \.portrait-error,\s*\.portrait-stage\.is-error \.portrait-error\s*\{\s*opacity:\s*1;/,
  );
});
