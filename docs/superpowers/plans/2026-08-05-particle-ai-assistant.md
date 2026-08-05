# Particle AI Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic floating assistant with a visible hero guide that collapses into a dockable monochrome particle assistant while retaining the existing secure streamed chat and source navigation.

**Architecture:** Semantic markup stays in `render-chat.ts`; a pure dock-geometry module owns side snap and safe clamping; `chat-presentation.ts` owns interaction state and pointer drag; an independent decorative Canvas renderer owns the guide-to-ball lifecycle. The chat controller retains retrieval/history/source handling and adds immediate textarea clearing plus an assistant-side waiting row.

**Tech Stack:** TypeScript, DOM/Canvas 2D, Vitest + jsdom, CSS, Vite, Playwright CLI.

---

### Task 1: Make the initial assistant guide semantic and hierarchical

**Files:**

- Modify: `src/chat/content.ts`
- Modify: `src/chat/render-chat.ts`
- Test: `src/chat/render-chat.test.ts`

- [ ] **Step 1: Write the failing markup test**

Add assertions for `data-chat-guide`, `data-chat-primary-question`, two `data-chat-topic` groups, `data-chat-composer-label`, and a `data-chat-ball-anchor`. Assert the recommendation buttons still expose exactly the four localized prompts in order.

- [ ] **Step 2: Run it to verify RED**

Run: `npm.cmd test -- src/chat/render-chat.test.ts`

Expected: FAIL because guide/group/anchor elements do not exist.

- [ ] **Step 3: Implement the smallest semantic change**

Extend `ChatContent` with quick-start, topic and composer labels. Render one primary button and two topic groups while preserving the flat `recommendations` array used by the controller:

```ts
const guide = createElement("section", "chat-guide");
guide.dataset.chatGuide = "";
const primary = createElement("button", "chat-recommendation chat-recommendation--primary", content.recommendations[0]);
primary.dataset.chatRecommendation = content.recommendations[0];
primary.dataset.chatPrimaryQuestion = "";
```

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd test -- src/chat/render-chat.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/chat/content.ts src/chat/render-chat.ts src/chat/render-chat.test.ts; git commit -m "feat: structure AI assistant guide"`

### Task 2: Define and test pure edge-dock geometry

**Files:**

- Create: `src/chat/particle-dock.ts`
- Test: `src/chat/particle-dock.test.ts`

- [ ] **Step 1: Write failing geometry tests**

Test `resolveDockPosition({ x, y }, viewport, metrics, previous)` returns nearest `side`, edge `x`, and a `y` clamped between `top + radius` and `height - bottom - radius`. Test invalid persisted coordinates, resize clamping, and exact midpoint retaining the prior side.

- [ ] **Step 2: Run it to verify RED**

Run: `npm.cmd test -- src/chat/particle-dock.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure API**

Export `DockSide`, `DockPosition`, `DockMetrics`, `ViewportSize`, `clampDockY`, and `resolveDockPosition`; no DOM access is allowed. Its essential decision must be:

```ts
const side = point.x === viewport.width / 2 && previous
  ? previous
  : point.x < viewport.width / 2 ? "left" : "right";
```

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm.cmd test -- src/chat/particle-dock.test.ts`

Then: `git add src/chat/particle-dock.ts src/chat/particle-dock.test.ts; git commit -m "feat: add assistant edge dock geometry"`

### Task 3: Add presentation lifecycle, drag, snap, and accessible state

**Files:**

- Modify: `src/chat/chat-presentation.ts`
- Test: `src/chat/chat-presentation.test.ts`

- [ ] **Step 1: Write failing interaction tests**

Test: initial `guide`; scroll becomes `collapsed`; orb opens `expanded`; close returns `collapsed`; pointer movement under 8px opens rather than drags; an 8px drag writes edge `data-chat-dock`; resize keeps side and clamps Y; Escape retains existing DOM; reduced motion adds `data-chat-motion="reduced"`.

- [ ] **Step 2: Run it to verify RED**

Run: `npm.cmd test -- src/chat/chat-presentation.test.ts`

Expected: FAIL because current code only toggles `collapsed` and `expanded`.

- [ ] **Step 3: Implement the state controller**

Use `setPresentation("guide" | "collapsing" | "collapsed" | "expanded")`. On scroll schedule collapse after CSS duration, but collapse immediately under reduced motion. Pointer capture stores a start point; a drag at/above 8px uses `resolveDockPosition`, writes `data-chat-dock`, `--chat-dock-x`, `--chat-dock-y`; a click below threshold toggles expansion. Resize, orientation, and visual viewport events re-clamp position. Cleanup removes every listener/timer.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm.cmd test -- src/chat/chat-presentation.test.ts src/chat/render-chat.test.ts`

Then: `git add src/chat/chat-presentation.ts src/chat/chat-presentation.test.ts; git commit -m "feat: dock and animate portfolio assistant"`

### Task 4: Render an independent monochrome particle assistant layer

**Files:**

