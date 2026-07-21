# Particle Facial Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sharpen the particle portrait's eyes, eyebrows, nose, lips, and jaw while keeping the portrait particle-only, irregular around the silhouette, deterministic, performant, and still after its entrance animation.

**Architecture:** Keep the existing Canvas renderer and controller budgets unchanged. Concentrate the fix in `sampler.ts` by separating settled-target geometry, edge-aware size assignment, and region-aware visual mapping into small pure functions that are directly testable. Preserve the existing `Particle` interface and let the renderer consume the improved sample output without new rendering effects.

**Tech Stack:** TypeScript, Canvas 2D, Vitest, Playwright, Vite, Vercel.

---

### Task 1: Preserve facial landmark target coordinates

**Files:**
- Modify: `src/particles/sampler.ts`
- Modify: `src/particles/sampler.test.ts`

- [ ] **Step 1: Write failing geometry tests**

Export a pure settled-target helper from the sampler and add these tests:

```ts
import {
  edgeStrength,
  MAX_PARTICLES,
  samplePortrait,
  settledTargetForRegion,
} from "./sampler";

it("keeps core particles exactly on their sampled landmark coordinates", () => {
  expect(settledTargetForRegion(40, 30, 100, "core", 1, 1)).toEqual([40, 30]);
});

it("caps face displacement while retaining broad edge splashes", () => {
  const face = settledTargetForRegion(40, 30, 100, "face", 1, 1);
  expect(face[0] - 40).toBeCloseTo(-0.6);
  expect(face[1] - 30).toBeCloseTo(0.35);

  const edge = settledTargetForRegion(40, 30, 100, "edge", 1, 1);
  expect(edge[0] - 40).toBeCloseTo(-15);
  expect(edge[1] - 30).toBeCloseTo(6);
});
```

Use `x = 40` with `width = 100`, so the outward direction is negative.

- [ ] **Step 2: Run the geometry tests and confirm RED**

Run: `npm.cmd test -- src/particles/sampler.test.ts`

Expected: FAIL because `settledTargetForRegion` does not exist.

- [ ] **Step 3: Implement the pure target function and route sampling through it**

Add:

```ts
export function settledTargetForRegion(
  x: number,
  y: number,
  width: number,
  region: ParticleRegion,
  horizontalRoll: number,
  verticalRoll: number,
): readonly [number, number] {
  const outwardDirection = x < width / 2 ? -1 : 1;

  if (region === "core") return [x, y];
  if (region === "face") {
    return [
      x + outwardDirection * width * horizontalRoll * 0.006,
      y + (verticalRoll * 0.7 - 0.35),
    ];
  }

  return [
    x + outwardDirection * width * (0.02 + horizontalRoll * 0.13),
    y + (verticalRoll * 10 - 4),
  ];
}
```

Replace `targetForRegion` with a thin call that supplies two random rolls to this function. Do not change entrance travel or delay ranges.

- [ ] **Step 4: Run sampler tests and confirm GREEN**

Run: `npm.cmd test -- src/particles/sampler.test.ts`

Expected: all sampler tests PASS, including exact production quotas.

- [ ] **Step 5: Commit coordinate precision**

```bash
git add src/particles/sampler.ts src/particles/sampler.test.ts
git commit -m "fix: preserve facial particle landmark coordinates"
```

### Task 2: Reserve micro particles for strong facial edges

**Files:**
- Modify: `src/particles/sampler.ts`
- Modify: `src/particles/sampler.test.ts`

- [ ] **Step 1: Write a failing high-contrast landmark test**

Build a 120x180 gray buffer with black eye, brow, nostril, and mouth strokes inside the core ellipse. Sample 3,000 particles with seed `20260714`, then recompute `edgeStrength` at every core target:

