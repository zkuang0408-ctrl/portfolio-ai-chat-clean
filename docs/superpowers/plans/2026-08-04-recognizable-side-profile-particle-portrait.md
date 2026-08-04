# Recognizable Side-Profile Particle Portrait Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the homepage particle source with the approved real side-profile photograph, isolate only Zhao Shikuang, and make the glasses, facial structure, jaw, Adam's apple, neck, and collar immediately recognizable without changing the pure-particle style or surrounding UI.

**Architecture:** Wire the homepage Canvas to `src/assets/portrait.png` while leaving the résumé portrait URL unchanged. Preserve the original upload separately and constrain the user-authorized generated sweater-arm repair to a tested lower-right region. Store the hand-refined subject alpha as a canonical authoring asset and make the existing mask script copy and validate it deterministically. Keep the current sampler pipeline, but align its normalized regions to the new photograph and combine negative luminance, middle-gray preservation, and edge contribution only in the chin-to-collar bridge.

**Tech Stack:** TypeScript, Vitest, `@napi-rs/canvas`, Pillow/NumPy for one-time local mask authoring, Vite, Playwright CLI, Impeccable detector.

---

## File Structure

- Create `src/particles/assets.ts`: own the distinct homepage-particle and résumé portrait URLs.
- Create `src/particles/assets.test.ts`: prove those two consumers remain intentionally separate.
- Replace `src/assets/portrait.png`: store the approved `1104 × 1425` photograph with only the user-authorized lower-right sweater-arm repair, used solely as hidden Canvas input.
- Create `scripts/assets/portrait-original.png`: preserve the immutable user upload used to prove identity pixels remain unchanged.
- Create `scripts/portrait-source.test.ts`: constrain generated repair pixels to the approved lower-right sweater arm.
- Create `scripts/assets/portrait-subject-mask.png`: store the reviewed canonical subject alpha.
- Modify `scripts/build-portrait-mask.ts`: validate and emit the canonical mask deterministically.
- Modify `scripts/build-portrait-mask.test.ts`: verify dimensions, required landmarks, forbidden environment/right-arm points, and CLI behavior.
- Modify `src/particles/sampler.ts`: align portrait regions and neck light mapping to the new photograph.
- Modify `src/particles/sampler.test.ts`: lock region geometry, recognizability, mask containment, and unchanged particle quotas.
- Modify `src/particles/renderer.test.ts`: update landmark assertions for the new photograph without changing renderer behavior.
- Modify `src/main.ts`: use the particle source for the hero and retain the existing résumé portrait elsewhere.

### Task 1: Separate the homepage particle source from the résumé portrait

**Files:**
- Create: `src/particles/assets.test.ts`
- Create: `src/particles/assets.ts`
- Modify: `src/main.ts:1-20,68-74`
- Replace: `src/assets/portrait.png`

- [ ] **Step 1: Write the failing asset-routing test**

Create `src/particles/assets.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  PARTICLE_PORTRAIT_URL,
  RESUME_PORTRAIT_URL,
} from "./assets";

describe("portrait assets", () => {
  it("keeps the homepage particle source separate from the resume portrait", () => {
    expect(PARTICLE_PORTRAIT_URL).toContain("portrait");
    expect(RESUME_PORTRAIT_URL).toBe("/portrait-resume-retouched-v1.png");
    expect(PARTICLE_PORTRAIT_URL).not.toBe(RESUME_PORTRAIT_URL);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- --run src/particles/assets.test.ts --testTimeout=20000
```

Expected: FAIL because `src/particles/assets.ts` does not exist yet.

- [ ] **Step 3: Add the minimal asset module**

Create `src/particles/assets.ts`:

```ts
import particlePortraitUrl from "../assets/portrait.png";

export const PARTICLE_PORTRAIT_URL = particlePortraitUrl;
export const RESUME_PORTRAIT_URL = "/portrait-resume-retouched-v1.png";
```

