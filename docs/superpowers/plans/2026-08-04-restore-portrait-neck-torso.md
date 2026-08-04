# Restore Portrait Neck and Torso Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a restrained particle bridge through the neck into the existing garment silhouette without changing the approved composition or revealing background pixels.

**Architecture:** Add a pure coordinate-aware tonal mapping at the particle sampler boundary. Keep the existing mask as the hard spatial boundary and leave rendering, layout, motion, and particle-size assignment untouched.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, Playwright, Vite

---

### Task 1: Specify the neck tonal bridge

**Files:**
- Modify: `src/particles/sampler.test.ts`

- [ ] **Step 1: Write the failing test**

Import `portraitLightAt` and assert that a bright sample inside the neck bridge maps above the ordinary tonal negative while a facial sample at the same luminance remains exactly inverted. Assert that a dark garment sample remains brighter than the restored neck.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `npm.cmd test -- src/particles/sampler.test.ts -t "restores the neck bridge"`

Expected: FAIL because `portraitLightAt` is not exported.

- [ ] **Step 3: Commit the failing specification**

Run:

```text
git add src/particles/sampler.test.ts
git commit -m "test: specify portrait neck continuity"
```

### Task 2: Implement the minimal sampler correction

**Files:**
- Modify: `src/particles/sampler.ts`

- [ ] **Step 1: Add the pure mapping function**

Create `portraitLightAt(sourceLight, x, y, width, height)`. Outside the centered neck bridge it returns `invertPortraitLuminance(sourceLight)`. Inside the bridge it returns the maximum of the inverted value and a restrained source-light contribution.

- [ ] **Step 2: Route sampling through the function**

Replace the direct inversion in `samplePortrait` with `portraitLightAt(sourceLight, x, y, pixels.width, pixels.height)`.

- [ ] **Step 3: Run focused and adjacent tests to verify GREEN**

Run: `npm.cmd test -- src/particles/sampler.test.ts src/particles/controller.test.ts src/particles/renderer.test.ts`

Expected: all selected particle tests pass.

- [ ] **Step 4: Commit the implementation**

Run:

```text
git add src/particles/sampler.ts
git commit -m "feat: restore portrait neck particles"
```

### Task 3: Record and verify the visual contract

**Files:**
- Modify: `DESIGN.md`

- [ ] **Step 1: Record neck continuity**

State that the tonal negative preserves a restrained source-light contribution through the neck so the chin, neck, collar, and garment read as one subject-only silhouette.

- [ ] **Step 2: Run production verification**

Run: `npm.cmd test -- --testTimeout=20000`

Expected: all unit tests pass.

Run: `npm.cmd run build`

Expected: production build and asset-boundary checks pass.

- [ ] **Step 3: Run responsive browser verification**

Run: `npx.cmd playwright test tests/homepage.spec.ts --grep "centered particle portrait" --workers=1`

Expected: all six approved viewport pairs pass.

- [ ] **Step 4: Capture and inspect desktop, mobile, and landscape screenshots**

Verify that the neck visibly connects the face to the garment, the environment remains absent, and existing typography and assistant clearances remain intact.

- [ ] **Step 5: Commit the design contract**

Run:

```text
git add DESIGN.md
git commit -m "docs: record portrait neck continuity"
```