```ts
it("reserves micro particles for strong edges in the facial core", () => {
  const pixels = buffer(120, 180, 190);
  for (let x = 42; x <= 52; x += 1) setPixel(pixels, x, 54, 8);
  for (let x = 68; x <= 78; x += 1) setPixel(pixels, x, 54, 8);
  for (let y = 58; y <= 78; y += 1) setPixel(pixels, 60, y, 12);
  for (let x = 50; x <= 70; x += 1) setPixel(pixels, x, 86, 10);

  const particles = samplePortrait(pixels, {
    maxParticles: 3_000,
    seed: 20260714,
  });
  const strongCoreEdges = particles.filter(
    (particle) =>
      particle.region === "core" &&
      edgeStrength(pixels, particle.targetX, particle.targetY) >= 0.18,
  );

  expect(strongCoreEdges.length).toBeGreaterThan(20);
  expect(new Set(strongCoreEdges.map(({ band }) => band))).toEqual(
    new Set(["micro"]),
  );
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm.cmd test -- src/particles/sampler.test.ts -t "reserves micro particles"`

Expected: FAIL because current medium assignment includes strong core edges.

- [ ] **Step 3: Carry edge score through candidate finalization**

Add `edgeScore: number` to `ParticleCandidate`. Store the existing local `edge` value as `edgeScore` when pushing a candidate, then strip it before returning the public `Particle`.

Use these eligibility rules in `finalizeCandidates`:

```ts
const STRONG_CORE_EDGE = 0.18;
const STRONG_FACE_EDGE = 0.14;

assign("splash", quotas.splash, ({ region }) => region === "edge");
assign(
  "large",
  quotas.large,
  ({ edgeScore, region }) =>
    region === "edge" || (region === "face" && edgeScore < STRONG_FACE_EDGE),
);
assign(
  "medium",
  quotas.medium,
  ({ edgeScore, region }) =>
    !(region === "core" && edgeScore >= STRONG_CORE_EDGE),
);
```

Keep `micro` as the default leftover band. Preserve deterministic `assignmentOrder` ranking and exact 65/25/8/2 quotas.

- [ ] **Step 4: Run all sampler tests and confirm GREEN**

Run: `npm.cmd test -- src/particles/sampler.test.ts`

Expected: the new landmark test and all existing distribution/determinism tests PASS.

- [ ] **Step 5: Commit edge-aware sizing**

```bash
git add src/particles/sampler.ts src/particles/sampler.test.ts
git commit -m "fix: prioritize micro particles on facial edges"
```

### Task 3: Strengthen core light-dark separation

**Files:**
- Modify: `src/particles/sampler.ts`
- Modify: `src/particles/sampler.test.ts`

- [ ] **Step 1: Write failing tests for a region-aware visual curve**

Export a pure visual mapper and test dark, middle, and bright core samples:

```ts
it("uses a steeper bounded visual curve in the facial core", () => {
  expect(visualForRegion(0.12, "core", 1).alpha).toBeCloseTo(0.2304);
  expect(visualForRegion(0.12, "core", 1).tone).toBe(144);
  expect(visualForRegion(0.5, "core", 1).alpha).toBeCloseTo(0.571392);
  expect(visualForRegion(0.5, "core", 1).tone).toBe(199);
  expect(visualForRegion(1, "core", 1)).toEqual({ alpha: 0.96, tone: 245 });
  expect(visualForRegion(1, "edge", 1)).toEqual({ alpha: 0.96, tone: 255 });
});
```

These values lock the formula's integer rounding and monotonic, finite, bounded curve with darker core shadows and strong bright landmarks.

- [ ] **Step 2: Run the visual-curve test and confirm RED**

Run: `npm.cmd test -- src/particles/sampler.test.ts -t "steeper bounded visual curve"`

Expected: FAIL because `visualForRegion` does not exist.

- [ ] **Step 3: Implement the visual mapper and use it during candidate creation**

Implement a clamped contrast transform around core midtones:

