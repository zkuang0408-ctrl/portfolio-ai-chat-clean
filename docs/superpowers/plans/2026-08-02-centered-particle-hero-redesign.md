# Centered Particle Hero Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the diffuse full-photo particle field with a recognizable, mask-isolated, centered head-and-shoulders portrait that follows the user-approved Ashley-style composition.

**Architecture:** Generate a deterministic static alpha mask from normalized Bézier control points, then load source and mask as aligned pixel buffers. The sampler rejects every masked-out pixel and protects facial features from oversized particles, while the renderer owns viewport-specific centered cropping. Hero markup and CSS remain responsible for typography, overlap, and responsive negative space.

**Tech Stack:** TypeScript, Vite, Vitest, Canvas 2D, `@napi-rs/canvas`, Playwright, CSS custom properties.

---

## File Map

- Create `scripts/build-portrait-mask.ts`: deterministic build script for the same-size subject alpha mask.
- Create `scripts/build-portrait-mask.test.ts`: verifies dimensions, transparency, subject coverage, and excluded background points.
- Create `public/portrait-particle-mask.png`: generated production mask asset.
- Modify `package.json`: add mask generation and verification commands.
- Modify `src/particles/types.ts`: add mask-aware sampling and viewport composition types.
- Modify `src/particles/sampler.ts`: reject transparent mask pixels and protect facial features.
- Modify `src/particles/sampler.test.ts`: cover mask alignment, empty masks, feature protection, and regional density.
- Modify `src/hero/render-hero.ts`: render and return the hidden mask image.
- Modify `src/hero/render-hero.test.ts`: verify non-visible source and mask markup.
- Modify `src/particles/controller.ts`: decode both aligned images, validate the mask, and fail to typography-only mode safely.
- Modify `src/particles/controller.test.ts`: cover dual loading, invalid masks, and four-pixel parallax.
- Modify `src/particles/renderer.ts`: calculate the approved centered crop by viewport.
- Modify `src/particles/renderer.test.ts`: verify desktop, mobile, and short-landscape composition coordinates.
- Modify `src/main.ts`: provide the mask URL and pass the returned mask element to the controller.
- Modify `src/main.test.ts`: verify the production mask is wired into startup.
- Modify `src/styles.css`: implement the full-screen centered portrait, negative-space typography, light clothing overlap, and mobile collision rules.
- Modify `src/styles.test.ts`: lock the critical full-screen and layering rules.
- Modify `tests/homepage.spec.ts`: verify portrait bounds, hidden sources, responsive title placement, fallback, and reduced motion.
- Modify `DESIGN.md`: record the centered monument composition and mask-only rendering rule.

### Task 1: Generate a Deterministic Subject Mask

**Files:**
- Create: `scripts/build-portrait-mask.ts`
- Create: `scripts/build-portrait-mask.test.ts`
- Create: `public/portrait-particle-mask.png`
- Modify: `package.json`

- [ ] **Step 1: Write the failing mask asset test**

```ts
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadImage } from "@napi-rs/canvas";

describe("particle portrait mask", () => {
  it("matches the approved portrait and excludes known background points", async () => {
    const maskPath = "public/portrait-particle-mask.png";
    expect(existsSync(maskPath)).toBe(true);
    const mask = await loadImage(maskPath);
    expect([mask.width, mask.height]).toEqual([1104, 1425]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/build-portrait-mask.test.ts`

Expected: FAIL because `public/portrait-particle-mask.png` does not exist.

- [ ] **Step 3: Add a deterministic mask generator**

Implement `scripts/build-portrait-mask.ts` with `@napi-rs/canvas`. Draw a transparent 1104×1425 canvas, scale the context to normalized coordinates, and fill one white Bézier silhouette that follows the approved subject:

