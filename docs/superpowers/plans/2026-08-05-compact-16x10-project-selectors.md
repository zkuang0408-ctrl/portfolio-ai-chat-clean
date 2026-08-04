# Compact 16:10 Project Selectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all six project-selection controls smaller while showing each original PPT cover completely at a 16:10 ratio.

**Architecture:** Keep the existing semantic selector anchors, DOM order, active-state controller, and responsive rail topology. Implement the approved change entirely in the existing selector CSS, with source-level Vitest assertions that lock the ratio, non-cropping behavior, compact metadata, and smaller responsive widths.

**Tech Stack:** TypeScript, CSS, Vitest, Vite, Playwright CLI, Impeccable detector

---

## File Structure

- Modify `src/styles.test.ts`: specify the compact selector layout and responsive constraints before production changes.
- Modify `src/styles.css`: replace tall crop-oriented selector sizing with compact 16:10 media and smaller metadata/card widths.
- Do not modify `src/portfolio/project-selector.ts` or `src/portfolio/render-portfolio.ts`; their semantics and interaction already meet the approved design.

### Task 1: Lock the Compact 16:10 Selector Contract

**Files:**
- Modify: `src/styles.test.ts`
- Test: `src/styles.test.ts`

- [ ] **Step 1: Add a failing source-level layout test**

Add this test beside the existing project-reader style tests:

```ts
test("keeps project selectors compact with complete 16:10 covers", () => {
  const selector = rule(".project-selector");
  const media = rule(".project-selector__media");
  const image = rule(".project-selector__media img");
  const meta = rule(".project-selector__meta");
  const intermediate = mediaRule("(max-width: 1179px)", ".project-selector");
  const mobile = mediaRule("(max-width: 760px)", ".project-selector");

  expect(selector).toMatch(/grid-template-rows:\s*auto\s+auto/);
  expect(media).toMatch(/aspect-ratio:\s*16\s*\/\s*10/);
  expect(image).toMatch(/object-fit:\s*contain/);
  expect(image).toMatch(/object-position:\s*50%\s+50%/);
  expect(meta).toMatch(/min-height:\s*68px/);
  expect(meta).toMatch(/padding:\s*12px\s+14px\s+14px/);
  expect(intermediate).toMatch(/width:\s*clamp\(190px,\s*27vw,\s*270px\)/);
  expect(mobile).toMatch(/width:\s*min\(74vw,\s*280px\)/);
  expect(styles).not.toMatch(/grid-template-rows:\s*minmax\(150px,\s*17vw\)\s+auto/);
  expect(image).not.toMatch(/object-fit:\s*cover/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- --run src/styles.test.ts --testTimeout=20000
```

Expected: FAIL because selectors still use tall viewport-based rows, `object-fit: cover`, 92px metadata, and larger responsive widths.

### Task 2: Implement the Approved Compact Selector Layout

**Files:**
- Modify: `src/styles.css:1991-2156`
- Test: `src/styles.test.ts`

- [ ] **Step 1: Replace tall desktop rows with intrinsic 16:10 media**

Change the selector rules to:

```css
.project-selector {
  grid-template-rows: auto auto;
}

.project-selector__media {
  aspect-ratio: 16 / 10;
}

.project-selector__media img {
  object-fit: contain;
  object-position: 50% 50%;
}
```

Keep all existing border, radius, background, transition, filter, active-state, hover, focus, and reduced-motion declarations.

- [ ] **Step 2: Compact the supporting metadata**

Replace the existing metadata sizing with:

```css
.project-selector__meta {
  min-height: 68px;
  gap: 5px;
  padding: 12px 14px 14px;
}
```

Move the active dot to fit the smaller footer:

```css
.project-selector::after {
  right: 14px;
  bottom: 12px;
}
```

Keep the current project label and title typography, including ellipsis behavior.

- [ ] **Step 3: Make intermediate and mobile cards smaller without changing rail behavior**

Use these responsive widths and remove responsive media-row heights:

```css
@media (max-width: 1179px) {
  .project-selector {
    width: clamp(190px, 27vw, 270px);
    flex: 0 0 auto;
    scroll-snap-align: start;
  }
}

@media (max-width: 760px) {
  .project-selector {
    width: min(74vw, 280px);
  }

  .project-selector__meta {
    min-height: 68px;
  }
}
```

Keep the existing overflow, negative edge margin, scrollbar hiding, and scroll snapping declarations on `.project-selector-rail`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- --run src/styles.test.ts src/portfolio/render-portfolio.test.ts src/portfolio/project-selector.test.ts --testTimeout=20000
```

Expected: all focused tests PASS, confirming the CSS contract and unchanged render/interaction behavior.

- [ ] **Step 5: Commit the tested selector change**

```powershell
git add -- src/styles.css src/styles.test.ts
git commit -m "feat: compact project selectors to 16x10"
```

### Task 3: Verify Responsive Layout and Production Delivery

**Files:**
- Inspect: `src/styles.css`
- Inspect: `output/playwright/project-selectors-1440x900.png`
- Inspect: `output/playwright/project-selectors-1024x768.png`
- Inspect: `output/playwright/project-selectors-390x844.png`

- [ ] **Step 1: Run the complete automated verification**

Run the full Vitest suite, followed by the production build:

```powershell
npm.cmd test -- --run --testTimeout=20000
npm.cmd run build
```

Expected: all tests PASS; TypeScript, Vite build, knowledge verification, project assets, and client bundle boundary all PASS.

- [ ] **Step 2: Ensure the isolated preview serves the latest build**

Check `http://127.0.0.1:4173/`. If unavailable, start Vite Preview in a hidden window from the isolated worktree:

```powershell
Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "preview", "--", "--host", "127.0.0.1", "--port", "4173") -WorkingDirectory $PWD.Path -WindowStyle Hidden
```

- [ ] **Step 3: Capture representative selector screenshots**

```powershell
npx.cmd playwright screenshot --viewport-size="1440,900" --wait-for-timeout=1200 http://127.0.0.1:4173/#projects output/playwright/project-selectors-1440x900.png
npx.cmd playwright screenshot --viewport-size="1024,768" --wait-for-timeout=1200 http://127.0.0.1:4173/#projects output/playwright/project-selectors-1024x768.png
npx.cmd playwright screenshot --viewport-size="390,844" --wait-for-timeout=1200 http://127.0.0.1:4173/#projects output/playwright/project-selectors-390x844.png
```

Inspect all three together. Confirm complete uncropped covers, compact height, one-row desktop order, horizontal-scroll affordance at intermediate/mobile widths, readable metadata, visible active state, and no overlap with the AI orb. Make at most one bounded correction pass; any correction starts with a failing test.

- [ ] **Step 4: Run the final detector once**

```powershell
node "C:\Users\Kuang\.codex\skills\impeccable\scripts\detect.mjs" --json --scope layout src/styles.css src/portfolio/render-portfolio.ts
```

Expected: no unexplained new layout findings. Existing project-wide advisories outside the changed selector rules are documented rather than edited.

- [ ] **Step 5: Confirm isolation and final repository state**

```powershell
git diff --check HEAD
git status --short
git branch --show-current
git rev-parse --show-toplevel
```

Expected: branch is `feature/black-ui-redesign-20260802`; root is the `portfolio-ai-chat-clean` worktree; only pre-existing/generated untracked preview artifacts remain; original website branches are untouched.