Replace `src/assets/portrait.png` with the approved uploaded file without resampling, retouching, or color conversion. Confirm its dimensions before copying:

```powershell
node -e "const {loadImage}=require('@napi-rs/canvas'); loadImage(process.argv[1]).then(i=>{console.log(i.width+'x'+i.height); if(i.width!==1104||i.height!==1425) process.exit(1)})" "C:\Users\Kuang\AppData\Local\Temp\codex-clipboard-3cf710eb-9c30-446f-b516-1b0399ed446c.png"
Copy-Item -LiteralPath "C:\Users\Kuang\AppData\Local\Temp\codex-clipboard-3cf710eb-9c30-446f-b516-1b0399ed446c.png" -Destination "src\assets\portrait.png" -Force
```

- [ ] **Step 4: Wire the two consumers explicitly**

In `src/main.ts`, import the two URLs and remove the shared `portraitUrl` constant:

```ts
import {
  PARTICLE_PORTRAIT_URL,
  RESUME_PORTRAIT_URL,
} from "./particles/assets";
```

Use them at the existing call sites:

```ts
const portrait = renderHero(
  app,
  PARTICLE_PORTRAIT_URL,
  portraitMaskUrl,
  locale,
);
// ...
renderPortfolio(portfolioRoot, { portraitUrl: RESUME_PORTRAIT_URL });
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```powershell
npm.cmd test -- --run src/particles/assets.test.ts src/hero/render-hero.test.ts src/resume/render-resume.test.ts --testTimeout=20000
```

Expected: all focused tests pass; the asset test proves the homepage and résumé do not share the new source.

- [ ] **Step 6: Commit the source routing**

```powershell
git add -- src/particles/assets.ts src/particles/assets.test.ts src/main.ts src/assets/portrait.png
git commit -m "feat: wire side-profile particle source"
```

### Task 2: Replace the generic outline with a precise canonical subject mask

**Files:**
- Create: `scripts/assets/portrait-subject-mask.png`
- Modify: `scripts/build-portrait-mask.test.ts`
- Modify: `scripts/build-portrait-mask.ts`
- Regenerate: `public/portrait-particle-mask.png`
- Create: `scripts/assets/portrait-original.png`
- Create: `scripts/portrait-source.test.ts`
- Modify: `src/assets/portrait.png` only inside the approved lower-right repair region

- [ ] **Step 1: Write failing subject-scope tests**

In `scripts/build-portrait-mask.test.ts`, add a canonical-path assertion and replace the old generic checkpoints with named required and forbidden pixels:

```ts
const canonicalMaskPath = resolve("scripts/assets/portrait-subject-mask.png");

const requiredSubjectPoints = [
  [0.5, 0.16, "hair crown"],
  [0.37, 0.36, "left glasses and eye"],
  [0.55, 0.37, "right glasses and eye"],
  [0.48, 0.49, "nose and mouth core"],
  [0.43, 0.58, "chin"],
  [0.49, 0.66, "Adam's apple"],
  [0.5, 0.75, "collar"],
  [0.5, 0.92, "lower garment"],
] as const;

const forbiddenEnvironmentPoints = [
  [0.05, 0.05, "upper-left wall"],
  [0.12, 0.45, "left furniture"],
  [0.9, 0.56, "right background gap"],
  [0.97, 0.68, "raised foreign forearm"],
  [0.97, 0.9, "foreign black sleeve"],
] as const;

it("has a committed canonical subject mask", () => {
  expect(existsSync(canonicalMaskPath)).toBe(true);
});

