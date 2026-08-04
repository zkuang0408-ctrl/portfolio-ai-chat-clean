# Single Active Project Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace six vertically stacked project chapters with one persistent active project panel, controlled by flatter 16:10 selector cards and shared with trusted AI source and reader-route navigation.

**Architecture:** Add a small portfolio-domain activation event contract, then make `startProjectSelector` the single owner of visible-project state. All six readers remain mounted while inactive articles use `hidden`; manual clicks apply a direction-aware incoming wipe, while AI sources and direct reader routes activate immediately before scrolling or opening an exact page.

**Tech Stack:** TypeScript 5.9, DOM CustomEvent APIs, Vitest 4 with jsdom, CSS animations, Vite 8, Playwright CLI, Impeccable detector.

---

## File Map

- Create `src/portfolio/project-activation.ts`: shared project-activation event name, detail validation, and realm-safe dispatch helper.
- Create `src/portfolio/project-activation.test.ts`: unit coverage for dispatch and malformed activation details.
- Modify `src/portfolio/project-selector.ts`: own the active project, hide inactive mounted chapters, determine manual transition direction, and consume external activation events.
- Modify `src/portfolio/project-selector.test.ts`: replace scroll/IntersectionObserver tests with initial, forward/backward, idempotency, external activation, and cleanup coverage.
- Modify `src/portfolio/render-portfolio.ts`: connect each selector to its article with `aria-controls`.
- Modify `src/portfolio/render-portfolio.test.ts`: lock the selector-to-article accessibility mapping.
- Modify `src/chat/source-navigation.ts`: activate a trusted project before scrolling and opening its cited page.
- Modify `src/chat/source-navigation.test.ts`: verify activation → scroll → exact-page event order while retaining trust checks.
- Modify `src/portfolio/reader-route.ts`: activate the project before a direct/full-screen reader route opens.
- Modify `src/portfolio/reader-route.test.ts`: verify activation precedes reader presentation.
- Modify `src/styles.css`: flatten selector chrome, protect resting covers, keep hover-only zoom, and add direction-aware project reveals.
- Modify `src/styles.test.ts`: lock layout, hover/focus, hidden-panel, wipe, and reduced-motion contracts.

### Task 1: Add the shared project activation contract

**Files:**
- Create: `src/portfolio/project-activation.ts`
- Create: `src/portfolio/project-activation.test.ts`

- [ ] **Step 1: Write failing dispatch and validation tests**

Create `src/portfolio/project-activation.test.ts`:

```ts
import { expect, test, vi } from "vitest";

import {
  ACTIVATE_PROJECT_EVENT,
  dispatchProjectActivation,
  readProjectActivation,
} from "./project-activation";

test("dispatches a realm-safe project activation detail", () => {
  const root = document.createElement("main");
  const listener = vi.fn();
  root.addEventListener(ACTIVATE_PROJECT_EVENT, listener);

  dispatchProjectActivation(root, "emovue");

  expect(listener).toHaveBeenCalledOnce();
  expect(readProjectActivation(listener.mock.calls[0]?.[0] as Event)).toEqual({
    projectId: "emovue",
  });
});

test.each([
  undefined,
  null,
  {},
  { projectId: "" },
  { projectId: 3 },
  ["inkseat"],
])("rejects malformed project activation detail %j", (detail) => {
  const event = new CustomEvent(ACTIVATE_PROJECT_EVENT, { detail });

  expect(readProjectActivation(event)).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run:

```powershell
npx vitest run src/portfolio/project-activation.test.ts
```

Expected: FAIL because `./project-activation` does not exist.

- [ ] **Step 3: Implement the activation contract**

Create `src/portfolio/project-activation.ts`:

```ts
export const ACTIVATE_PROJECT_EVENT = "portfolio:activate-project";

export interface ProjectActivationDetail {
  readonly projectId: string;
}

export function readProjectActivation(
  event: Event,
): ProjectActivationDetail | undefined {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return undefined;
  }
  const projectId = (detail as Record<string, unknown>).projectId;
  if (typeof projectId !== "string" || projectId.length === 0) {
    return undefined;
  }
  return { projectId };
}