```ts
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function visualForRegion(
  light: number,
  region: ParticleRegion,
  opacityRoll: number,
): { alpha: number; tone: number } {
  const safeLight = clamp01(Number.isFinite(light) ? light : 0);
  const safeRoll = clamp01(Number.isFinite(opacityRoll) ? opacityRoll : 0);
  const mapped =
    region === "core" ? clamp01((safeLight - 0.16) * 1.28 + 0.16) : safeLight;
  const minimumTone = region === "core" ? 132 : 150;
  const maximumTone = region === "core" ? 245 : 255;
  return {
    alpha: Math.min(0.96, (0.48 + safeRoll * 0.48) * Math.max(0.24, mapped)),
    tone: Math.round(minimumTone + mapped * (maximumTone - minimumTone)),
  };
}
```

Call it after `regionAt`, using one random roll, and store its returned alpha/tone instead of the current inline mapping. Do not weaken the tested bounds or monotonicity.

- [ ] **Step 4: Run the sampler and renderer tests**

Run: `npm.cmd test -- src/particles/sampler.test.ts src/particles/renderer.test.ts`

Expected: all focused tests PASS; update the existing sampler tone lower-bound assertion from 150 to 132 while keeping maximum 255 and alpha range 0-0.96.

- [ ] **Step 5: Commit contrast mapping**

```bash
git add src/particles/sampler.ts src/particles/sampler.test.ts
git commit -m "fix: increase facial particle contrast"
```

### Task 4: Verify facial clarity across viewports

**Files:**
- Modify: `tests/homepage.spec.ts` only if a stable clarity metric can be asserted without replacing visual review
- Regenerate: `output/playwright/desktop-1440-final.png`
- Regenerate: `output/playwright/desktop-1920-final.png`
- Regenerate: `output/playwright/mobile-390-final.png`
- Regenerate: `output/playwright/mobile-430-final.png`

- [ ] **Step 1: Run the complete unit suite**

Run: `npm.cmd test`

Expected: all Vitest tests PASS with zero failures.

- [ ] **Step 2: Run the production build**

Run: `npm.cmd run build`

Expected: TypeScript and Vite complete with exit code 0.

- [ ] **Step 3: Run the full Playwright matrix**

Run: `npm.cmd run test:e2e`

Expected: all applicable tests PASS across desktop-1440, desktop-1920, mobile-390, mobile-430, mobile-320, and mobile-landscape-667; breakpoint-only tests remain conditionally skipped where inapplicable.

- [ ] **Step 4: Inspect the four required screenshots against the approved reference**

Open the reference plus the four regenerated screenshots. Confirm:

- eye sockets and brow line remain distinct black/white structures;
- the nose bridge/nostrils and mouth line remain readable rather than becoming a uniform cloud;
- the jaw remains recognizable;
- hair and shoulders still have irregular gaps and occasional large splashes;
- no photographic pixels, glow, blur, or uniform dot grid appears;
- all content below the hero remains unchanged and readable.

If the face is still unclear, stop after documenting which landmark failed. Change one variable only in a new red-green cycle: target drift first, then edge threshold, then contrast mapping. Do not increase total particle budgets as a fallback.

- [ ] **Step 5: Commit any test-only visual capture change**

```bash
git add tests/homepage.spec.ts
git commit -m "test: verify sharper particle portrait"
```

Skip this commit when the test file has no change.

### Task 5: Deploy and verify production

**Files:**
- No source files expected

- [ ] **Step 1: Confirm intentional branch state**

Run: `git status --short && git log -6 --oneline`

Expected: the working tree is clean and the three clarity commits are visible.

- [ ] **Step 2: Deploy to the existing Vercel production project**

Run: `npx.cmd vercel deploy --prod --yes`

Expected: deployment succeeds and the alias remains `https://portfolioweb-two-rho.vercel.app`.

- [ ] **Step 3: Run live smoke verification**

Use headless Chromium against the alias and require HTTP 200, base-image opacity `0`, Canvas alpha coverage above 2%, six loaded project images, PDF/PPTX `HEAD` status 200, safe Gmail-only contact, and zero page/console/initial-resource errors.

- [ ] **Step 4: Report evidence**

Report fresh Vitest and Playwright counts, build status, production URL, and screenshot paths. Do not claim improved clarity until the four screenshots have been inspected after the final code change.