```ts
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCanvas } from "@napi-rs/canvas";

export const MASK_WIDTH = 1104;
export const MASK_HEIGHT = 1425;

export function portraitMaskPng(): Buffer {
  const canvas = createCanvas(MASK_WIDTH, MASK_HEIGHT);
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, MASK_WIDTH, MASK_HEIGHT);
  context.save();
  context.scale(MASK_WIDTH, MASK_HEIGHT);
  context.beginPath();
  context.moveTo(0.28, 0.18);
  context.bezierCurveTo(0.34, 0.10, 0.64, 0.09, 0.76, 0.18);
  context.bezierCurveTo(0.86, 0.27, 0.84, 0.52, 0.72, 0.63);
  context.bezierCurveTo(0.69, 0.68, 0.72, 0.72, 0.82, 0.75);
  context.bezierCurveTo(0.92, 0.78, 0.98, 0.86, 1.0, 1.0);
  context.lineTo(0, 1.0);
  context.bezierCurveTo(0.02, 0.85, 0.12, 0.78, 0.31, 0.74);
  context.bezierCurveTo(0.39, 0.72, 0.41, 0.68, 0.38, 0.63);
  context.bezierCurveTo(0.25, 0.54, 0.22, 0.30, 0.28, 0.18);
  context.closePath();
  context.fillStyle = "rgba(255,255,255,1)";
  context.fill();
  context.restore();
  return canvas.toBuffer("image/png");
}

const outputPath = resolve("public/portrait-particle-mask.png");
const generated = portraitMaskPng();
if (process.argv.includes("--verify")) {
  const committed = await readFile(outputPath);
  if (!committed.equals(generated)) {
    throw new Error("Portrait particle mask is out of date. Run npm run portrait-mask:generate.");
  }
  console.log(`Verified portrait particle mask: ${MASK_WIDTH}x${MASK_HEIGHT}`);
} else {
  await writeFile(outputPath, generated);
  console.log(`Generated portrait particle mask: ${MASK_WIDTH}x${MASK_HEIGHT}`);
}
```

Add package scripts:

```json
{
  "portrait-mask:generate": "tsx scripts/build-portrait-mask.ts",
  "portrait-mask:verify": "tsx scripts/build-portrait-mask.ts --verify"
}
```

Add `npm run portrait-mask:verify` to `prebuild` before knowledge and project-page verification so production builds detect asset drift.

- [ ] **Step 4: Generate the asset and strengthen the test**

Run: `npm run portrait-mask:generate`

Extend the test to inspect alpha at normalized points. Require transparent background at `(0.05, 0.05)`, `(0.93, 0.48)`, and `(0.98, 0.65)`, and opaque subject pixels at `(0.50, 0.34)`, `(0.50, 0.60)`, and `(0.50, 0.90)`.

- [ ] **Step 5: Run the mask tests and verify reproducibility**

Run: `npx vitest run scripts/build-portrait-mask.test.ts && npm run portrait-mask:verify`

Expected: the test file passes and verification prints `Verified portrait particle mask: 1104x1425`.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/build-portrait-mask.ts scripts/build-portrait-mask.test.ts public/portrait-particle-mask.png
git commit -m "feat: add deterministic portrait subject mask"
```

### Task 2: Enforce Masked Sampling and Facial Detail

**Files:**
- Modify: `src/particles/types.ts`
- Modify: `src/particles/sampler.ts`
- Modify: `src/particles/sampler.test.ts`

- [ ] **Step 1: Write failing sampler tests**

Add fixtures with alpha-zero mask pixels and assert:

```ts
const mask = buffer(80, 120, 0);
function setAlpha(pixels: PixelBuffer, x: number, y: number, alpha: number): void {
  pixels.data[(y * pixels.width + x) * 4 + 3] = alpha;
}
setAlpha(mask, 40, 40, 255);
const particles = samplePortrait(buffer(80, 120, 220), {
  maxParticles: 500,
  seed: 8,
  mask,
});
expect(particles.every(({ targetX, targetY }) =>
  mask.data[(Math.floor(targetY) * mask.width + Math.floor(targetX)) * 4 + 3] > 0,
)).toBe(true);
```

Also assert that mismatched mask dimensions throw `Portrait mask dimensions must match source pixels`, an all-transparent mask returns no particles, and facial-core particles never use `large` or `splash` bands.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx vitest run src/particles/sampler.test.ts`

Expected: FAIL because `SampleOptions` has no `mask` property and the sampler does not inspect alpha.

- [ ] **Step 3: Add the mask contract**

Update `SampleOptions`:

```ts
export interface SampleOptions {
  maxParticles: number;
  seed: number;
  mask?: PixelBuffer;
}
```

In `samplePortrait`, validate aligned dimensions once and reject masked-out candidates before luminance, edge, and region work:

```ts
function maskAlpha(mask: PixelBuffer, x: number, y: number): number {
  return mask.data[(y * mask.width + x) * 4 + 3] ?? 0;
}

if (options.mask && (
  options.mask.width !== pixels.width || options.mask.height !== pixels.height
)) {
  throw new Error("Portrait mask dimensions must match source pixels.");
}

if (options.mask && maskAlpha(options.mask, x, y) === 0) continue;
```

