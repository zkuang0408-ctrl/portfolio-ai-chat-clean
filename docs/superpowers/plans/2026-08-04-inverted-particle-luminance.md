# Inverted Particle Luminance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reverse the portrait's source luminance mapping so dark facial and clothing features produce brighter, denser light particles while the black editorial website remains unchanged.

**Architecture:** Add one pure luminance inversion helper in the particle sampler and apply it immediately after reading each source pixel. Continue to calculate edge strength from the original pixels, then pass the inverted light value through the existing acceptance and visual-output functions. Preserve the alpha mask, regional quotas, deterministic random sequence, geometry, renderer, animation, and responsive layout.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, Vite, Playwright

---

### Task 1: Invert Portrait Luminance in the Sampler

**Files:**
- Modify: `src/particles/sampler.ts`
- Modify: `src/particles/sampler.test.ts`
- Modify: `DESIGN.md`

- [ ] **Step 1: Write failing unit tests for the inversion boundary**

Import a new pure helper and add these focused assertions near the existing luminance and visual tests:

```ts
import {
  invertPortraitLuminance,
  particleAcceptance,
  visualForSample,
} from "./sampler";

it("inverts source luminance before portrait acceptance and visual mapping", () => {
  const darkSource = invertPortraitLuminance(0.1);
  const brightSource = invertPortraitLuminance(0.9);

  expect(darkSource).toBeCloseTo(0.9);
  expect(brightSource).toBeCloseTo(0.1);
  expect(particleAcceptance(darkSource, 0, 1, "face")).toBeGreaterThan(
    particleAcceptance(brightSource, 0, 1, "face"),
  );

  const darkVisual = visualForSample(darkSource, "face", 0.5, 0);
  const brightVisual = visualForSample(brightSource, "face", 0.5, 0);
  expect(darkVisual.alpha).toBeGreaterThan(brightVisual.alpha);
  expect(darkVisual.tone).toBeGreaterThan(brightVisual.tone);
});

it("keeps inverted portrait luminance inside the normalized range", () => {
  expect(invertPortraitLuminance(-1)).toBe(1);
  expect(invertPortraitLuminance(2)).toBe(0);
  expect(invertPortraitLuminance(Number.NaN)).toBe(1);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx.cmd vitest run src/particles/sampler.test.ts
```

Expected: FAIL because `invertPortraitLuminance` is not exported.

- [ ] **Step 3: Implement the pure inversion helper**

Add the helper beside the sampler's other normalized-light utilities:

```ts
export function invertPortraitLuminance(light: number): number {
  const normalized = clamp01(Number.isFinite(light) ? light : 0);
  return 1 - normalized;
}
```

- [ ] **Step 4: Apply inversion exactly once in `samplePortrait`**

Keep edge detection on the original buffer and replace the source-light assignment with:

```ts
const sourceLight = luminance(buffer, x, y);
const light = invertPortraitLuminance(sourceLight);

if (light < 0.035) continue;

const edge = edgeStrength(buffer, x, y);
```

Continue to pass `light` to `particleAcceptance` and `visualForSample`. Do not invert tone again in the renderer and do not change the mask check, region calculation, random-call order, quotas, targets, or particle sizes.

- [ ] **Step 5: Run particle regression tests**

Run:

```powershell
npx.cmd vitest run src/particles/sampler.test.ts src/particles/renderer.test.ts src/particles/controller.test.ts
npx.cmd tsc --noEmit
```

Expected: all tests pass. If deterministic fixture counts change because the requested tonal distribution changed, update only those explicit expected counts after confirming mask confinement, exact size-band quotas, `MAX_PARTICLES`, and facial large-particle restrictions still pass. Do not weaken safety assertions.

- [ ] **Step 6: Document the negative tonal mapping**

Update the Particle Portrait section in `DESIGN.md` with this exact behavior:

```md
The source luminance is interpreted as a tonal negative: dark hair, eyes, facial shadow, and garment folds create the brightest and densest light particles, while source highlights remain open. The alpha mask, silhouette, geometry, and grayscale-on-black palette remain unchanged.
```

- [ ] **Step 7: Commit the sampler change**

```powershell
git add src/particles/sampler.ts src/particles/sampler.test.ts DESIGN.md
git commit -m "feat: invert portrait particle luminance"
```

---

### Task 2: Verify the Inverted Portrait Across Viewports

**Files:**
- Verify: `src/particles/sampler.test.ts`
- Verify: `tests/homepage.spec.ts`
- Generate, do not commit: `output/playwright/inverted-particle-hero-desktop-1440x900.png`
- Generate, do not commit: `output/playwright/inverted-particle-hero-mobile-390x844.png`
- Generate, do not commit: `output/playwright/inverted-particle-hero-landscape-667x375.png`

- [ ] **Step 1: Run the complete unit suite and production build**

```powershell
npm.cmd test
npm.cmd run build
```

Expected: 53 test files and 938 or more tests pass; the mask, knowledge, project-page, TypeScript, Vite, and client-boundary checks all pass.

- [ ] **Step 2: Run the six-viewport portrait contract**

```powershell
npx.cmd playwright test tests/homepage.spec.ts --grep "centered particle portrait" --workers=1
```

Expected: all 12 geometry and mask-fallback cases pass across the six configured viewport projects.

- [ ] **Step 3: Run the complete homepage browser suite**

```powershell
npx.cmd playwright test tests/homepage.spec.ts --workers=1
```

Expected: zero failures. Conditional skips remain limited to tests that do not apply to a project's viewport or input mode.

- [ ] **Step 4: Generate final screenshots after all Playwright tests**

Start the built Vite preview on `127.0.0.1:4173`, emulate `prefers-reduced-motion: reduce`, wait for the settled canvas, and capture screenshots with `scale: "css"` at these exact CSS and PNG dimensions:

```text
1440 x 900  -> output/playwright/inverted-particle-hero-desktop-1440x900.png
390 x 844   -> output/playwright/inverted-particle-hero-mobile-390x844.png
667 x 375   -> output/playwright/inverted-particle-hero-landscape-667x375.png
```

Do not run another Playwright test after screenshot generation because `tests/global-setup.ts` clears `output/playwright`.

- [ ] **Step 5: Inspect the screenshots**

Confirm all of the following in each image:

- dark hair, eyes, and facial shadow are more prominent than source highlights;
- the portrait remains recognizable as Zhao Shikuang;
- no particle appears outside the mask silhouette;
- the headline does not cover the protected face;
- the AI assistant orb does not cover the headline;
- navigation and supporting text stay inside the viewport.

- [ ] **Step 6: Run final mechanical and Git checks**

```powershell
node E:\codex\zupingji\.agents\skills\impeccable\scripts\detect.mjs --json src/particles/sampler.ts src/styles.css tests/homepage.spec.ts
git diff --check
git status --short
```

Expected: no unexplained new detector findings, no whitespace errors, no tracked changes after the Task 1 commit, and only known untracked local browser/output artifacts.