export function dispatchProjectActivation(
  root: HTMLElement,
  projectId: string,
): void {
  const EventConstructor =
    root.ownerDocument.defaultView?.CustomEvent ?? CustomEvent;
  root.dispatchEvent(
    new EventConstructor<ProjectActivationDetail>(ACTIVATE_PROJECT_EVENT, {
      detail: { projectId },
    }),
  );
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npx vitest run src/portfolio/project-activation.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit the shared contract**

```powershell
git add -- src/portfolio/project-activation.ts src/portfolio/project-activation.test.ts
git commit -m "feat: add shared project activation contract"
```

### Task 2: Render an explicit selector-to-chapter relationship

**Files:**
- Modify: `src/portfolio/render-portfolio.ts:157-176`
- Modify: `src/portfolio/render-portfolio.test.ts:142-166`

- [ ] **Step 1: Extend the render test with exact `aria-controls` mappings**

Add these assertions to `renders the approved selector order and matching editorial chapters` in `src/portfolio/render-portfolio.test.ts`:

```ts
expect(
  Array.from(
    root.querySelectorAll<HTMLElement>("[data-project-selector]"),
    (card) => card.getAttribute("aria-controls"),
  ),
).toEqual([
  "project-inkseat",
  "project-emovue",
  "project-evolution-fruit",
  "project-atempo",
  "project-urosense",
  "project-first-fly",
]);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npx vitest run src/portfolio/render-portfolio.test.ts
```

Expected: FAIL because selector anchors do not yet have `aria-controls`.

- [ ] **Step 3: Add `aria-controls` without changing fallback anchors**

In the selector anchor emitted by `renderProjects()` in `src/portfolio/render-portfolio.ts`, add:

```ts
aria-controls="project-${escapeHtml(project.id)}"
```

The opening anchor must remain an `<a>` with its existing `href`, class, and `data-project-selector` attributes.

- [ ] **Step 4: Run the render test and verify it passes**

Run:

```powershell
npx vitest run src/portfolio/render-portfolio.test.ts
```

Expected: all render-portfolio tests PASS.

- [ ] **Step 5: Commit the accessibility mapping**

```powershell
git add -- src/portfolio/render-portfolio.ts src/portfolio/render-portfolio.test.ts
git commit -m "feat: link project selectors to chapters"
```

### Task 3: Replace scrolling chapters with one active mounted panel

**Files:**
- Modify: `src/portfolio/project-selector.ts:1-82`
- Modify: `src/portfolio/project-selector.test.ts:1-65`

- [ ] **Step 1: Replace the selector tests with active-panel behavior tests**

Replace `src/portfolio/project-selector.test.ts` with:

```ts
import { expect, test, vi } from "vitest";

import { dispatchProjectActivation } from "./project-activation";
import { startProjectSelector } from "./project-selector";

function createRoot(): HTMLElement {
  const root = document.createElement("main");
  root.innerHTML = `
    <a href="#project-inkseat" data-project-selector="inkseat">INKSeat</a>
    <a href="#project-emovue" data-project-selector="emovue">EMOVUE</a>
    <article id="project-inkseat" data-project-chapter="inkseat"></article>
    <article id="project-emovue" data-project-chapter="emovue"></article>
  `;
  return root;
}

function selector(root: HTMLElement, id: string): HTMLElement {
  return root.querySelector(`[data-project-selector="${id}"]`)!;
}

function chapter(root: HTMLElement, id: string): HTMLElement {
  return root.querySelector(`[data-project-chapter="${id}"]`)!;
}

test("initializes INKSeat as the only visible mounted chapter", () => {
  const root = createRoot();
  const cleanup = startProjectSelector(root);

  expect(selector(root, "inkseat").getAttribute("aria-current")).toBe("true");
  expect(chapter(root, "inkseat").hidden).toBe(false);
  expect(chapter(root, "inkseat").hasAttribute("aria-hidden")).toBe(false);
  expect(chapter(root, "emovue").hidden).toBe(true);
  expect(chapter(root, "emovue").getAttribute("aria-hidden")).toBe("true");
  expect(root.querySelectorAll("[data-project-chapter]")).toHaveLength(2);
  cleanup();
});

test("switches forward and backward without scrolling", () => {
  const root = createRoot();
  const scrollInkseat = vi.fn();
  const scrollEmovue = vi.fn();
  chapter(root, "inkseat").scrollIntoView = scrollInkseat;
  chapter(root, "emovue").scrollIntoView = scrollEmovue;
  const cleanup = startProjectSelector(root);

  selector(root, "emovue").click();
  expect(chapter(root, "inkseat").hidden).toBe(true);
  expect(chapter(root, "emovue").hidden).toBe(false);
  expect(chapter(root, "emovue").dataset.projectTransition).toBe("forward");

  chapter(root, "emovue").dispatchEvent(new Event("animationend"));
  selector(root, "inkseat").click();
  expect(chapter(root, "inkseat").dataset.projectTransition).toBe("backward");
  expect(selector(root, "inkseat").getAttribute("aria-current")).toBe("true");
  expect(scrollInkseat).not.toHaveBeenCalled();
  expect(scrollEmovue).not.toHaveBeenCalled();
  cleanup();
});

test("does not restart the transition for an already active selector", () => {
  const root = createRoot();
  const cleanup = startProjectSelector(root);
  selector(root, "emovue").click();
  chapter(root, "emovue").dispatchEvent(new Event("animationend"));

  selector(root, "emovue").click();

  expect(chapter(root, "emovue").hasAttribute("data-project-transition")).toBe(false);
  cleanup();
});

test("external activation switches immediately and cleanup removes all listeners", () => {
  const root = createRoot();
  const cleanup = startProjectSelector(root);

  dispatchProjectActivation(root, "emovue");
  expect(chapter(root, "emovue").hidden).toBe(false);
  expect(chapter(root, "emovue").hasAttribute("data-project-transition")).toBe(false);

  cleanup();
  selector(root, "inkseat").click();
  dispatchProjectActivation(root, "inkseat");
  expect(chapter(root, "emovue").hidden).toBe(false);
  chapter(root, "emovue").dataset.projectTransition = "forward";
  chapter(root, "emovue").dispatchEvent(new Event("animationend"));
  expect(chapter(root, "emovue").dataset.projectTransition).toBe("forward");
});
```

- [ ] **Step 2: Run the focused tests and verify the old scrolling behavior fails**

Run:

```powershell
npx vitest run src/portfolio/project-selector.test.ts
```

Expected: FAIL because inactive chapters are not hidden and clicks still call `scrollIntoView`.

- [ ] **Step 3: Implement active-project ownership and remove IntersectionObserver**

Replace `src/portfolio/project-selector.ts` with:

```ts
import {
  ACTIVATE_PROJECT_EVENT,
  readProjectActivation,
} from "./project-activation";

type ProjectDirection = "forward" | "backward";

export function startProjectSelector(root: HTMLElement): () => void {
  const selectors = Array.from(
    root.querySelectorAll<HTMLElement>("[data-project-selector]"),
  );
  const chapters = Array.from(
    root.querySelectorAll<HTMLElement>("[data-project-chapter]"),
  );
  const chapterById = new Map<string, HTMLElement>();
  for (const chapter of chapters) {
    const projectId = chapter.dataset.projectChapter;
    if (projectId && !chapterById.has(projectId)) {
      chapterById.set(projectId, chapter);
    }
  }
  const projectOrder = selectors.reduce<string[]>((order, selector) => {
    const projectId = selector.dataset.projectSelector;
    if (
      projectId &&
      chapterById.has(projectId) &&
      !order.includes(projectId)
    ) {
      order.push(projectId);
    }
    return order;
  }, []);
  let activeProjectId: string | undefined;
  let destroyed = false;

  const activate = (
    projectId: string,
    direction?: ProjectDirection,
  ): boolean => {
    const incoming = chapterById.get(projectId);
    if (!incoming || destroyed || projectId === activeProjectId) return false;

    selectors.forEach((selector) => {
      if (selector.dataset.projectSelector === projectId) {
        selector.setAttribute("aria-current", "true");
      } else {
        selector.removeAttribute("aria-current");
      }
    });
    chapters.forEach((chapter) => {
      chapter.removeAttribute("data-project-transition");
      if (chapter === incoming) {
        chapter.hidden = false;
        chapter.removeAttribute("aria-hidden");
      } else {
        chapter.hidden = true;
        chapter.setAttribute("aria-hidden", "true");
      }
    });
    if (direction) incoming.dataset.projectTransition = direction;
    activeProjectId = projectId;
    return true;
  };

  const selectorListeners = selectors.map((selector) => {
    const listener = (event: Event): void => {
      const projectId = selector.dataset.projectSelector;
      const nextIndex = projectId ? projectOrder.indexOf(projectId) : -1;
      const activeIndex = activeProjectId
        ? projectOrder.indexOf(activeProjectId)
        : -1;
      if (!projectId || nextIndex < 0 || activeIndex < 0 || destroyed) return;
      event.preventDefault();
      activate(projectId, nextIndex > activeIndex ? "forward" : "backward");
    };
    selector.addEventListener("click", listener);
    return { selector, listener };
  });

  const animationListeners = chapters.map((chapter) => {
    const listener = (event: Event): void => {
      if (event.target === chapter) {
        chapter.removeAttribute("data-project-transition");
      }
    };
    chapter.addEventListener("animationend", listener);
    return { chapter, listener };
  });

  const handleExternalActivation = (event: Event): void => {
    const detail = readProjectActivation(event);
    if (detail) activate(detail.projectId);
  };
  root.addEventListener(ACTIVATE_PROJECT_EVENT, handleExternalActivation);

  const initialProjectId = projectOrder[0];
  if (initialProjectId) activate(initialProjectId);

  return () => {
    if (destroyed) return;
    destroyed = true;
    selectorListeners.forEach(({ selector, listener }) =>
      selector.removeEventListener("click", listener),
    );
    animationListeners.forEach(({ chapter, listener }) =>
      chapter.removeEventListener("animationend", listener),
    );
    root.removeEventListener(ACTIVATE_PROJECT_EVENT, handleExternalActivation);
  };
}
```

- [ ] **Step 4: Run activation and selector tests together**

Run:

```powershell
npx vitest run src/portfolio/project-activation.test.ts src/portfolio/project-selector.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit the single-panel state owner**

```powershell
git add -- src/portfolio/project-selector.ts src/portfolio/project-selector.test.ts
git commit -m "feat: switch projects in one mounted panel"
```

### Task 4: Activate projects from AI sources and direct reader routes

**Files:**
- Modify: `src/chat/source-navigation.ts:1-67`
- Modify: `src/chat/source-navigation.test.ts:1-141`
- Modify: `src/portfolio/reader-route.ts:1-124`
- Modify: `src/portfolio/reader-route.test.ts:1-110`

- [ ] **Step 1: Add source-navigation event-order assertions**

Import the shared event in `src/chat/source-navigation.test.ts`:

```ts
import { ACTIVATE_PROJECT_EVENT } from "../portfolio/project-activation";
```

In `scrolls to a trusted project and dispatches its exact PDF page`, record all three actions and assert their order:

```ts
const order: string[] = [];
project.scrollIntoView = vi.fn(() => order.push("scroll"));
portfolioRoot.addEventListener(ACTIVATE_PROJECT_EVENT, (event) => {
  order.push(`activate:${(event as CustomEvent).detail.projectId}`);
});
portfolioRoot.addEventListener(OPEN_PROJECT_PAGE_EVENT, (event) => {
  order.push(`page:${(event as CustomEvent).detail.page}`);
});

navigateToSource(portfolioRoot, source(), browser);

expect(order).toEqual(["activate:inkseat", "scroll", "page:8"]);
```

In the no-page trusted-project test, listen for `ACTIVATE_PROJECT_EVENT` and assert one `{ projectId: "inkseat" }` activation occurs before the existing scroll assertion.

Use this exact listener and assertion:

```ts
const activations: Array<{ projectId: string }> = [];
portfolioRoot.addEventListener(ACTIVATE_PROJECT_EVENT, (event) => {
  activations.push((event as CustomEvent<{ projectId: string }>).detail);
});

navigateToSource(portfolioRoot, source({ page: undefined }), browser);

expect(activations).toEqual([{ projectId: "inkseat" }]);
expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
```

- [ ] **Step 2: Add a reader-route activation-before-fullscreen test**

Add to `src/portfolio/reader-route.test.ts`:

```ts
test("activates a direct reader route before presenting it fullscreen", () => {
  const root = document.createElement("main");
  root.innerHTML = `<figure data-project-reader data-project-id="emovue"></figure>`;
  const order: string[] = [];
  root.addEventListener("portfolio:activate-project", () => {
    order.push(
      root.querySelector("[data-project-reader]")?.classList.contains("is-fullscreen")
        ? "activate-after-fullscreen"
        : "activate-before-fullscreen",
    );
  });

  const cleanup = startReaderRouting(root, {
    viewport: new EventTarget(),
    history: { pushState: vi.fn(), replaceState: vi.fn(), back: vi.fn() },
    location: { hash: "#reader/emovue/02", pathname: "/", search: "" },
    getScrollY: () => 0,
    scrollTo: vi.fn(),
    setScrollLocked: vi.fn(),
  });

  expect(order).toEqual(["activate-before-fullscreen"]);
  expect(root.querySelector("[data-project-reader]")?.classList).toContain("is-fullscreen");
  cleanup();
});
```

- [ ] **Step 3: Run both focused suites and verify they fail on missing activation**

Run:

```powershell
npx vitest run src/chat/source-navigation.test.ts src/portfolio/reader-route.test.ts
```

Expected: FAIL because neither navigation path dispatches the shared activation event.

- [ ] **Step 4: Dispatch trusted-source activation before scroll and page-open**

In `src/chat/source-navigation.ts`, import:

```ts
import { dispatchProjectActivation } from "../portfolio/project-activation";
```

Change `navigateToSource` to accept the actual portfolio root type:

```ts
export function navigateToSource(
  portfolioRoot: HTMLElement,
  source: ClientChatSource,
  browser: SourceNavigationBrowser,
): void {
```

Replace the trusted-project branch's scroll call with an explicit target lookup and ordered actions:

```ts
const target = portfolioRoot.querySelector<HTMLElement>(
  `#project-${source.projectId}`,
);
if (!target) return;
dispatchProjectActivation(portfolioRoot, source.projectId);
target.scrollIntoView({ block: "start" });
if (source.page === undefined) return;
```

Keep the existing page validation, `OPEN_PROJECT_PAGE_EVENT`, profile scrolling, sanitized résumé opening, and trust predicates unchanged.

- [ ] **Step 5: Activate a reader route before mutating full-screen state**

In `src/portfolio/reader-route.ts`, import:

```ts
import { dispatchProjectActivation } from "./project-activation";
```

Inside `openPresentation`, immediately after the reader/destroyed guard and before changing any `is-fullscreen` class, add:

```ts
dispatchProjectActivation(root, route.projectId);
```

This applies to user-opened readers, initial hash restoration, and popstate routes through the same function.

- [ ] **Step 6: Run focused integration tests and the selector suite**

Run:

```powershell
npx vitest run src/chat/source-navigation.test.ts src/portfolio/reader-route.test.ts src/portfolio/project-selector.test.ts
```

Expected: all tests PASS, including the pre-existing invalid-source and history behavior.

- [ ] **Step 7: Commit cross-feature navigation**

```powershell
git add -- src/chat/source-navigation.ts src/chat/source-navigation.test.ts src/portfolio/reader-route.ts src/portfolio/reader-route.test.ts
git commit -m "feat: activate projects from sources and routes"
```

### Task 5: Flatten selectors and add directional project reveals

**Files:**
- Modify: `src/styles.css:766-792,1991-2156`
- Modify: `src/styles.test.ts:179-204`

- [ ] **Step 1: Replace the selector style assertions and add single-panel motion assertions**

Replace `keeps project selectors compact with complete 16:10 covers` in `src/styles.test.ts` with:

```ts
test("keeps resting project selectors flat with complete 16:10 covers", () => {
  const media = rule(".project-selector__media");
  const image = rulesContaining(".project-selector__media img");
  const meta = rule(".project-selector__meta");
  const hoverImage = rule(
    ".project-selector:hover .project-selector__media img",
  );
  const focusImage = rule(
    ".project-selector:focus-visible .project-selector__media img",
  );
  const intermediate = mediaRule("(max-width: 1179px)", ".project-selector");
  const mobile = mediaRule("(max-width: 760px)", ".project-selector");

  expect(media).toMatch(/aspect-ratio:\s*16\s*\/\s*10/);
  expect(media).toMatch(/padding:\s*6px/);
  expect(image).toMatch(/object-fit:\s*contain/);
  expect(image).toMatch(/object-position:\s*50%\s+50%/);
  expect(meta).toMatch(/min-height:\s*48px/);
  expect(meta).toMatch(/gap:\s*2px/);
  expect(meta).toMatch(/padding:\s*8px\s+14px/);
  expect(intermediate).toMatch(/width:\s*clamp\(180px,\s*24vw,\s*240px\)/);
  expect(mobile).toMatch(/width:\s*min\(68vw,\s*260px\)/);
  expect(hoverImage).toMatch(/transform:\s*scale\(1\.04\)/);
  expect(focusImage).not.toMatch(/transform:\s*scale/);
});

test("reveals only the incoming project in the selected direction", () => {
  expect(rule('[data-project-chapter][hidden]')).toMatch(/display:\s*none/);
  expect(rule('.project-chapters .project-card')).toMatch(/padding-top:\s*0/);
  expect(rule('[data-project-chapter][data-project-transition="forward"]'))
    .toMatch(/project-reveal-forward\s+280ms/);
  expect(rule('[data-project-chapter][data-project-transition="backward"]'))
    .toMatch(/project-reveal-backward\s+280ms/);
  expect(styles).toMatch(
    /@keyframes\s+project-reveal-forward[\s\S]*?clip-path:[\s\S]*?translateX\(18px\)/,
  );
  expect(styles).toMatch(
    /@keyframes\s+project-reveal-backward[\s\S]*?clip-path:[\s\S]*?translateX\(-18px\)/,
  );
  expect(styles).toMatch(
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?data-project-transition[\s\S]*?animation:\s*none/,
  );
});
```

- [ ] **Step 2: Run the style test and verify the old dimensions and absent animations fail**

Run:

```powershell
npx vitest run src/styles.test.ts
```

Expected: FAIL on the 48px metadata, 6px inset, new responsive widths, and direction animation rules.

- [ ] **Step 3: Add hidden-panel and incoming-wipe CSS**

Near the existing `.project-card` rules in `src/styles.css`, add:

```css
.project-chapters .project-card {
  padding-top: 0;
}

[data-project-chapter][hidden] {
  display: none;
}

[data-project-chapter][data-project-transition="forward"] {
  animation: project-reveal-forward 280ms var(--ease-out) both;
}

[data-project-chapter][data-project-transition="backward"] {
  animation: project-reveal-backward 280ms var(--ease-out) both;
}

@keyframes project-reveal-forward {
  from {
    opacity: 0.28;
    clip-path: inset(0 0 0 100%);
    transform: translateX(18px);
  }

  to {
    opacity: 1;
    clip-path: inset(0);
    transform: translateX(0);
  }
}

@keyframes project-reveal-backward {
  from {
    opacity: 0.28;
    clip-path: inset(0 100% 0 0);
    transform: translateX(-18px);
  }

  to {
    opacity: 1;
    clip-path: inset(0);
    transform: translateX(0);
  }
}
```

Do not unmount readers, animate height, or put overflow clipping on `.project-chapters`; the existing `.portfolio-content { overflow: clip; }` contains the short horizontal offset without clipping a fixed reader through an extra ancestor.

- [ ] **Step 4: Flatten resting selector chrome while preserving hover-only cover zoom**

Apply these exact selector changes in `src/styles.css`:

```css
.project-selector__media {
  display: block;
  min-height: 0;
  overflow: hidden;
  aspect-ratio: 16 / 10;
  padding: 6px;
  background: #19191a;
}

.project-selector__meta {
  display: flex;
  min-height: 48px;
  flex-direction: column;
  justify-content: flex-end;
  gap: 2px;
  padding: 8px 14px;
}

.project-selector:hover {
  z-index: 2;
  border-color: rgb(255 255 255 / 0.3);
  box-shadow: 0 14px 36px rgb(0 0 0 / 0.42);
  transform: scale(1.03);
}

.project-selector:focus-visible {
  z-index: 2;
  border-color: rgb(255 255 255 / 0.3);
  box-shadow: 0 14px 36px rgb(0 0 0 / 0.42);
  transform: translateY(-2px);
}

.project-selector:hover .project-selector__media img {
  filter: saturate(0.92) contrast(1.04) brightness(0.96);
  transform: scale(1.04);
}

.project-selector:focus-visible .project-selector__media img {
  filter: saturate(0.92) contrast(1.04) brightness(0.96);
}
```

Replace intermediate and mobile widths with:

```css
width: clamp(180px, 24vw, 240px);
```

and:

```css
width: min(68vw, 260px);
```

Remove the mobile 68px metadata override so the base 48px rule applies. Keep `object-fit: contain` and do not add a resting-state image transform.

- [ ] **Step 5: Extend reduced-motion handling**

Inside the existing `@media (prefers-reduced-motion: reduce)` selector block, use:

```css
.project-selector,
.project-selector__media img {
  transition-duration: 0.01ms;
}

.project-selector:hover,
.project-selector:focus-visible,
.project-selector:hover .project-selector__media img {
  transform: none;
}

[data-project-chapter][data-project-transition] {
  animation: none;
}
```

- [ ] **Step 6: Run style, selector, and render tests**

Run:

```powershell
npx vitest run src/styles.test.ts src/portfolio/project-selector.test.ts src/portfolio/render-portfolio.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 7: Commit the visual interaction**

```powershell
git add -- src/styles.css src/styles.test.ts
git commit -m "feat: reveal projects through compact selectors"
```

### Task 6: Complete verification and one bounded visual correction

**Files:**
- Modify only if evidence requires it: the files already listed in Tasks 1–5 and their tests.
- Preserve without staging: `.playwright-cli/`, `debug.log`, `output/*.log`, `preview*.log`, and generated Vitest JSON reports.

- [ ] **Step 1: Run all tests**

Run:

```powershell
npm test
```

Expected: every Vitest file and test passes; no snapshot or unhandled-error failures.

- [ ] **Step 2: Run the production build**

Run:

```powershell
npm run build
```

Expected: portrait-mask, knowledge, and project-page verification pass; TypeScript, Vite production build, and client-bundle check succeed.

- [ ] **Step 3: Run one Impeccable detector pass**

Run:

```powershell
node E:\codex\zupingji\.agents\skills\impeccable\scripts\detect.mjs --json src/styles.css src/portfolio/project-selector.ts src/portfolio/render-portfolio.ts
```

Expected: JSON `[]`, or only pre-existing findings outside the changed selectors/project panel. Fix any new in-scope finding before continuing.

- [ ] **Step 4: Ensure the isolated Vite preview is serving the new build**

Check:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4173/ | Select-Object StatusCode
```

Expected: `StatusCode` 200. If unavailable, start the preview from this worktree in a hidden process:

```powershell
Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "preview", "--", "--host", "127.0.0.1", "--port", "4173") -WorkingDirectory "E:\codex\zupingji\portfolio_web\.worktrees\portfolio-ai-chat-clean" -WindowStyle Hidden
```

- [ ] **Step 5: Capture one batched viewport set**

Run:

```powershell
npx playwright screenshot --browser chromium --viewport-size "1440,900" --full-page "http://127.0.0.1:4173/#projects" "output/playwright/single-project-1440x900.png"
npx playwright screenshot --browser chromium --viewport-size "1024,768" --full-page "http://127.0.0.1:4173/#projects" "output/playwright/single-project-1024x768.png"
npx playwright screenshot --browser chromium --viewport-size "390,844" --full-page "http://127.0.0.1:4173/#projects" "output/playwright/single-project-390x844.png"
```

Inspect all three together and confirm:

- every resting selector shows all four edges of its 16:10 first page;
- the rail is visibly flatter and the next card remains discoverable on narrow screens;
- exactly one project article is visible;
- selecting a later and earlier project changes the same panel without vertical scrolling;
- hover zoom is pointer-only, keyboard focus preserves the complete cover, and active state remains legible;
- reader navigation still works at the retained page.

- [ ] **Step 6: Make at most one evidence-driven correction pass**

If inspection finds an in-scope defect, first add or strengthen the relevant Vitest assertion, run it to see RED, apply the smallest CSS/TypeScript correction, rerun focused tests, then repeat the three screenshots once. Do not alter project content, portrait, chat layout, navigation, résumé, or other sections.

- [ ] **Step 7: Re-run final verification after any correction**

Run:

```powershell
npm test
npm run build
git diff --check
git status --short
```

Expected: full tests and build pass; `git diff --check` is clean; only intentional tracked files are modified or committed, while user-owned untracked artifacts remain untouched.

- [ ] **Step 8: Commit a correction only if Step 6 changed tracked files**

```powershell
git add -- src/portfolio/project-activation.ts src/portfolio/project-activation.test.ts src/portfolio/project-selector.ts src/portfolio/project-selector.test.ts src/portfolio/render-portfolio.ts src/portfolio/render-portfolio.test.ts src/chat/source-navigation.ts src/chat/source-navigation.test.ts src/portfolio/reader-route.ts src/portfolio/reader-route.test.ts src/styles.css src/styles.test.ts
git commit -m "fix: refine single project switching"
```

If Step 6 made no tracked change, do not create an empty commit.