Keep the existing deterministic seed and quota system. Lower clothing/outer-edge acceptance while preserving facial acceptance by changing the non-core branch to:

```ts
const base = region === "core"
  ? Math.min(0.94, 0.035 + safeLight * 0.18 + safeEdge * 1.8 * edgeLuminanceSide)
  : region === "face"
    ? Math.min(0.94, 0.08 + safeLight * 0.48 + safeEdge * 0.52)
    : Math.min(0.72, 0.035 + safeLight * 0.26 + safeEdge * 0.32);
```

Update the existing acceptance test so a `0.7`-light, zero-edge face remains `0.416` while the matching outer edge becomes `0.217`. Preserve the hard ban on large and splash particles in the core.

- [ ] **Step 4: Run sampler tests**

Run: `npx vitest run src/particles/sampler.test.ts`

Expected: all sampler tests pass, including existing exact quota tests.

- [ ] **Step 5: Commit**

```bash
git add src/particles/types.ts src/particles/sampler.ts src/particles/sampler.test.ts
git commit -m "feat: constrain portrait particles to subject mask"
```

### Task 3: Load the Mask and Fail to Typography-Only Mode

**Files:**
- Modify: `src/hero/render-hero.ts`
- Modify: `src/hero/render-hero.test.ts`
- Modify: `src/particles/controller.ts`
- Modify: `src/particles/controller.test.ts`
- Modify: `src/main.ts`
- Modify: `src/main.test.ts`

- [ ] **Step 1: Write failing hero and startup tests**

Require `renderHero` to return a decorative hidden `.portrait-mask`, and require `main.ts` to call `startPortrait` with it:

```ts
expect(startPortrait).toHaveBeenCalledWith({
  canvas: app?.querySelector(".portrait-canvas"),
  portraitBase: app?.querySelector(".portrait-base"),
  portraitMask: app?.querySelector(".portrait-mask"),
  portraitStage: app?.querySelector(".portrait-stage"),
});
```

Add controller tests for two aligned pixel loads, an empty mask, mismatched dimensions, mask decode failure, and a successful sampler call containing `{ mask: maskPixels }`.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx vitest run src/hero/render-hero.test.ts src/particles/controller.test.ts src/main.test.ts`

Expected: FAIL because no mask element or controller option exists.

- [ ] **Step 3: Render and return the hidden mask image**

Change the hero API to accept a mask URL:

```ts
export interface HeroElements {
  canvas: HTMLCanvasElement;
  portraitBase: HTMLImageElement;
  portraitMask: HTMLImageElement;
  portraitStage: HTMLElement;
  chatRoot: HTMLElement;
  chat: ChatElements;
}

export function renderHero(
  root: HTMLElement,
  portraitUrl: string,
  portraitMaskUrl: string,
  locale: ChatLocale = "zh",
): HeroElements
```

Insert `<img class="portrait-mask" alt="" aria-hidden="true" />`, set its `src`, and keep both source images hidden with CSS.

- [ ] **Step 4: Decode and validate both buffers in the controller**

Add `portraitMask` to `StartPortraitOptions`. Load both images with `Promise.all`, reject dimension mismatches, and reject masks without any non-zero alpha:

```ts
const [pixels, mask] = await Promise.all([
  loadPixels(options.portraitBase),
  loadPixels(options.portraitMask),
]);
if (pixels.width !== mask.width || pixels.height !== mask.height) {
  throw new Error("Portrait mask dimensions must match source pixels.");
}
if (!hasVisibleAlpha(mask)) {
  throw new Error("Portrait mask has no visible subject pixels.");
}
const particles = sample(pixels, { maxParticles: particleLimit, seed: PORTRAIT_SEED, mask });
```

Keep the current error class and cleanup path. Do not display either hidden image on failure.

- [ ] **Step 5: Wire the production mask in `main.ts`**

```ts
const portrait = renderHero(
  app,
  "/portrait-resume-retouched-v1.png",
  "/portrait-particle-mask.png",
  locale,
);
```

- [ ] **Step 6: Run focused tests**

Run: `npx vitest run src/hero/render-hero.test.ts src/particles/controller.test.ts src/main.test.ts`

Expected: all three test files pass.

- [ ] **Step 7: Commit**

```bash
git add src/hero/render-hero.ts src/hero/render-hero.test.ts src/particles/controller.ts src/particles/controller.test.ts src/main.ts src/main.test.ts
git commit -m "feat: load isolated portrait mask"
```

### Task 4: Center and Crop the Portrait by Viewport

**Files:**
- Modify: `src/particles/renderer.ts`
- Modify: `src/particles/renderer.test.ts`
- Modify: `src/particles/controller.ts`
- Modify: `src/particles/controller.test.ts`

- [ ] **Step 1: Write failing composition tests**

Export a pure helper and test desktop, mobile, and short landscape values:

```ts
expect(portraitCompositionFor(1440, 836, { width: 1104, height: 1425 })).toEqual(
  expect.objectContaining({ offsetX: expect.any(Number), offsetY: expect.any(Number) }),
);
expect(portraitCompositionFor(390, 722, { width: 1104, height: 1425 }).scale)
  .toBeGreaterThan(0.38);
