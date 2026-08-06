# Chat Expansion and Hero Headline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mirrored particle-ball-to-chat-panel expansion and compose the desktop hero copy as two English lines plus one Chinese line with controlled portrait overlap.

**Architecture:** Extend the existing `data-chat-presentation` state machine with a transient `expanding` state that starts at the same dock-side transform as `collapsing`, then advances to `expanded` on the next animation frame. Keep hero text semantics unchanged while authoring two explicit English line spans and applying desktop-only no-wrap rules with mobile wrapping overrides.

**Tech Stack:** TypeScript, DOM APIs, CSS transitions, Vitest, Vite, Playwright runtime.

---

### Task 1: Define the mirrored desktop expansion

**Files:**
- Modify: `src/chat/chat-presentation.test.ts`
- Modify: `src/styles.test.ts`

- [ ] **Step 1: Write the failing presentation test**

Add a test that collapses the assistant, clicks the navigation trigger, and observes `expanding` before the queued frame reaches `expanded`:

```ts
test("expands from the docked ball through a mirrored scale state", () => {
  vi.useFakeTimers();
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const { root, trigger, elements, cleanup } = setup({ collapseDurationMs: 380 });
  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));
  vi.advanceTimersByTime(380);
  expect(root.dataset.chatPresentation).toBe("collapsed");

  trigger.click();
  expect(root.dataset.chatPresentation).toBe("expanding");
  expect(elements.panel.getAttribute("aria-hidden")).toBe("false");
  frames.shift()?.(0);
  expect(root.dataset.chatPresentation).toBe("expanded");
  cleanup();
});
```

- [ ] **Step 2: Write the failing reduced-motion test**

Verify that reduced motion bypasses the transient state:

```ts
test("opens immediately from the dock when reduced motion is requested", () => {
  const originalMatchMedia = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList)),
  });
  const { root, trigger, cleanup } = setup();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
  window.dispatchEvent(new Event("scroll"));
  expect(root.dataset.chatPresentation).toBe("collapsed");

  trigger.click();
  expect(root.dataset.chatPresentation).toBe("expanded");
  cleanup();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
});
```

- [ ] **Step 3: Write the failing CSS assertions**

```ts
test("mirrors the collapse transform while the desktop panel expands from the ball", () => {
  const expanding = rule('.hero-chat[data-chat-presentation="expanding"] .chat-panel');
  expect(expanding).toMatch(/opacity:\s*0/);
  expect(expanding).toMatch(/visibility:\s*visible/);
  expect(expanding).toMatch(/pointer-events:\s*none/);
  expect(styles).toMatch(
    /data-chat-presentation="expanding"\]\[data-chat-dock="left"\] \.chat-panel\s*\{[\s\S]*?translate\(-28px,\s*-50%\) scale\(0\.12\)/,
  );
  expect(styles).toMatch(
    /data-chat-presentation="expanding"\]\[data-chat-dock="right"\] \.chat-panel\s*\{[\s\S]*?translate\(28px,\s*-50%\) scale\(0\.12\)/,
  );
  expect(rule('.hero-chat[data-chat-presentation="expanded"] .chat-panel')).toMatch(
    /transform 380ms var\(--ease-out\)/,
  );
});
```

- [ ] **Step 4: Run the focused tests and verify RED**

```powershell
npm.cmd test -- --run src/chat/chat-presentation.test.ts src/styles.test.ts --no-file-parallelism --maxWorkers=1
```

Expected: opening skips `expanding`, and the new expanding selectors are absent.

### Task 2: Implement the mirrored desktop expansion

**Files:**
- Modify: `src/chat/chat-presentation.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Add interruptible frame state**

```ts
let expandFrame: number | undefined;