it("retains required identity and clothing points while excluding the environment", async () => {
  const image = await loadImage(readFileSync(maskPath));
  const canvas = createCanvas(MASK_WIDTH, MASK_HEIGHT);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const alphaAt = (x: number, y: number) =>
    context.getImageData(
      Math.round(x * (MASK_WIDTH - 1)),
      Math.round(y * (MASK_HEIGHT - 1)),
      1,
      1,
    ).data[3] ?? 0;

  for (const [x, y, label] of requiredSubjectPoints) {
    expect(alphaAt(x, y), label).toBeGreaterThan(200);
  }
  for (const [x, y, label] of forbiddenEnvironmentPoints) {
    expect(alphaAt(x, y), label).toBe(0);
  }
});
```

- [ ] **Step 2: Run the mask tests and verify RED**

Run:

```powershell
npm.cmd test -- --run scripts/build-portrait-mask.test.ts --testTimeout=20000
```

Expected: FAIL because the canonical bitmap is missing and the current generic mask includes the confirmed right-side sleeve area.

- [ ] **Step 3: Produce and inspect the canonical mask**

Use a local discriminative segmentation pass only to initialize alpha, with positive prompts on the central face/torso and negative prompts on the raised right arm. Refine the resulting bitmap manually with Pillow/NumPy so it includes hair, glasses arms, jaw, full neck, collar, shoulders, and bottom clothing while excluding all environment pixels. Do not alter the RGB source image.

Save the result at exactly `1104 × 1425` as `scripts/assets/portrait-subject-mask.png`, with the subject in alpha and transparent background. Render it over a checkerboard and over solid red for visual inspection before continuing.

- [ ] **Step 4: Replace the procedural generator with canonical validation**

Refactor `scripts/build-portrait-mask.ts` so `portraitMaskPng()` reads the canonical source and the CLI validates both dimensions and subject scope before generating or verifying:

```ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createCanvas, Image } from "@napi-rs/canvas";

export const MASK_WIDTH = 1104;
export const MASK_HEIGHT = 1425;
export const CANONICAL_MASK_PATH = resolve(
  process.env.PORTRAIT_MASK_SOURCE ??
    fileURLToPath(new URL("assets/portrait-subject-mask.png", import.meta.url)),
);

const MASK_PATH = resolve(
  process.env.PORTRAIT_MASK_OUTPUT ?? "public/portrait-particle-mask.png",
);

const REQUIRED_POINTS = [
  [0.5, 0.16], [0.37, 0.36], [0.55, 0.37], [0.48, 0.49],
  [0.43, 0.58], [0.49, 0.66], [0.5, 0.75], [0.5, 0.92],
] as const;
const FORBIDDEN_POINTS = [
  [0.05, 0.05], [0.12, 0.45], [0.9, 0.56], [0.97, 0.68], [0.97, 0.9],
] as const;

export function portraitMaskPng(): Buffer {
  if (!existsSync(CANONICAL_MASK_PATH)) {
    throw new Error("Canonical portrait subject mask is missing.");
  }
  return readFileSync(CANONICAL_MASK_PATH);
}

