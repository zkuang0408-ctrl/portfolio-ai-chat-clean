# Fine Particle Portrait Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the homepage portrait to the approved M2 particle profile: a recognizable subject built only from finer particles, with restrained larger accents and no splash particles.

**Architecture:** Keep the existing portrait sampling, mask, inverted-luminance mapping, entrance animation, renderer, and responsive layout intact. Change only the sampler's size-band distribution and radius ranges, expose the deterministic radius mapping for direct unit tests, and lock the visual result with focused tests plus desktop/mobile screenshot QA.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, Vite, Playwright

---

## Task 1: Lock the approved M2 particle profile in tests

**Files:**

- Modify: `src/particles/sampler.test.ts`
- Modify: `src/particles/sampler.ts`

- [ ] **Step 1: Import the radius mapping at the sampler test boundary**

Add `radiusByBand` to the existing import from `./sampler` in `src/particles/sampler.test.ts`. This intentionally makes the deterministic radius mapping testable without involving canvas rendering.

- [ ] **Step 2: Add exact endpoint tests for the three active size bands**

Add the following table-driven test beside the existing size-band tests:

```ts
it.each([
  ["micro", 0, 0.37],
  ["micro", 1, 0.88],
  ["medium", 0, 0.9],
  ["medium", 1, 1.48],
  ["large", 0, 1.56],
  ["large", 1, 2.34],
] as const)("maps %s radius roll %s to %s", (band, roll, expected) => {
  expect(radiusByBand(band, roll)).toBeCloseTo(expected, 8);
});
```

- [ ] **Step 3: Replace the old 65/25/8/2 quota assertions**

Rename the production-budget test to describe the approved `82/15/3/0` profile and assert these exact counts:

```ts
expect(countsForBudget(7000)).toEqual({
  micro: 5740,
  medium: 1050,
  large: 210,
  splash: 0,
});

expect(countsForBudget(14000)).toEqual({
  micro: 11480,
  medium: 2100,
  large: 420,
  splash: 0,
});
```

Keep the existing deterministic seeded sampling setup so the test continues to exercise real quota assignment rather than a duplicated quota formula.

- [ ] **Step 4: Update feasibility tests for zero-splash allocation**

Replace the old feasibility expectations with a 100-particle profile whose quota is exactly 82 micro, 15 medium, 3 large, and 0 splash:

```ts
expect(hasFeasibleParticleSizeQuotas(100, 0, 3, 82)).toBe(true);
expect(hasFeasibleParticleSizeQuotas(100, 0, 2, 82)).toBe(false);
expect(hasFeasibleParticleSizeQuotas(100, 0, 3, 83)).toBe(false);
```

The first assertion explicitly proves that the approved zero-splash profile no longer needs an edge-only splash candidate.

- [ ] **Step 5: Update the scarcity and strong-core fixtures**

For each existing 3000-particle fixture, assert the full approved quota:

```ts
expect(particles).toHaveLength(3000);
expect(countBands(particles)).toEqual({
  micro: 2460,
  medium: 450,
  large: 90,
  splash: 0,
});
```

Retain the existing assertions that large particles never enter the protected facial core. For the strong-core fixture, retain the assertion that every protected strong edge is assigned to `micro`. Remove expectations tied to the previous 2% splash quota and previous reduced output counts.

- [ ] **Step 6: Tighten final particle bounds**

Update the final radius assertions from `0.45–7.5` to the active M2 range:

```ts
expect(particle.radius).toBeGreaterThanOrEqual(0.37);
expect(particle.radius).toBeLessThanOrEqual(2.34);
```

Also add:

```ts
expect(particles.every(({ band }) => band !== "splash")).toBe(true);
```

- [ ] **Step 7: Run the focused sampler tests and confirm RED**

Run:

```powershell
npx.cmd vitest run src/particles/sampler.test.ts
```

Expected: the new radius import or assertions fail because production still uses the old ranges and `65/25/8/2` distribution. Do not weaken the new expectations.

- [ ] **Step 8: Commit the failing test checkpoint**

```powershell
git add src/particles/sampler.test.ts
git commit -m "test: specify fine portrait particle profile"
```

## Task 2: Implement the M2 sampler constants

**Files:**

- Modify: `src/particles/sampler.ts`

- [ ] **Step 1: Replace only the active radius ranges**

Set the sampler constants to:

```ts
const RADIUS_RANGES = {
  micro: [0.37, 0.88],
  medium: [0.9, 1.48],
  large: [1.56, 2.34],
  splash: [4.5, 7.5],
} as const;
```

Keep the dormant splash range so the existing four-band type and assignment architecture remain compatible with future experiments. Its production quota will be zero.

- [ ] **Step 2: Replace the size-band shares**

Set:

```ts
const SIZE_BAND_SHARES = {
  micro: 0.82,
  medium: 0.15,
  large: 0.03,
  splash: 0,
} as const;
```

Do not change the largest-remainder allocation, mask rejection, facial-core protection, luminance mapping, or seeded random ordering.

- [ ] **Step 3: Export the deterministic radius helper**

Change:

```ts
function radiusByBand(band: ParticleSizeBand, roll: number) {
```