- Create: `src/chat/particle-assistant.ts`
- Test: `src/chat/particle-assistant.test.ts`
- Modify: `src/chat/render-chat.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Write failing Canvas controller tests**

Test a usable 2D context sets `data-chat-particles="ready"`, observes presentation changes, stops animation under reduced motion, and cleanup cancels animation/removes observers. An unavailable context must set `data-chat-particles="fallback"` without hiding chat controls.

- [ ] **Step 2: Run it to verify RED**

Run: `npm.cmd test -- src/chat/particle-assistant.test.ts`

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement rendering and integration**

Add a decorative `canvas.chat-particle-canvas`. Use deterministic fine grey/bone particles, interpolate guide coordinates into a circular shell in collapsing/collapsed states, reverse in expanded state, and draw two inner layers at `elapsed / 20000` and `-elapsed / 14000`. Under `prefers-reduced-motion`, draw only a static shell. Start it from `main.ts` and include cleanup on `pagehide`.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm.cmd test -- src/chat/particle-assistant.test.ts src/chat/chat-presentation.test.ts`

Then: `git add src/chat/particle-assistant.ts src/chat/particle-assistant.test.ts src/chat/render-chat.ts src/main.ts; git commit -m "feat: render assistant particle lifecycle"`

### Task 5: Give the chat a true conversational submission flow

**Files:**

- Modify: `src/chat/chat-controller.ts`
- Test: `src/chat/chat-controller.test.ts`

- [ ] **Step 1: Write failing controller tests**

With deferred fetch, submit a user question and assert synchronously: input is empty, user has `chat-message--user`, AI has `[data-chat-loading]` with localized copy, and a second submit makes only one fetch. Resolve SSE and assert loading is removed before assistant content; retained history has `chat-message--assistant`.

- [ ] **Step 2: Run it to verify RED**

Run: `npm.cmd test -- src/chat/chat-controller.test.ts`

Expected: FAIL because clearing occurs only after completion and no loading row exists.

- [ ] **Step 3: Implement the minimum change**

Create a helper that appends an assistant-side loading row. In valid `sendQuestion`, clear `elements.input.value` immediately after appending the user message, before fetch. Replace/remove the loading row for stream/error/finally paths; keep SSE phase validation, source rendering, retry, and session writes unchanged.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm.cmd test -- src/chat/chat-controller.test.ts`

Then: `git add src/chat/chat-controller.ts src/chat/chat-controller.test.ts; git commit -m "feat: show conversational chat loading state"`

### Task 6: Apply the approved editorial particle visual system

**Files:**

- Modify: `src/styles.css`
- Test: `src/styles.test.ts`

- [ ] **Step 1: Write failing CSS contracts**

Assert desktop hero-left guide placement, a decorative canvas, inward left/right dock expansion, a `30px 30px 22px 22px` dark panel, opposing user/assistant bubbles, a particle waiting treatment, mobile safe placement, and reduced-motion animation removal.

- [ ] **Step 2: Run it to verify RED**

Run: `npm.cmd test -- src/styles.test.ts`

Expected: FAIL because styles only describe a bottom-right generic panel.

- [ ] **Step 3: Implement CSS**

Replace the chat style block using near-black, bone white, grey, and oxide red only. Use dock CSS variables plus `data-chat-dock="left"`/`"right"` for inward growth; retain the ball at the outer edge. Add responsive in-hero guide placement and safe-area rules. Make reduced motion a static ball with no transitions/rotation.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm.cmd test -- src/styles.test.ts`

Then: `git add src/styles.css src/styles.test.ts; git commit -m "feat: style particle AI assistant"`

### Task 7: Integrate and browser-verify the shipped behavior

**Files:**

- Verify only: `output/playwright/` (do not stage artifacts)

- [ ] **Step 1: Run focused suites**

Run: `npm.cmd test -- src/chat/render-chat.test.ts src/chat/particle-dock.test.ts src/chat/chat-presentation.test.ts src/chat/particle-assistant.test.ts src/chat/chat-controller.test.ts src/styles.test.ts`

Expected: PASS.

- [ ] **Step 2: Run full tests and build**

Run: `npm.cmd test -- --no-file-parallelism --maxWorkers=1`

Expected: PASS in one worker, avoiding known parallel asset-test contention.

Run: `npm.cmd run build`

Expected: PASS.

- [ ] **Step 3: Detect design regressions**

Run: `node E:\codex\zupingji\.agents\skills\impeccable\scripts\detect.mjs --json src/chat src/main.ts src/styles.css`

Expected: no new blocking finding.

- [ ] **Step 4: Use Playwright CLI at desktop and mobile**

Capture `output/playwright/` screenshots at 1440×960, 1920×1080, 2040×1200, and 390px mobile. Verify visible hero guide, scroll collapse, left/right inward drag docking, preserved dock position after open/close, distinct message sides, cleared input/loading, static reduced-motion ball, and working navigation/source behaviour.

- [ ] **Step 5: Review and commit final verified changes**

Run: `git diff --check; git status --short`

Then: `git add src/chat src/main.ts src/styles.css src/styles.test.ts; git commit -m "feat: redesign portfolio AI assistant"`
