# Portrait Position and Scale Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the homepage particle portrait slightly larger and higher across desktop, mobile portrait, and short mobile landscape while preserving the approved composition safeguards.

**Architecture:** Keep composition inside the Canvas renderer so the particle image stays sharp and landmark geometry remains authoritative. Update the renderer's three responsive factor sets, lock the new values with unit tests before implementation, then reuse the existing six-viewport Playwright geometry contract for regression and visual QA.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, Vite, Playwright

---

### Task 1: Lock the refined composition with failing tests

**Files:**

- Modify: `src/particles/renderer.test.ts`
- Test: `src/particles/renderer.test.ts`

- [ ] **Step 1: Replace the three composition expectations**

In the table used by `centers and crops the portrait`, replace the desktop, mobile portrait, and short mobile landscape entries with:

```ts
{
  name: "desktop",
  width: 1_440,
  height: 836,
  expectedScale: (1_440 / 1_104) * 0.725,
  expectedOffsetY:
    836 * 0.09 - 1_425 * 0.13 * ((1_440 / 1_104) * 0.725),
  clothingCrossesBottom: true,
},
{
  name: "mobile portrait",
  width: 390,
  height: 722,
  expectedScale: (722 / 1_425) * 0.8,
  expectedOffsetY:
    722 * 0.095 - 1_425 * 0.13 * ((722 / 1_425) * 0.8),
  clothingCrossesBottom: false,
},
{
  name: "short mobile landscape",
  width: 667,
  height: 375,
  expectedScale: (667 / 1_104) * 0.8,
  expectedOffsetY:
    375 * 0.09 - 1_425 * 0.13 * ((667 / 1_104) * 0.8),
  clothingCrossesBottom: true,
},
```

Retain the existing landmark assertions for hair, chin, glasses centering, and clothing crop.

- [ ] **Step 2: Update the completed-draw geometry expectation**

In `uses the viewport composition when drawing the completed portrait`, replace the transformed ellipse expectations with:

```ts
expect(ellipseCall?.[0]).toBeCloseTo(200);
expect(ellipseCall?.[1]).toBeCloseTo(169.08);
expect(ellipseCall?.[2]).toBeCloseTo(3.84);
expect(ellipseCall?.[3]).toBeCloseTo(3.2);
expect(ellipseCall?.slice(4)).toEqual([0, 0, Math.PI * 2]);
```

The 400×300 test canvas follows the short-mobile-landscape branch, whose new width scale is `(400 / 100) * 0.80 = 3.2` and whose viewport Y anchor is `0.09`.

- [ ] **Step 3: Run the renderer tests and verify RED**

Run:

```powershell
npx.cmd vitest run src/particles/renderer.test.ts --reporter=verbose
```

Expected: the three responsive composition rows and completed ellipse geometry fail because production still uses `0.70/1.12/0.11`, `1.10/0.78/0.11`, and `0.78/0.92/0.11`.

- [ ] **Step 4: Commit the failing composition tests**

```powershell
git add src/particles/renderer.test.ts
git commit -m "test: specify refined portrait composition"
```

### Task 2: Implement the responsive scale and vertical anchors

**Files:**

- Modify: `src/particles/renderer.ts`
- Test: `src/particles/renderer.test.ts`

- [ ] **Step 1: Replace the responsive factors in `portraitCompositionFor`**

Replace the factor selection and `offsetY` calculation with:

```ts
const mobile = width <= 760;
const shortLandscape = mobile && width > height;
const widthFactor = shortLandscape ? 0.8 : mobile ? 1.13 : 0.725;
const heightFactor = shortLandscape ? 0.94 : mobile ? 0.8 : 1.16;
const viewportYAnchor = shortLandscape ? 0.09 : mobile ? 0.095 : 0.09;
const scale = Math.max(
  (width / source.width) * widthFactor,
  (height / source.height) * heightFactor,
);

return {
  scale,
  offsetX: (width - source.width * scale) / 2,
  offsetY: height * viewportYAnchor - source.height * 0.13 * scale,
};
```

Do not change particle coordinates, radius calculation, parallax, draw limits, or the renderer's validation behavior.

- [ ] **Step 2: Run the renderer tests and verify GREEN**

Run:

```powershell
npx.cmd vitest run src/particles/renderer.test.ts --reporter=verbose
```

Expected: every renderer test passes, including all three composition rows and the completed ellipse geometry.