to:

```ts
export function radiusByBand(band: ParticleSizeBand, roll: number) {
```

No other production behavior should change.

- [ ] **Step 4: Run the focused sampler tests and confirm GREEN**

Run:

```powershell
npx.cmd vitest run src/particles/sampler.test.ts
```

Expected: all sampler tests pass with exact `82/15/3/0` quotas, no splash particles, the new radius bounds, and all existing mask/core protections intact.

- [ ] **Step 5: Run adjacent particle regressions**

Run:

```powershell
npx.cmd vitest run src/particles/sampler.test.ts src/particles/renderer.test.ts src/particles/controller.test.ts
npx.cmd tsc --noEmit
```

Expected: zero failures and zero TypeScript errors.

- [ ] **Step 6: Commit the sampler implementation**

```powershell
git add src/particles/sampler.ts
git commit -m "feat: refine portrait particle scale"
```

## Task 3: Document the particle hierarchy

**Files:**

- Modify: `DESIGN.md`

- [ ] **Step 1: Replace the qualitative size description with the exact M2 contract**

Update the Particle Portrait section to state:

```md
The final portrait uses an 82% micro, 15% medium, and 3% large particle hierarchy, with no splash particles. Active radii are 0.37–0.88px, 0.90–1.48px, and 1.56–2.34px. Large accents remain sparse and are excluded from the facial core, appearing only around hair tips, shoulders, and garment folds. Every final particle remains inside the subject mask.
```

Keep the existing statements about inverted luminance, the black background, entrance aggregation, and reduced-motion behavior.

- [ ] **Step 2: Review the diff for scope creep**

Run:

```powershell
git diff -- DESIGN.md src/particles/sampler.ts src/particles/sampler.test.ts
git diff --check
```

Expected: only the approved size profile, its tests, and its documentation changed; no whitespace errors.

- [ ] **Step 3: Commit the design-system documentation**

```powershell
git add DESIGN.md
git commit -m "docs: record fine particle hierarchy"
```

## Task 4: Verify behavior and visual quality

**Files:**

- Verify: `tests/homepage.spec.ts`
- Verify: `src/styles.css`
- Generate: `output/playwright/fine-particle-hero-desktop-1440x900.png`
- Generate: `output/playwright/fine-particle-hero-mobile-390x844.png`
- Generate: `output/playwright/fine-particle-hero-landscape-667x375.png`

- [ ] **Step 1: Run the complete unit and build gates**

Run:

```powershell
npm.cmd test
npm.cmd run build
```

Expected: every test passes with zero failures, and the Vite production build completes successfully.

- [ ] **Step 2: Run the centered-portrait browser contract**

Run:

```powershell
npx.cmd playwright test tests/homepage.spec.ts --grep "centered particle portrait" --workers=1
```

Expected: all centered-portrait cases pass with no conditional failures.

- [ ] **Step 3: Run the full homepage browser suite**

Run:

```powershell
npx.cmd playwright test tests/homepage.spec.ts --workers=1
```

Expected: zero failed tests. Conditional skips remain acceptable only where the suite already documents unsupported device/browser capabilities.

- [ ] **Step 4: Capture final screenshots after the Playwright runs**

Use the existing Playwright screenshot workflow to capture:

```text
output/playwright/fine-particle-hero-desktop-1440x900.png
output/playwright/fine-particle-hero-mobile-390x844.png
output/playwright/fine-particle-hero-landscape-667x375.png
```

Capture the settled post-entrance state, not the initial scattered frame.

- [ ] **Step 5: Perform the visual acceptance pass**

Inspect all three screenshots and confirm:

- The portrait remains recognizably derived from the approved source photograph.
- The face and garment are formed only by particles; no photographic layer is visible.
- Fine particles clearly dominate while medium particles add structure.
- The sparse large particles do not form a uniform halo and do not enter the facial core.
- No splash-sized particles appear anywhere.
- All visible particles remain inside the subject silhouette.
- The inverted black-and-white tonal reading still preserves hair, glasses, eyes, nose, mouth, jaw, neck, shoulders, and garment folds.
- Headline, portrait, navigation, AI entry, and mobile controls do not collide.
- The animation still resolves once and becomes essentially still.

- [ ] **Step 6: Run the frontend quality detector once**

Run:

```powershell
node E:\codex\zupingji\.agents\skills\impeccable\scripts\detect.mjs --json src/particles/sampler.ts src/styles.css tests/homepage.spec.ts
```

Expected: no newly introduced high-confidence UI, accessibility, or performance issue attributable to this particle-only change.

- [ ] **Step 7: Confirm the worktree is clean except for known local artifacts**

Run:

```powershell
git diff --check
git status --short
```

Expected: no tracked modifications remain. Local Playwright caches, screenshots, and logs may remain untracked and must not be committed.

## Out of Scope

The following approved follow-up is deliberately excluded from this plan and receives its own design/specification after the M2 portrait is complete:

- Show the AI assistant panel expanded on the homepage in its previous position.
- Collapse it into an interactive icon while the visitor scrolls downward.
- Restyle it as a rounder, more premium Apple-inspired surface without obscuring page content.