const clearExpandFrame = () => {
  if (expandFrame === undefined) return;
  dependencies.window.cancelAnimationFrame(expandFrame);
  expandFrame = undefined;
};
```

Call `clearExpandFrame()` before collapse, before showing the guide, and during cleanup.

- [ ] **Step 2: Open from a collapsed desktop ball through `expanding`**

```ts
const finishExpand = (focus: boolean) => {
  expandFrame = undefined;
  if (destroyed || root.dataset.chatPresentation !== "expanding") return;
  root.dataset.chatPresentation = "expanded";
  collapseScrollAnchorY = dependencies.window.scrollY;
  scheduleHeroAvoidance();
  if (focus) dependencies.window.requestAnimationFrame(() => elements.input.focus());
};

const open = (focus = false) => {
  if (destroyed) return;
  const fromDock = root.dataset.chatPresentation === "collapsed"
    || root.dataset.chatPresentation === "collapsing";
  const canAnimate = fromDock
    && !reducedMotion?.matches
    && dependencies.window.innerWidth > 760;
  clearCollapseTimer();
  clearExpandFrame();
  orb.setAttribute("aria-expanded", "true");
  panel.setAttribute("aria-hidden", "false");
  if (!canAnimate) {
    root.dataset.chatPresentation = "expanded";
    collapseScrollAnchorY = dependencies.window.scrollY;
    scheduleHeroAvoidance();
    if (focus) dependencies.window.requestAnimationFrame(() => elements.input.focus());
    return;
  }
  root.dataset.chatPresentation = "expanding";
  expandFrame = dependencies.window.requestAnimationFrame(() => finishExpand(focus));
};
```

Keep guide opening direct. Route the orb and navigation trigger through `open(true)`.

- [ ] **Step 3: Add the expanding CSS state**

```css
.hero-chat[data-chat-presentation="collapsed"],
.hero-chat[data-chat-presentation="expanding"],
.hero-chat[data-chat-presentation="expanded"] {
  top: calc(var(--chat-dock-y, 70vh) - 38px);
  right: auto;
  bottom: auto;
  left: calc(var(--chat-dock-x, 100vw) - 38px);
  width: 76px;
}

.hero-chat[data-chat-presentation="expanding"] .chat-panel {
  filter: none;
  opacity: 0;
  pointer-events: none;
  visibility: visible;
  will-change: transform, opacity;
}

.hero-chat[data-chat-presentation="expanded"] .chat-panel {
  transition:
    opacity 300ms var(--ease-out),
    transform 380ms var(--ease-out);
}