export function validatePortraitMask(png: Buffer): void {
  const image = new Image();
  image.src = png;
  if (image.width !== MASK_WIDTH || image.height !== MASK_HEIGHT) {
    throw new Error(`Portrait subject mask must be ${MASK_WIDTH}x${MASK_HEIGHT}.`);
  }
  const canvas = createCanvas(MASK_WIDTH, MASK_HEIGHT);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const alphaAt = ([nx, ny]: readonly [number, number]): number =>
    context.getImageData(
      Math.round(nx * (MASK_WIDTH - 1)),
      Math.round(ny * (MASK_HEIGHT - 1)),
      1,
      1,
    ).data[3] ?? 0;
  if (REQUIRED_POINTS.some((point) => alphaAt(point) <= 200)) {
    throw new Error("Portrait subject mask omits a required subject landmark.");
  }
  if (FORBIDDEN_POINTS.some((point) => alphaAt(point) !== 0)) {
    throw new Error("Portrait subject mask includes a forbidden environment region.");
  }
}
```

Keep the existing CLI argument handling and byte-for-byte generation/verification behavior, but call `validatePortraitMask(expected)` before reading or writing `MASK_PATH`.

- [ ] **Step 5: Generate the public mask and verify GREEN**

Run:

```powershell
npm.cmd run portrait-mask:generate
npm.cmd test -- --run scripts/build-portrait-mask.test.ts --testTimeout=20000
npm.cmd run portrait-mask:verify
```

Expected: the focused tests pass, the public mask exactly matches the canonical mask, and the CLI reports `1104x1425`.

- [ ] **Step 6: Commit the mask pipeline**

```powershell
git add -- scripts/assets/portrait-subject-mask.png scripts/build-portrait-mask.ts scripts/build-portrait-mask.test.ts public/portrait-particle-mask.png
git commit -m "feat: add precise side-profile subject mask"
```

### Task 3: Align sampling to identity anchors and the chin-to-collar bridge

**Files:**
- Modify: `src/particles/sampler.test.ts`
- Modify: `src/particles/sampler.ts:107-212,522-586`

- [ ] **Step 1: Write failing region and neck-light tests**

Export `portraitRegionAt` in the test import and add:

```ts
it.each([
  [410, 510, "left glasses"],
  [610, 510, "right glasses"],
  [520, 650, "nose and mouth"],
  [470, 815, "chin and jaw"],
  [535, 930, "Adam's apple"],
  [550, 1030, "collar bridge"],
] as const)("keeps %s,%s %s in the fixed identity core", (x, y) => {
  expect(portraitRegionAt(x, y, 1104, 1425)).toBe("core");
});

it("keeps the new neck bridge dimensional with middle gray and edges", () => {
  const smoothBrightNeck = portraitLightAt(0.82, 0, 535, 930, 1104, 1425);
  const edgedBrightNeck = portraitLightAt(0.82, 0.35, 535, 930, 1104, 1425);
  const brightFace = portraitLightAt(0.82, 0.35, 535, 610, 1104, 1425);

  expect(smoothBrightNeck).toBeGreaterThan(0.45);
  expect(smoothBrightNeck).toBeLessThan(0.75);
  expect(edgedBrightNeck).toBeGreaterThan(smoothBrightNeck);
  expect(brightFace).toBeCloseTo(0.18);
});
```

Update the existing calls to `portraitLightAt` with the new edge-score argument.

- [ ] **Step 2: Run the focused sampler tests and verify RED**

Run:

```powershell
npm.cmd test -- --run src/particles/sampler.test.ts --testTimeout=20000
```

Expected: FAIL because `portraitRegionAt` is not exported, the old face ellipse does not include the new chin/collar anchors, and `portraitLightAt` does not accept edge contribution.

- [ ] **Step 3: Implement the normalized identity and neck geometry**

Replace the generic `regionAt` with source-aligned helpers:

```ts
function isNeckBridgeAt(nx: number, ny: number): boolean {
  if (ny < 0.55 || ny > 0.75) return false;
  const progress = clamp01((ny - 0.55) / 0.2);
  const centerX = 0.46 + progress * 0.04;
  const halfWidth = 0.075 + progress * 0.08;
  return Math.abs(nx - centerX) <= halfWidth;
}

