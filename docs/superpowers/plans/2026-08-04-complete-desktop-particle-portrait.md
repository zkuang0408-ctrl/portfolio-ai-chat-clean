# Complete Desktop Particle Portrait Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the complete head, neck, collar, and upper-clothing particle silhouette from the approved internal-browser reference in external desktop browsers without changing any page UI.

**Architecture:** Keep the existing particle sampler, subject mask, canvas, and DOM untouched. Change only `portraitCompositionFor`: mobile retains its current width/height cover behavior, while desktop uses the existing `1.16` height factor so wider viewports add side space instead of cropping more of the subject.

**Tech Stack:** TypeScript, Vitest, Vite, Playwright screenshot verification, Impeccable detector.

---

### Task 1: Lock and implement the complete desktop particle composition

**Files:**
- Modify: `src/particles/renderer.test.ts:137-183`
- Modify: `src/particles/renderer.ts:13-42`

- [ ] **Step 1: Write the failing desktop composition expectations**

Change the `desktop` and `ultrawide desktop` cases so their expected scale is derived from the same vertical reference:

```ts
{
  name: "desktop",
  width: 1_440,
  height: 836,
  expectedScale: (836 / 1_425) * 1.16,
  expectedOffsetY:
    836 * 0.09 - 1_425 * 0.13 * ((836 / 1_425) * 1.16),
  clothingCrossesBottom: true,
},
{
  name: "ultrawide desktop",
  width: 2_040,
  height: 1_026,
  expectedScale: (1_026 / 1_425) * 1.16,
  expectedOffsetY:
    1_026 * 0.09 - 1_425 * 0.13 * ((1_026 / 1_425) * 1.16),
  clothingCrossesBottom: true,
},
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- --run src/particles/renderer.test.ts --testTimeout=20000
```

Expected: the desktop cases fail because the current implementation still uses width growth or the `1.62` ultrawide cap.

- [ ] **Step 3: Implement the minimal desktop height-normalized scale**

Replace the desktop cap calculation with an explicit mobile/desktop choice:

```ts
const widthScale = (width / source.width) * widthFactor;
const heightScale = (height / source.height) * heightFactor;
const scale = mobile ? Math.max(widthScale, heightScale) : heightScale;
```

Keep `offsetX`, `offsetY`, the mobile factors, and all drawing behavior unchanged.

- [ ] **Step 4: Run focused and full tests**

Run:

```powershell
npm.cmd test -- --run src/particles/renderer.test.ts --testTimeout=20000
npm.cmd test -- --testTimeout=20000
npm.cmd run build
```

Expected: focused renderer tests pass, all Vitest files pass, and the production build completes with the client bundle boundary verified.

- [ ] **Step 5: Commit the behavior change**

```powershell
git add -- src/particles/renderer.ts src/particles/renderer.test.ts
git commit -m "fix: preserve complete desktop particle portrait"
```

### Task 2: Verify UI preservation and external-browser composition

**Files:**
- Verify: `src/particles/renderer.ts`
- Output: `output/playwright/complete-particle-desktop-1440x900.png`
- Output: `output/playwright/complete-particle-desktop-1920x1080.png`
- Output: `output/playwright/complete-particle-external-2040x1090.png`

- [ ] **Step 1: Rebuild and capture the three desktop viewports**

Run:

```powershell
npx.cmd playwright screenshot --viewport-size="1440,900" --wait-for-timeout 2600 http://127.0.0.1:4173/ output/playwright/complete-particle-desktop-1440x900.png
npx.cmd playwright screenshot --viewport-size="1920,1080" --wait-for-timeout 2600 http://127.0.0.1:4173/ output/playwright/complete-particle-desktop-1920x1080.png
npx.cmd playwright screenshot --viewport-size="2040,1090" --wait-for-timeout 2600 http://127.0.0.1:4173/ output/playwright/complete-particle-external-2040x1090.png
```

Expected: each screenshot shows the complete particle continuity from head through neck and upper clothing; navigation, headline, supporting copy, and AI orb retain their existing positions and sizes.

- [ ] **Step 2: Run the responsive browser checks**

Run the focused homepage checks for portrait protection, responsive completeness, and resize behavior across configured projects.

```powershell
npx.cmd playwright test tests/homepage.spec.ts --grep "centered particle portrait protects|renders a responsive, complete portrait|resize redraws|cross-breakpoint resize"
```

Expected: no responsive portrait or fixed-assistant failures.

- [ ] **Step 3: Run the Impeccable mechanical detector once**

```powershell
node E:\codex\zupingji\.agents\skills\impeccable\scripts\detect.mjs --json src/particles/renderer.ts src/particles/renderer.test.ts
```

Expected: no new mechanical UI-quality findings.

- [ ] **Step 4: Preserve the isolated redesign branch**

Keep `feature/black-ui-redesign-20260802` and its worktree intact. Do not merge into `feature/portfolio-ai-chat-clean` and do not remove the worktree.