```

Use particle coordinates corresponding to the hair top, glasses, chin, and lower clothing to assert that the head remains inside the viewport, the clothing crosses the lower edge, and the portrait is centered within one CSS pixel.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx vitest run src/particles/renderer.test.ts src/particles/controller.test.ts`

Expected: FAIL because `portraitCompositionFor` does not exist and parallax is six pixels.

- [ ] **Step 3: Implement the approved composition helper**

```ts
export interface PortraitComposition {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function portraitCompositionFor(
  width: number,
  height: number,
  source: SourceSize,
): PortraitComposition {
  const mobile = width <= 760;
  const shortLandscape = mobile && width > height;
  const widthFactor = shortLandscape ? 0.78 : mobile ? 1.10 : 0.70;
  const heightFactor = shortLandscape ? 0.92 : mobile ? 0.78 : 1.12;
  const scale = Math.max(
    (width / source.width) * widthFactor,
    (height / source.height) * heightFactor,
  );
  return {
    scale,
    offsetX: (width - source.width * scale) / 2,
    offsetY: height * 0.11 - source.height * 0.13 * scale,
  };
}
```

Use this helper in `draw()` instead of the existing contain scale. Keep particle radius proportional to the same scale.

- [ ] **Step 4: Reduce settled parallax to four pixels**

Change the controller normalization from ±6 to ±4 and update the test expectation:

```ts
const x = Math.max(-4, Math.min(4, (pointer.clientX / viewportWidth - 0.5) * 8));
const y = Math.max(-4, Math.min(4, (pointer.clientY / viewportHeight - 0.5) * 8));
```

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run src/particles/renderer.test.ts src/particles/controller.test.ts`

Expected: both test files pass.

- [ ] **Step 6: Commit**

```bash
git add src/particles/renderer.ts src/particles/renderer.test.ts src/particles/controller.ts src/particles/controller.test.ts
git commit -m "feat: center particle portrait across viewports"
```

### Task 5: Recompose Hero Typography and Responsive Layering

**Files:**
- Modify: `src/styles.css`
- Modify: `src/styles.test.ts`
- Modify: `tests/homepage.spec.ts`
- Modify: `DESIGN.md`

- [ ] **Step 1: Write failing CSS contract tests**

Add assertions for a full-screen stage, centered canvas, hidden mask/source, lower-right headline, and safe mobile placement:

```ts
expect(styles).toMatch(/\.hero\s*\{[^}]*min-height:\s*100svh/s);
expect(styles).toMatch(/\.portrait-stage\s*\{[^}]*inset:\s*0/s);
expect(styles).toMatch(/\.portrait-base,\s*\.portrait-mask\s*\{[^}]*visibility:\s*hidden/s);
```

- [ ] **Step 2: Write failing browser assertions**

In `tests/homepage.spec.ts`, assert that neither hidden image is visible, the portrait canvas fills the hero scene, the headline does not intersect a protected face rectangle, and the AI orb does not intersect the headline at 1440×900, 390×844, 430×932, 320×568, and 667×375.

Add a route override that fails `/portrait-particle-mask.png` and assert `.portrait-stage--error` while navigation, title, résumé, and projects remain usable.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npx vitest run src/styles.test.ts && npx playwright test tests/homepage.spec.ts --grep "centered particle portrait"`

Expected: CSS tests or browser tests fail against the current right-aligned portrait.

- [ ] **Step 4: Implement the approved desktop composition**

Use CSS to make `.hero-scene` and `.portrait-stage` fill the usable first screen. Put `.hero-copy` back into two independent layers: identity/role at upper left and headline/supporting copy at lower right. Add a local black fade behind only the lower headline area, not a panel.