export function portraitRegionAt(
  x: number,
  y: number,
  width: number,
  height: number,
): ParticleRegion {
  const nx = x / width;
  const ny = y / height;
  const identityCore = isInsideEllipse(nx, ny, 0.47, 0.43, 0.2, 0.22);
  if (identityCore || isNeckBridgeAt(nx, ny)) return "core";
  if (isInsideEllipse(nx, ny, 0.51, 0.4, 0.31, 0.33)) return "face";
  return "edge";
}
```

Use `portraitRegionAt` in `samplePortrait`. Keep `settledTargetForRegion` unchanged so every `core` point remains fixed.

- [ ] **Step 4: Implement edge-aware middle-gray preservation only in the neck bridge**

Change the light function signature and body:

```ts
export function portraitLightAt(
  sourceLight: number,
  edgeScore: number,
  x: number,
  y: number,
  width: number,
  height: number,
): number {
  const inverted = invertPortraitLuminance(sourceLight);
  if (![edgeScore, x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return inverted;
  }
  const nx = x / width;
  const ny = y / height;
  if (!isNeckBridgeAt(nx, ny)) return inverted;

  const source = clamp01(sourceLight);
  const edge = clamp01(edgeScore);
  const middleGray = 1 - Math.abs(source - 0.5) * 2;
  return clamp01(Math.max(
    inverted,
    source * 0.64 + middleGray * 0.18 + edge * 0.25,
  ));
}
```

In `samplePortrait`, calculate `const edge = edgeStrength(buffer, x, y)` before calculating `light`, then call `portraitLightAt(sourceLight, edge, x, y, buffer.width, buffer.height)`.

- [ ] **Step 5: Raise recognizable-core acceptance without changing total quotas**

Change only the core base in `particleAcceptance`:

```ts
region === "core"
  ? Math.min(
      0.94,
      0.07 + safeLight * 0.24 + safeEdge * 1.8 * edgeLuminanceSide,
    )
```

Update the exact core acceptance expectations in `sampler.test.ts`. Do not change `SIZE_BAND_SHARES`, radius ranges, `MAX_PARTICLES`, or any large/splash eligibility rule.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- --run src/particles/sampler.test.ts src/particles/controller.test.ts --testTimeout=20000
```

Expected: all sampler and controller tests pass, `7,000` and `14,000` samples retain exact `82/15/3/0` quotas, and all final targets remain inside the mask.

- [ ] **Step 7: Commit the recognizability mapping**

```powershell
git add -- src/particles/sampler.ts src/particles/sampler.test.ts
git commit -m "feat: prioritize recognizable portrait landmarks"
```

### Task 4: Lock the new source composition without changing layout

**Files:**
- Modify: `src/particles/renderer.test.ts:7-20,137-183`
- Verify unchanged: `src/particles/renderer.ts`

- [ ] **Step 1: Replace old landmarks with the approved photograph's landmarks**

Use the new image coordinates:

```ts
const portraitSource = { width: 1_104, height: 1_425 };
const portraitLandmarks = {
  hairTop: { x: 575, y: 180 },
  glassesLeft: { x: 410, y: 510 },
  glassesRight: { x: 610, y: 510 },
  chin: { x: 470, y: 815 },
  adamApple: { x: 535, y: 930 },
  collar: { x: 550, y: 1_030 },
  lowerClothing: { x: 550, y: 1_425 },
};
```

In the viewport table test, assert that both glasses, chin, Adam's apple, and collar stay within the viewport. Replace the old exact face-centering assertion with a central-corridor assertion:

```ts
expect(Math.abs((glassesLeft.x + glassesRight.x) / 2 - width / 2))
  .toBeLessThanOrEqual(width * 0.08);
expect(adamApple.y).toBeLessThan(height);
expect(collar.y).toBeLessThanOrEqual(height * 1.02);
```

- [ ] **Step 2: Run the renderer test as a preservation check**

Run:

```powershell
npm.cmd test -- --run src/particles/renderer.test.ts --testTimeout=20000
```

Expected: PASS with no `renderer.ts` change. If it fails, adjust only landmark assertions that are inaccurate to the real source; do not change composition until browser evidence proves a layout defect.

- [ ] **Step 3: Commit the source-specific acceptance test**

```powershell
git add -- src/particles/renderer.test.ts
git commit -m "test: lock side-profile portrait composition"
```

### Task 5: Verify the complete implementation and desktop presentation

**Files:**
- Verify: all changed source, tests, and assets
- Output: `output/playwright/side-profile-particle-1440x900.png`
- Output: `output/playwright/side-profile-particle-1920x1080.png`
- Output: `output/playwright/side-profile-particle-2040x1026.png`

- [ ] **Step 1: Load the Impeccable craft floor immediately before UI completion work**

Read `C:\Users\Kuang\.codex\skills\impeccable\reference\craft-floor.md` and preserve the existing Experience-mode black editorial world. Do not alter copy, navigation, assistant, projects, résumé layout, or global tokens.

- [ ] **Step 2: Run fresh full verification**

Run:

```powershell
npm.cmd test -- --testTimeout=20000
npm.cmd run portrait-mask:verify
npm.cmd run build
```

Expected: all Vitest files pass with zero failed tests, the mask verifies at `1104x1425`, TypeScript reports no errors, Vite produces `dist`, and the client bundle check passes.

- [ ] **Step 3: Ensure Vite Preview is available on the approved URL**

Check:

```powershell
try { (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:4173/").StatusCode } catch { 0 }
```

If the result is not `200`, run `npm.cmd run build`, then launch the preview hidden:

```powershell
Start-Process -FilePath "npm.cmd" -ArgumentList "run","preview","--","--host","127.0.0.1","--port","4173" -WorkingDirectory (Get-Location) -WindowStyle Hidden -RedirectStandardOutput "output\preview.stdout.log" -RedirectStandardError "output\preview.stderr.log"
```

- [ ] **Step 4: Capture one bounded desktop screenshot batch**

Run:

```powershell
npx.cmd playwright screenshot --viewport-size="1440,900" --wait-for-timeout 2800 http://127.0.0.1:4173/ output/playwright/side-profile-particle-1440x900.png
npx.cmd playwright screenshot --viewport-size="1920,1080" --wait-for-timeout 2800 http://127.0.0.1:4173/ output/playwright/side-profile-particle-1920x1080.png
npx.cmd playwright screenshot --viewport-size="2040,1026" --wait-for-timeout 2800 http://127.0.0.1:4173/ output/playwright/side-profile-particle-2040x1026.png
```

Inspect all three together. Required evidence: recognizable glasses/eyes/nose/mouth/hairstyle; continuous jaw, Adam's apple, neck, and collar; zero particles in the foreign right arm or environment; particulate rather than photo-overlay edges; unchanged navigation, headline, supporting copy, AI assistant, and page layout.

The three required review sizes are `1440 × 900`, `1920 × 1080`, and `2040 × 1026`.

- [ ] **Step 5: Fix the screenshot batch once, then perform at most one confirmation batch**

If the batch exposes defects, add a failing sampler or renderer test for each code defect, verify RED, make one grouped implementation correction, rerun the focused tests, rebuild, and capture the same three screenshots once more. Do not exceed the Impeccable two-pass visual ceiling.

- [ ] **Step 6: Run the Impeccable detector once**

Run after visual work is complete:

```powershell
node "C:\Users\Kuang\.codex\skills\impeccable\scripts\detect.mjs" --json src/main.ts src/particles/assets.ts src/particles/sampler.ts src/particles/renderer.ts
```

Expected: no new mechanical UI-quality findings. Record narrow intentional exceptions if any finding conflicts with the approved particle design.

- [ ] **Step 7: Run final verification after the last visual change**

Run:

```powershell
npm.cmd test -- --testTimeout=20000
npm.cmd run portrait-mask:verify
npm.cmd run build
git diff --check
git status --short --branch
```

Expected: zero test failures, successful mask verification and build, no whitespace errors, and only intended tracked changes plus the pre-existing untracked preview artifacts.

- [ ] **Step 8: Commit the bounded visual correction if needed**

```powershell
git add -- src scripts public
git commit -m "fix: refine side-profile particle likeness"
```

Do not add `.playwright-cli`, preview logs, debug logs, or `output/` artifacts. Keep `feature/black-ui-redesign-20260802` isolated and do not merge or modify the original website branch.