- [ ] **Step 3: Run adjacent particle regressions**

Run:

```powershell
npx.cmd vitest run src/particles/renderer.test.ts src/particles/controller.test.ts src/particles/sampler.test.ts
npx.cmd tsc --noEmit
```

Expected: zero failures and zero TypeScript errors.

- [ ] **Step 4: Commit the renderer change**

```powershell
git add src/particles/renderer.ts
git commit -m "feat: raise and enlarge particle portrait"
```

### Task 3: Record the composition contract

**Files:**

- Modify: `DESIGN.md`

- [ ] **Step 1: Add the responsive composition sentence**

Append this sentence to the first paragraph of `### Particle Portrait`:

```md
The responsive composition raises the portrait by a restrained optical amount while scaling it approximately 3.6% on desktop and 2.6% on mobile; horizontal centering and protected face geometry remain fixed.
```

- [ ] **Step 2: Check the scoped diff**

Run:

```powershell
git diff -- DESIGN.md src/particles/renderer.ts src/particles/renderer.test.ts
git diff --check
```

Expected: only the approved composition constants, their exact tests, and the design-system sentence changed; no whitespace errors.

- [ ] **Step 3: Commit the design documentation**

```powershell
git add DESIGN.md
git commit -m "docs: record portrait composition refinement"
```

### Task 4: Verify six-view geometry and visual quality

**Files:**

- Verify: `tests/homepage.spec.ts`
- Generate: `output/playwright/raised-portrait-desktop-1440x900.png`
- Generate: `output/playwright/raised-portrait-mobile-390x844.png`
- Generate: `output/playwright/raised-portrait-landscape-667x375.png`

- [ ] **Step 1: Run the complete unit and production build gates**

Run the full test suite with the locally installed PDF audit dependency available:

```powershell
$env:PYTHONPATH='C:\Users\Kuang\AppData\Roaming\Python\Python311\site-packages'
npm.cmd test
npm.cmd run build
```

Expected: all 53 test files and at least 944 test cases pass with zero failures; the production build and client-bundle check complete successfully.

- [ ] **Step 2: Run the six-viewport portrait geometry contract**

Run:

```powershell
npx.cmd playwright test tests/homepage.spec.ts --grep "centered particle portrait" --workers=1
```

Expected: 12/12 tests pass across desktop 1440, desktop 1920, mobile 390, mobile 430, mobile 320, and mobile landscape 667. If Playwright leaves only its temporary Vite preview running after reporting the last test, stop that test-owned preview process and collect the final successful exit summary.

- [ ] **Step 3: Run the full homepage browser regression**

Run:

```powershell
npx.cmd playwright test tests/homepage.spec.ts --workers=1
```

Expected: 51 tests pass, 63 existing conditional tests skip, and zero tests fail.

- [ ] **Step 4: Capture the three settled first-view screenshots**

Start the built preview at `http://127.0.0.1:4173/`, wait at least 2600ms for the entrance animation to settle, and capture exact first-viewport screenshots at:

```text
output/playwright/raised-portrait-desktop-1440x900.png
output/playwright/raised-portrait-mobile-390x844.png
output/playwright/raised-portrait-landscape-667x375.png
```

- [ ] **Step 5: Perform the visual acceptance pass**

Inspect all three screenshots and confirm with rendered evidence:

- The face is visibly higher and the portrait is only modestly larger.
- Hair and the top role/navigation area retain breathing room.
- Glasses, eyes, nose, mouth, jaw, neck, shoulders, and clothing remain readable.
- The protected face does not intersect the headline.
- Supporting copy and the AI orb remain unobstructed.
- The portrait stays horizontally centered with no page overflow.
- The M2 particle density, radius hierarchy, inverted luminance, and black visual world remain unchanged.

- [ ] **Step 6: Run the Impeccable detector once**

Run:

```powershell
node E:\codex\zupingji\.agents\skills\impeccable\scripts\detect.mjs --json --scope layout src/particles/renderer.ts src/particles/renderer.test.ts tests/homepage.spec.ts DESIGN.md
```

Expected: no newly introduced high-confidence layout issue. Existing advisory-only color findings in unchanged CSS are outside this refinement.

- [ ] **Step 7: Confirm the tracked worktree is clean**

Run:

```powershell
git diff --check
git status --short
```

Expected: no tracked modifications remain. Do not commit local Playwright caches, screenshots, logs, `.superpowers`, or preview output.