Critical rules:

```css
.hero { min-height: 100svh; }
.hero-scene { position: absolute; inset: var(--nav-height) 0 0; }
.portrait-stage { position: absolute; inset: 0; width: 100%; }
.portrait-canvas { width: 100%; height: 100%; }
.portrait-base,
.portrait-mask { position: absolute; visibility: hidden; pointer-events: none; }
.hero-copy { position: absolute; inset: 0; width: 100%; }
.hero-copy .role { position: absolute; top: clamp(52px, 8vh, 96px); left: clamp(24px, 5vw, 88px); }
.hero-copy .headline { position: absolute; right: clamp(28px, 6vw, 110px); bottom: clamp(64px, 10vh, 118px); max-width: min(780px, 58vw); }
.hero-supporting { position: absolute; right: clamp(28px, 6vw, 110px); bottom: clamp(24px, 4vh, 48px); max-width: 48ch; text-align: right; }
```

Use these values for the first implementation. The bounded screenshot review may change them only when a material collision or crop defect is visible, and any correction must retain the approved centered relationships.

- [ ] **Step 5: Implement mobile and short-landscape rules**

Keep the centered portrait. Reduce supporting copy before shrinking the face, preserve 44px navigation targets, and reserve the AI orb corner. The headline may overlap only lower clothing particles. Use:

```css
@media (max-width: 760px) {
  .hero-copy .role { top: 26px; left: 20px; }
  .hero-copy .headline {
    right: 20px;
    bottom: max(108px, calc(82px + env(safe-area-inset-bottom)));
    max-width: calc(100vw - 40px);
    font-size: clamp(42px, 12.5vw, 62px);
    text-align: right;
  }
  .hero-supporting {
    right: 20px;
    bottom: max(60px, calc(36px + env(safe-area-inset-bottom)));
    max-width: 30ch;
    font-size: 11px;
  }
}

@media (max-width: 760px) and (max-height: 680px) and (orientation: landscape) {
  .hero-copy .headline {
    right: 72px;
    bottom: 36px;
    max-width: 50vw;
    font-size: clamp(32px, 5.7vw, 42px);
  }
  .hero-supporting { display: none; }
}
```

- [ ] **Step 6: Update `DESIGN.md`**

Replace the old upper-left-copy/right-rising-portrait statement with the centered monument composition, same-size mask asset, protected facial detail, and 10–15% clothing overlap rule.

- [ ] **Step 7: Run focused tests**

Run: `npx vitest run src/styles.test.ts && npx playwright test tests/homepage.spec.ts --grep "centered particle portrait"`

Expected: CSS tests pass and centered portrait browser tests pass across all configured viewports.

- [ ] **Step 8: Commit**

```bash
git add src/styles.css src/styles.test.ts tests/homepage.spec.ts DESIGN.md
git commit -m "feat: compose centered particle portrait hero"
```

### Task 6: Full Verification and Bounded Visual Review

**Files:**
- Modify if required by the review: only files already listed in Tasks 1–5.

- [ ] **Step 1: Run the complete unit suite**

Run: `npm test`

Expected: all test files pass with zero failures.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: mask verification, knowledge verification, project-page verification, TypeScript, Vite build, and client-boundary checks all pass.

- [ ] **Step 3: Run the complete homepage browser suite**

Run: `npx playwright test tests/homepage.spec.ts`

Expected: all applicable desktop and mobile tests pass; conditional viewport tests may be reported as skipped.

- [ ] **Step 4: Capture one desktop-and-mobile review set**

Capture 1440×900, 390×844, and 667×375 screenshots. Compare them against the user-approved A mockup and Ashley reference for facial recognition, centered crop, clothing extent, title overlap, navigation clearance, and AI-orb clearance.

- [ ] **Step 5: Apply one batched correction if material defects are found**

Fix all material composition defects together. Do not add unrelated visual changes. Re-run the three screenshots once for confirmation and stop polishing.

- [ ] **Step 6: Run final repository checks**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intended files are modified or newly added.

- [ ] **Step 7: Commit final corrections**

```bash
git add package.json public/portrait-particle-mask.png scripts/build-portrait-mask.ts scripts/build-portrait-mask.test.ts src/particles src/hero src/main.ts src/main.test.ts src/styles.css src/styles.test.ts tests/homepage.spec.ts DESIGN.md
git commit -m "fix: finalize centered particle portrait"
```