@media (min-width: 761px) {
  .hero-chat[data-chat-presentation="expanding"][data-chat-dock="left"] .chat-panel {
    transform: translate(-28px, -50%) scale(0.12);
  }

  .hero-chat[data-chat-presentation="expanding"][data-chat-dock="right"] .chat-panel {
    transform: translate(28px, -50%) scale(0.12);
  }
}
```

Include `expanding` in the existing docked ball, particle-canvas, and dark circular backing selectors. Keep the orb non-interactive during the transition.

- [ ] **Step 4: Run the focused tests and verify GREEN**

```powershell
npm.cmd test -- --run src/chat/chat-presentation.test.ts src/styles.test.ts --no-file-parallelism --maxWorkers=1
```

Expected: both files pass.

### Task 3: Define the desktop hero composition

**Files:**
- Modify: `src/hero/render-hero.test.ts`
- Modify: `src/styles.test.ts`

- [ ] **Step 1: Write the failing two-line markup test**

```ts
const headlineLines = Array.from(
  root.querySelectorAll<HTMLElement>("#hero-title > span"),
  (line) => line.textContent?.trim(),
);
expect(headlineLines).toEqual([
  "Crafting Future",
  "Through Objects & Systems.",
]);
expect(root.querySelector("#hero-title")?.tagName).toBe("H1");
```

- [ ] **Step 2: Write the failing responsive CSS test**

```ts
test("keeps hero copy to two English lines and one Chinese line on desktop", () => {
  expect(rule(".hero-copy .headline")).toMatch(/max-width:\s*min\(980px,\s*70vw\)/);
  expect(rule(".hero-copy .headline span")).toMatch(/white-space:\s*nowrap/);
  expect(rule(".hero-supporting")).toMatch(/white-space:\s*nowrap/);
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.hero-copy \.headline span\s*\{[\s\S]*?white-space:\s*normal/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.hero-supporting\s*\{[\s\S]*?white-space:\s*normal/,
  );
});
```

- [ ] **Step 3: Run the tests and verify RED**

```powershell
npm.cmd test -- --run src/hero/render-hero.test.ts src/styles.test.ts --no-file-parallelism --maxWorkers=1
```

Expected: the heading still has three spans and desktop no-wrap rules are absent.

### Task 4: Implement the desktop hero composition

**Files:**
- Modify: `src/hero/render-hero.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Author exactly two English lines**

```html
<h1 class="headline" id="hero-title">
  <span>Crafting <em>Future</em></span>
  <span>Through Objects &amp; Systems.</span>
</h1>
```

Leave the Chinese sentence unchanged.

- [ ] **Step 2: Widen and lock the desktop copy lines**

```css
.hero-copy .headline {
  max-width: min(980px, 70vw);
}

.hero-copy .headline span {
  white-space: nowrap;
  text-wrap: nowrap;
}

.hero-supporting {
  max-width: none;
  padding-right: 0;
  white-space: nowrap;
}
```

- [ ] **Step 3: Restore mobile wrapping**

Inside `@media (max-width: 760px)` add:

```css
.hero-copy .headline span,
.hero-supporting {
  white-space: normal;
}

.hero-copy .headline span {
  text-wrap: balance;
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

```powershell
npm.cmd test -- --run src/hero/render-hero.test.ts src/styles.test.ts --no-file-parallelism --maxWorkers=1
```

Expected: both files pass.

### Task 5: Verify the complete result

**Files:**
- Verify: `src/chat/chat-presentation.ts`
- Verify: `src/hero/render-hero.ts`
- Verify: `src/styles.css`
- Create screenshots under: `output/playwright/`

- [ ] **Step 1: Run focused integration tests**

```powershell
npm.cmd test -- --run src/chat/chat-presentation.test.ts src/chat/render-chat.test.ts src/hero/render-hero.test.ts src/styles.test.ts src/main.test.ts --no-file-parallelism --maxWorkers=1
```

Expected: all selected files pass.

- [ ] **Step 2: Run the full suite and build**

```powershell
npm.cmd test -- --no-file-parallelism --maxWorkers=1 --testTimeout=20000
npm.cmd run build
```

Expected: all tests pass; mask, knowledge, project assets, TypeScript, Vite, and bundle-boundary checks pass.

- [ ] **Step 3: Run quality checks**

```powershell
node E:\codex\zupingji\.agents\skills\impeccable\scripts\detect.mjs --json src/chat/chat-presentation.ts src/hero/render-hero.ts src/styles.css
git diff --check
```

Expected: no new blocking finding and no whitespace error.

- [ ] **Step 4: Check desktop viewports in a real browser**

At 1440×960, 1920×1080, and 2040×1152 verify:

```text
English headline client rects: 2
Chinese paragraph client rects: 1
Opening state before the queued frame: expanding
Opening state after the queued frame: expanded
Panel particle Canvas count: 0
Old orb SVG count: 0
```

Save:

```text
output/playwright/chat-expand-headline-1440.png
output/playwright/chat-expand-headline-1920.png
output/playwright/chat-expand-headline-2040.png
```

- [ ] **Step 5: Review the isolated worktree diff**

```powershell
git status --short
git diff -- src/chat/chat-presentation.ts src/chat/chat-presentation.test.ts src/hero/render-hero.ts src/hero/render-hero.test.ts src/styles.css src/styles.test.ts
```

Expected: only the isolated worktree contains the implementation; no merge or original-site branch change occurs.
