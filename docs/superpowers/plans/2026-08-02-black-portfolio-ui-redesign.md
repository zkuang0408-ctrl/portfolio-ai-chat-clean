# Black Portfolio UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the isolated portfolio branch around the approved black editorial interface, with a fixed responsive navigation, a stronger particle portrait, a landscape résumé, Apple-like project discovery, a full-screen image reader, and a collapsible persistent AI assistant—without changing the existing RAG/backend behavior or production deployment.

**Architecture:** Keep `src/main.ts` as the composition root and split new UI behavior into small controllers with explicit cleanup functions. Typed portfolio/profile content remains the source of truth; generated responsive page images remain the reader source. The AI request/session controller remains unchanged except for accepting a separately rendered view; a new presentation controller owns only open/collapse/scroll/collision state. Reader fullscreen routing wraps the existing page-loading controller instead of replacing it.

**Tech Stack:** TypeScript 5.9, Vite 8, semantic HTML, CSS custom properties, Canvas 2D, browser History/Intersection/Resize/VisualViewport APIs, Vitest + jsdom, Playwright, existing generated 960/1800 project page assets.

---

## Working Rules and Guardrails

- Work only in `E:\codex\zupingji\portfolio_web\.worktrees\portfolio-ai-chat-clean` on branch `feature/black-ui-redesign-20260802`.
- Do not edit the original checkout, Vercel/Cloudflare/Tencent production settings, secrets, AI provider code, RAG prompts, rate limits, authored knowledge, PDFs, or generated page manifest.
- Keep `public/portrait-resume-retouched-v1.png` as the approved portrait source and commit it with the first implementation task.
- Keep `.playwright-cli/` untracked; do not add it to a commit.
- Use test-first order for every behavior change: add one failing assertion, run the narrow test, implement the minimum behavior, rerun, then commit.
- Use `npm.cmd exec vitest run -- --testTimeout=30000` followed by the explicit test file paths on this Windows worktree to avoid the known 5-second resource-contention timeout.
- Do not deploy production. The final task may produce a local build and Preview-ready branch only.

## Task 1: Establish the UI shell, fixed navigation, and design tokens

**Files:**
- Create: `src/navigation/render-navigation.ts`
- Create: `src/navigation/render-navigation.test.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Modify: `src/main.test.ts`
- Add: `public/portrait-resume-retouched-v1.png`

- [ ] **Step 1: Add a failing navigation contract test**

```ts
// src/navigation/render-navigation.test.ts
import { expect, test } from "vitest";
import { renderNavigation } from "./render-navigation";

test("renders one persistent navigation contract for desktop and mobile", () => {
  const root = document.createElement("div");
  renderNavigation(root);

  expect(root.querySelector("[data-site-nav]")).not.toBeNull();
  expect(root.querySelector("[data-site-brand]")?.textContent).toBe("赵实旷");
  expect(
    Array.from(root.querySelectorAll<HTMLAnchorElement>("[data-site-nav] a"),
      (link) => [link.textContent, link.hash]),
  ).toEqual([
    ["简介", "#resume"],
    ["作品", "#projects"],
    ["联系", "#contact"],
  ]);
  expect(root.querySelector<HTMLButtonElement>("[data-open-chat]")?.textContent)
    .toBe("Ask AI");
});
```

- [ ] **Step 2: Run the narrow test and confirm it fails because the module is missing**

Run:

```powershell
npm.cmd exec vitest run -- --testTimeout=30000 src/navigation/render-navigation.test.ts
```

Expected: FAIL with an import/module-not-found error for `render-navigation`.

- [ ] **Step 3: Implement semantic navigation and return the Ask AI control**

```ts
// src/navigation/render-navigation.ts
export interface NavigationElements {
  readonly root: HTMLElement;
  readonly openChat: HTMLButtonElement;
}

export function renderNavigation(host: HTMLElement): NavigationElements {
  host.insertAdjacentHTML("afterbegin", `
    <header class="site-nav" data-site-nav>
      <a class="site-nav__brand" data-site-brand href="#top">赵实旷</a>
      <nav aria-label="主要栏目">
        <a href="#resume">简介</a>
        <a href="#projects">作品</a>
        <a href="#contact">联系</a>
        <button type="button" data-open-chat>Ask AI</button>
      </nav>
    </header>
  `);
  const root = host.querySelector<HTMLElement>("[data-site-nav]");
  const openChat = host.querySelector<HTMLButtonElement>("[data-open-chat]");
  if (!root || !openChat) throw new Error("Navigation markup is incomplete.");
  return { root, openChat };
}
```

- [ ] **Step 4: Mount the navigation before the hero and establish global tokens**

Update `src/main.ts` to render the navigation before `renderHero`. Replace the existing top-level identity navigation in later hero work rather than maintaining two nav systems.

Add the token layer at the start of `src/styles.css`:

```css
:root {
  color-scheme: dark;
  --ink: #050505;
  --ink-soft: #0b0b0c;
  --paper: #e9e5de;
  --paper-ink: #171719;
  --text: #f2f0eb;
  --muted: #96969d;
  --line: rgb(255 255 255 / 0.14);
  --accent: #8f322b;
  --radius-panel: 28px;
  --radius-card: 24px;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --nav-height: 64px;
}
```

Implement `.site-nav` as fixed, safe-area-aware, translucent black with restrained blur. At small widths, reduce font size/gap only; do not introduce a hamburger.

- [ ] **Step 5: Update integration expectations and run the shell tests**

Run:

```powershell
npm.cmd exec vitest run -- --testTimeout=30000 src/navigation/render-navigation.test.ts src/main.test.ts src/styles.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the shell and approved source asset**

```powershell
git add src/navigation src/main.ts src/main.test.ts src/styles.css public/portrait-resume-retouched-v1.png
git commit -m "feat: establish black portfolio navigation shell"
```

## Task 2: Recompose the homepage and strengthen the particle portrait

**Files:**
- Modify: `src/hero/render-hero.ts`
- Modify: `src/hero/render-hero.test.ts`
- Modify: `src/main.ts`
- Modify: `src/particles/types.ts`
- Modify: `src/particles/sampler.ts`
- Modify: `src/particles/sampler.test.ts`
- Modify: `src/particles/renderer.ts`
- Modify: `src/particles/renderer.test.ts`
- Modify: `src/particles/controller.ts`
- Modify: `src/particles/controller.test.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Replace the old hero assertions with the approved A-composition contract**

Add assertions that the hero:

```ts
expect(root.querySelector(".identity nav")).toBeNull();
expect(root.querySelector("#top")).not.toBeNull();
expect(root.querySelector("[data-hero-supporting]")?.textContent).toBe(
  "从实体产品到智能系统，以研究、交互与原型塑造未来体验。",
);
expect(hero.chatRoot).toBeUndefined();
expect(hero.portraitBase.src).toContain("portrait-resume-retouched-v1.png");
```

Change `HeroElements` so the hero returns only portrait elements. The chat becomes a global sibling mounted in Task 6.

- [ ] **Step 2: Run the hero test and confirm the old embedded identity/chat structure fails**

```powershell
npm.cmd exec vitest run -- --testTimeout=30000 src/hero/render-hero.test.ts
```

Expected: FAIL on duplicate hero navigation, embedded chat, and missing supporting copy.

- [ ] **Step 3: Implement the A composition and approved source image wiring**

Use markup shaped like:

```ts
root.insertAdjacentHTML("beforeend", `
  <section class="hero" id="top" aria-labelledby="hero-title">
    <div class="hero-copy">
      <p class="hero-kicker">PRODUCT · INTERACTION · AI+</p>
      <h1 id="hero-title" class="headline">
        <span>Crafting <em>Future</em></span>
        <span>Through Objects</span>
        <span>&amp; Systems.</span>
      </h1>
      <p data-hero-supporting>从实体产品到智能系统，以研究、交互与原型塑造未来体验。</p>
    </div>
    <div class="portrait-stage" role="img" aria-label="赵实旷的粒子肖像">
      <img class="portrait-base" alt="" aria-hidden="true" />
      <canvas class="portrait-canvas" aria-hidden="true"></canvas>
      <p class="portrait-error" role="status">Portrait visualization unavailable.</p>
    </div>
  </section>
`);
```

Import the approved asset in `src/main.ts` using:

```ts
import portraitUrl from "/portrait-resume-retouched-v1.png";
```

- [ ] **Step 4: Add failing depth and lifecycle tests for particles**

Extend `Particle` with a deterministic `depth` value and assert:

```ts
expect(particles.every(({ depth }) => depth >= 0 && depth <= 1)).toBe(true);
expect(new Set(particles.map(({ region }) => region))).toEqual(
  new Set(["core", "face", "edge"]),
);
expect(particles.filter(({ band }) => band === "micro").length)
  .toBeGreaterThan(particles.filter(({ band }) => band === "large").length);
```

In the controller test, inject an `IntersectionObserver`/visibility dependency and assert the settled frame is redrawn only for resize/parallax, while `document.hidden` or offscreen state cancels scheduled canvas work.

- [ ] **Step 5: Run particle tests and confirm the new depth/lifecycle assertions fail**

```powershell
npm.cmd exec vitest run -- --testTimeout=30000 src/particles/sampler.test.ts src/particles/renderer.test.ts src/particles/controller.test.ts
```

Expected: FAIL because particles have no `depth` and the controller lacks visibility handling.

- [ ] **Step 6: Implement layered sampling and restrained settled parallax**

Add `depth: number` to `Particle`. Compute it deterministically from region, luminance, and edge strength:

```ts
const depthBase = region === "core" ? 0.86 : region === "face" ? 0.62 : 0.28;
const depth = clamp01(depthBase + edge * 0.1 + (light - 0.5) * 0.12);
```

Update `ParticleRenderer.draw` to accept optional parallax:

```ts
draw(particles, progress, source, parallax = { x: 0, y: 0 }): void
```

Apply no more than `6px` desktop / `3px` mobile displacement multiplied by particle depth. In `startPortrait`, keep the existing single 2200ms entrance, then draw a stable frame; pointer/device motion only requests one frame and is ignored under reduced motion. Pause/cancel work when offscreen or `document.hidden`.

- [ ] **Step 7: Style the first screen and particle-only fallback**

Use an editorial black first viewport, title above portrait, and a short black breathing interval before the résumé. Keep `.portrait-base` visually hidden in all successful states; on canvas failure, generate/use a safe static particle representation or status, never reveal the source photograph.

- [ ] **Step 8: Run hero and particle tests**

```powershell
npm.cmd exec vitest run -- --testTimeout=30000 src/hero src/particles src/main.test.ts src/styles.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add src/hero src/particles src/main.ts src/styles.css src/main.test.ts src/styles.test.ts
git commit -m "feat: recompose particle portrait homepage"
```

## Task 3: Build the landscape résumé second screen

**Files:**
- Create: `src/resume/render-resume.ts`
- Create: `src/resume/render-resume.test.ts`
- Modify: `src/content/portfolio.ts`
- Modify: `src/content/portfolio.test.ts`
- Modify: `src/portfolio/render-portfolio.ts`
- Modify: `src/portfolio/render-portfolio.test.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Add typed public résumé content and a failing privacy test**

Extend `Profile` with public contacts and curated résumé groups rather than placing text directly in the renderer:

```ts
export interface ResumeSection {
  readonly label: string;
  readonly title: string;
  readonly lines: readonly string[];
}

export interface Profile {
  // existing fields
  readonly emails: readonly [string, string];
  readonly resumeHref: string;
  readonly resumeSections: readonly ResumeSection[];
}
```

Test that serialized profile/rendered résumé contains both approved emails and Shanghai, but matches neither phone-like strings nor a street address:

```ts
expect(markup).toContain("zkuang0408@gmail.com");
expect(markup).toContain("2643414752@qq.com");
expect(markup).toContain("Shanghai, China");
expect(markup).not.toMatch(/\+?86|189\d{8}|上海市.+(?:路|号)/);
```

- [ ] **Step 2: Run the résumé/content tests and confirm failure**

```powershell
npm.cmd exec vitest run -- --testTimeout=30000 src/content/portfolio.test.ts src/resume/render-resume.test.ts
```

Expected: FAIL because the typed résumé module and fields do not exist.

- [ ] **Step 3: Implement the curated B-layout renderer**

Expose:

```ts
export function renderResume(profile: Profile, portraitUrl: string): string
```

The returned section must use `id="resume"`, a warm-gray `.resume-panel`, a real `<img>` with meaningful alt text, semantic headings, approved email links, and:

```html
<a class="resume-download" href="/documents/zhao-shikuang-resume-public.pdf" download>
  下载公开简历 PDF
</a>
```

Integrate it as the first section rendered by `renderPortfolio`, replacing the old generic `#about` capability grid. Pass `portraitUrl` to `renderPortfolio(root, { portraitUrl })` so the same approved image is used.

- [ ] **Step 4: Add transition and responsive styling**

Implement:

- black pause after hero;
- panel width near `90vw`, max width token, `28px` radius;
- photograph left and curated résumé content right on landscape screens;
- single-column photo/content on mobile;
- dark-red rules/labels;
- 400ms rise/fade only when intersecting;
- immediate final state under `prefers-reduced-motion`.

Use an `IntersectionObserver` class toggle only if CSS cannot express the entrance cleanly; if added, create `src/resume/resume-entrance.ts` with a cleanup-returning controller and its own test.

- [ ] **Step 5: Run content, résumé, portfolio, and CSS tests**

```powershell
npm.cmd exec vitest run -- --testTimeout=30000 src/content/portfolio.test.ts src/resume src/portfolio/render-portfolio.test.ts src/styles.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/content src/resume src/portfolio/render-portfolio.ts src/portfolio/render-portfolio.test.ts src/styles.css src/styles.test.ts
git commit -m "feat: add editorial landscape resume"
```

## Task 4: Add project selector cards and active chapter synchronization

**Files:**
- Create: `src/portfolio/project-selector.ts`
- Create: `src/portfolio/project-selector.test.ts`
- Modify: `src/portfolio/render-portfolio.ts`
- Modify: `src/portfolio/render-portfolio.test.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Add failing selector markup tests**

Assert the exact fixed order and mapping:

```ts
expect(
  Array.from(root.querySelectorAll<HTMLElement>("[data-project-selector]"),
    (card) => card.dataset.projectSelector),
).toEqual(["inkseat", "emovue", "evolution-fruit", "atempo", "urosense", "first-fly"]);
expect(root.querySelectorAll("[data-project-chapter]")).toHaveLength(6);
expect(root.querySelector("#project-inkseat")?.getAttribute("data-project-chapter"))
  .toBe("inkseat");
```

Each selector must be an anchor/button with project name, number, category, and a real first-page `<picture>` crop.

- [ ] **Step 2: Add failing controller tests**

Define:

```ts
export interface ProjectSelectorDependencies {
  readonly scrollIntoView: (target: HTMLElement) => void;
  readonly IntersectionObserver?: IntersectionObserverConstructor;
}

export function startProjectSelector(
  root: HTMLElement,
  dependencies?: Partial<ProjectSelectorDependencies>,
): () => void
```

Test click-to-chapter mapping, one `aria-current="true"` selector, intersection-driven active state, no focus theft, and listener/observer cleanup.

- [ ] **Step 3: Run selector tests and confirm failure**

```powershell
npm.cmd exec vitest run -- --testTimeout=30000 src/portfolio/render-portfolio.test.ts src/portfolio/project-selector.test.ts
```

Expected: FAIL because selector markup/controller are absent.

- [ ] **Step 4: Render selector rail and evidence-led chapters**

In `renderProjects`, render:

```html
<nav class="project-selector-rail" aria-label="选择项目">
  <!-- six selector anchors/cards -->
</nav>
<div class="project-chapters">
  <!-- six articles, each with data-project-chapter and existing reader markup -->
</div>
```

Use `project.summary` as the grounded value statement and `project.role` as contribution. Do not invent extra claims or false case-study links.

- [ ] **Step 5: Implement active synchronization and mount cleanup in `main.ts`**

Use `scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" })`. Observe chapters with a central root margin and update only `aria-current`/data state. Return a cleanup function and call it during `pagehide` with readers/chat cleanup.

- [ ] **Step 6: Style the six-card row/rail without layout-shifting animation**

Required CSS behavior:

- `>=1180px`: six equal responsive cards in one row;
- `<1180px`: horizontal snap rail with partial next card;
- mobile: approximately `83vw` card width (about 1.2 visible);
- hover/focus: card `scale(1.03)`, inner image slightly larger, 200ms `var(--ease-out)`;
- restrained red active line/dot;
- 44px minimum touch target and visible focus ring.

- [ ] **Step 7: Run tests and commit**

```powershell
npm.cmd exec vitest run -- --testTimeout=30000 src/portfolio/project-selector.test.ts src/portfolio/render-portfolio.test.ts src/main.test.ts src/styles.test.ts
git add src/portfolio src/main.ts src/main.test.ts src/styles.css src/styles.test.ts
git commit -m "feat: add project discovery rail and chapters"
```

Expected: tests PASS and commit succeeds.

## Task 5: Wrap the existing reader in fullscreen history-aware presentation

**Files:**
- Create: `src/portfolio/reader-route.ts`
- Create: `src/portfolio/reader-route.test.ts`
- Modify: `src/portfolio/image-reader.ts`
- Modify: `src/portfolio/image-reader.test.ts`
- Modify: `src/portfolio/render-portfolio.ts`
- Modify: `src/portfolio/render-portfolio.test.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Add failing history parser/serializer tests**

Implement the intended pure contract in tests first:

```ts
expect(parseReaderLocation("#reader/inkseat/08")).toEqual({
  projectId: "inkseat", page: 8,
});
expect(parseReaderLocation("#reader/not-a-project/3")).toBeUndefined();
expect(readerLocation({ projectId: "emovue", page: 2 }))
  .toBe("#reader/emovue/02");
```

Also test that opening stores `{ projectId, page, sourceScrollY }`, pushes history, and closing/back restores the recorded scroll position.

- [ ] **Step 2: Run route tests and confirm failure**

```powershell
npm.cmd exec vitest run -- --testTimeout=30000 src/portfolio/reader-route.test.ts
```

Expected: FAIL because `reader-route.ts` is missing.

- [ ] **Step 3: Implement pure routing plus a cleanup-returning reader presentation controller**

Expose:

```ts
export interface ReaderRoute {
  readonly projectId: string;
  readonly page: number;
}

export function parseReaderLocation(hash: string): ReaderRoute | undefined;
export function readerLocation(route: ReaderRoute): string;
export function startReaderRouting(root: HTMLElement, deps?: ReaderRoutingDependencies): () => void;
```

On chapter image activation, remember scroll position, add `.is-fullscreen`, update history, focus the reader, and dispatch/open the requested page through the existing reader controller. On `popstate`, close/restore rather than recreate images.

- [ ] **Step 4: Extend `ImageReader` with observable page state, not duplicate loading logic**

Add:

```ts
export interface ImageReader {
  // existing methods
  currentPage(): number;
}
```

After `markReady`, dispatch a bubbling event:

```ts
root.dispatchEvent(new CustomEvent("portfolio:reader-page-change", {
  bubbles: true,
  detail: { projectId: project.id, page: pageNumber },
}));
```

The route controller replaces history state on page changes. Preserve existing lazy load, stale-request protection, retry, preload-successor, keyboard, and swipe behavior.

- [ ] **Step 5: Add failing integration assertions for fullscreen trigger and close control**

Require a chapter media trigger (`data-open-reader`) and a labeled close control in fullscreen presentation. Keep the approved unbacked side SVG `< >` controls and page counter.

- [ ] **Step 6: Style shared expansion and 220ms page transition**

Use a fullscreen fixed layer with black background, safe-area padding, and `view-transition-name` only when supported; otherwise animate transform/opacity from the chapter image’s measured rect. Keep arrows near the reader edges with 2px gray semi-transparent strokes and no glass background. Prevent the assistant and counter from overlapping via shared CSS safe-area variables.

- [ ] **Step 7: Run reader regression tests**

```powershell
npm.cmd exec vitest run -- --testTimeout=30000 src/portfolio/image-reader.test.ts src/portfolio/reader-route.test.ts src/portfolio/render-portfolio.test.ts src/chat/source-navigation.test.ts
```

Expected: PASS, including stale load, retry, cited-page opening, keyboard, swipe, history, and restoration cases.

- [ ] **Step 8: Commit**

```powershell
git add src/portfolio src/main.ts src/styles.css
git commit -m "feat: add fullscreen history-aware project reader"
```

## Task 6: Separate AI request state from the persistent orb/panel presentation

**Files:**
- Create: `src/chat/chat-presentation.ts`
- Create: `src/chat/chat-presentation.test.ts`
- Modify: `src/chat/render-chat.ts`
- Modify: `src/chat/render-chat.test.ts`
- Modify: `src/chat/chat-controller.ts`
- Modify: `src/chat/chat-controller.test.ts`
- Modify: `src/hero/render-hero.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Add a failing render contract for collapsed and expanded controls**

`renderChat` must render once into a global host and return both presentation controls and existing data elements:

```ts
export interface ChatElements {
  readonly root: HTMLElement;
  readonly orb: HTMLButtonElement;
  readonly panel: HTMLElement;
  readonly collapse: HTMLButtonElement;
  // retain form/input/send/transcript/sources/status/recommendations
}
```

Test initial state:

```ts
expect(elements.root.dataset.chatPresentation).toBe("collapsed");
expect(elements.orb.getAttribute("aria-expanded")).toBe("false");
expect(elements.panel.getAttribute("role")).toBe("region");
expect(elements.collapse.getAttribute("aria-label")).toContain("收起");
```

- [ ] **Step 2: Add failing pure presentation-state tests**

Define states/events:

```ts
export type ChatPresentationState = "collapsed" | "expanded" | "scrolling";
export type ChatPresentationEvent =
  | "OPEN" | "CLOSE" | "SCROLL_START" | "SCROLL_STOP";
```

Test that `SCROLL_START` collapses an expanded panel, `SCROLL_STOP` returns only to `collapsed` (never auto-opens), and message/draft DOM nodes are not replaced.

- [ ] **Step 3: Run chat view/presentation tests and confirm failure**

```powershell
npm.cmd exec vitest run -- --testTimeout=30000 src/chat/render-chat.test.ts src/chat/chat-presentation.test.ts
```

Expected: FAIL because the orb, panel and state machine do not exist.

- [ ] **Step 4: Implement the view shell and presentation controller**

Expose:

```ts
export interface ChatPresentationDependencies {
  readonly window: Pick<Window, "addEventListener" | "removeEventListener" | "setTimeout" | "clearTimeout">;
  readonly visualViewport?: VisualViewport;
  readonly reducedMotion: boolean;
}

export function startChatPresentation(
  elements: ChatElements,
  dependencies: ChatPresentationDependencies,
): () => void;
```

Behavior:

- orb opens panel and moves focus to input;
- collapse button/Escape/downward mobile swipe closes to orb;
- first sustained scroll closes in ~180ms;
- a 250ms scroll-stop timer restores normal orb visibility only;
- preserve input value, transcript nodes, request stream, transcript scroll position, and session storage;
- expose `open()` through a custom `portfolio:open-chat` event so both fixed nav Ask AI and orb share one path.

- [ ] **Step 5: Keep `startPortfolioChat` request/session behavior intact**

Change it to accept already-rendered `ChatElements` or an optional view factory, so it does not call `renderChat` a second time:

```ts
export function startPortfolioChat(
  elements: ChatElements,
  dependencies: PortfolioChatDependencies,
): () => void
```

Update tests to prove collapsing during an active stream does not abort the fetch and that destroy still aborts it. Do not alter endpoint resolution, request body, SSE protocol, retry, citations, history, or public error mapping.

- [ ] **Step 6: Implement minimal collision and keyboard avoidance**

Compute assistant insets from:

- CSS safe-area inset;
- `visualViewport.height/offsetTop` for the on-screen keyboard;
- visible `[data-reader-safe-zone]`, page counter, and contact controls.

Apply only `--chat-offset-x` and `--chat-offset-y` to move inward/upward by the minimum intersection distance. Add unit tests for a pure `resolveAssistantOffset(anchorRect, blockers, viewport)` helper.

- [ ] **Step 7: Style orb morph and mobile sheet**

Desktop: fixed lower-right orb → approximately `400x560px` dark translucent panel. Mobile: bottom sheet above keyboard. Use shared border radius, transform/opacity, 180–240ms `var(--ease-out)`, a restrained particle convergence on hover/focus, and 3% press scale. No looping pulse/glow.

- [ ] **Step 8: Run all chat regression tests**

```powershell
npm.cmd exec vitest run -- --testTimeout=30000 src/chat/render-chat.test.ts src/chat/chat-presentation.test.ts src/chat/chat-controller.test.ts src/chat/session.test.ts src/chat/sse.test.ts src/main.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add src/chat src/hero/render-hero.ts src/main.ts src/styles.css
git commit -m "feat: add persistent collapsible portfolio assistant"
```

## Task 7: Finish the contact ending, navigation state, and responsive/accessibility details

**Files:**
- Create: `src/navigation/section-state.ts`
- Create: `src/navigation/section-state.test.ts`
- Modify: `src/portfolio/render-portfolio.ts`
- Modify: `src/portfolio/render-portfolio.test.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Modify: `src/styles.test.ts`

- [ ] **Step 1: Add failing contact/privacy assertions**

```ts
const contact = root.querySelector("#contact")!;
expect(contact.querySelector("h2")?.textContent).toContain("Let’s create");
expect(contact.querySelectorAll('a[href^="mailto:"]')).toHaveLength(2);
expect(contact.textContent).toContain("Shanghai, China");
expect(contact.querySelector("form")).toBeNull();
expect(contact.textContent).not.toMatch(/电话|手机号|上海市.+(?:路|号)/);
```

- [ ] **Step 2: Add failing navigation-active-state tests**

Test `startSectionState(nav, sections, { IntersectionObserver })` sets `aria-current="location"` for résumé/projects/contact and cleans up without moving focus.

- [ ] **Step 3: Run the focused tests and confirm failure**

```powershell
npm.cmd exec vitest run -- --testTimeout=30000 src/navigation/section-state.test.ts src/portfolio/render-portfolio.test.ts src/styles.test.ts
```

Expected: FAIL on missing section state and old contact content.

- [ ] **Step 4: Implement the minimal ending and active nav state**

Render only a large serif invitation, one collaboration sentence, two `mailto:` links, location, and restrained footer metadata. Mount `startSectionState` in `main.ts` and add cleanup to `pagehide`.

- [ ] **Step 5: Complete responsive and accessibility CSS**

Verify in code/styles:

- fixed nav remains readable at 320px without horizontal document overflow;
- light résumé panel still meets contrast requirements;
- focus-visible styles exist for every link/button/card/reader/chat control;
- touch controls are at least 44px;
- safe-area insets are honored;
- `prefers-reduced-motion` disables aggregation/entrance/shared movement while preserving state changes;
- no persistent animation declarations remain.

- [ ] **Step 6: Run tests and commit**

```powershell
npm.cmd exec vitest run -- --testTimeout=30000 src/navigation src/portfolio/render-portfolio.test.ts src/styles.test.ts src/main.test.ts
git add src/navigation src/portfolio/render-portfolio.ts src/portfolio/render-portfolio.test.ts src/main.ts src/styles.css src/styles.test.ts
git commit -m "feat: finish responsive portfolio contact and navigation"
```

Expected: PASS and commit succeeds.

## Task 8: Add end-to-end coverage for the approved visitor journey

**Files:**
- Modify: `tests/homepage.spec.ts`
- Modify: `tests/global-setup.ts` only if deterministic route/mock setup is required
- Modify: `playwright.config.ts` only if adding named desktop/mobile/reduced-motion projects is necessary

- [ ] **Step 1: Add failing desktop journey coverage**

Add a test that:

1. loads the black homepage and fixed nav;
2. confirms particle canvas and no visible source-photo overlay;
3. navigates to résumé and verifies approved contacts/privacy;
4. activates the INKSeat selector and confirms chapter scroll;
5. opens fullscreen reader, moves to page 2, validates `02 / 18` and route;
6. presses browser Back and confirms chapter + scroll restoration;
7. opens AI from nav, preserves a typed draft across collapse/reopen;
8. scrolls while open and confirms collapse without auto-reopen;
9. reaches contact.

- [ ] **Step 2: Add failing mobile and reduced-motion coverage**

At representative mobile width, assert top nav remains visible, selector shows a partial next card and supports horizontal movement, reader swipe works, chat uses bottom-sheet geometry, and no horizontal page overflow exists. Under reduced motion, assert final states are present without waiting for animations.

- [ ] **Step 3: Run Playwright against the implementation and fix only observed failures**

```powershell
npm.cmd run test:e2e -- --project=chromium
```

Expected: desktop/mobile/reduced-motion tests PASS; screenshots and traces are created only in ignored test output paths.

- [ ] **Step 4: Commit E2E coverage**

```powershell
git add tests playwright.config.ts
git commit -m "test: cover redesigned portfolio journey"
```

## Task 9: Full regression, performance, and Preview-ready handoff

**Files:**
- Modify only files required by failures found in this task
- Do not modify deployment configuration or secrets

- [ ] **Step 1: Run the complete unit suite with the validated timeout**

```powershell
npm.cmd exec vitest run -- --testTimeout=30000 --reporter=dot
```

Expected: all test files and all tests PASS (baseline was 46 files / 891 tests before redesign; final counts will be higher).

- [ ] **Step 2: Verify generated knowledge and project image assets remain untouched/valid**

```powershell
npm.cmd run knowledge:verify
npm.cmd run portfolio-pages:verify
```

Expected: both commands exit 0 with no generated differences.

- [ ] **Step 3: Build the production client and verify bundle guardrails**

```powershell
npm.cmd run build
```

Expected: TypeScript, Vite build, knowledge/page prebuild verification, and client bundle safety check all exit 0. No secret/provider/server-only code appears in the client bundle.

- [ ] **Step 4: Run the complete E2E suite**

```powershell
npm.cmd run test:e2e
```

Expected: PASS for every configured browser/viewport project.

- [ ] **Step 5: Inspect repository scope and diff hygiene**

```powershell
git status --short
git diff --check HEAD~8..HEAD
git diff --stat 9c2926b..HEAD
```

Expected:

- no `.playwright-cli/`, `.env*`, secrets, generated PDFs, knowledge corpus changes, or deployment configuration changes staged/committed;
- no whitespace errors;
- only the isolated redesign branch changed.

- [ ] **Step 6: Perform local visual review at required viewports**

Run:

```powershell
npm.cmd run dev -- --host 127.0.0.1
```

Review at `1440×900`, `1180×820`, `768×1024`, `390×844`, and `320×700`, plus keyboard-only and reduced-motion modes. Capture evidence for homepage, résumé, selector, one chapter, fullscreen reader, chat collapsed/expanded, and contact. Stop the dev server afterward.

- [ ] **Step 7: Commit any verified final polish separately**

```powershell
git add -u
git commit -m "fix: polish redesigned portfolio verification issues"
```

Skip this commit when no verified polish was needed.

- [ ] **Step 8: Prepare, but do not trigger, Preview handoff**

Report:

- branch name and commit list;
- exact test/build results;
- local visual evidence paths;
- any known non-blocking limitations;
- explicit statement that original checkout and production deployment remain untouched.

Only after the user explicitly approves a Preview deployment may the branch be pushed/deployed to Preview. Production remains forbidden until a separate explicit approval after Preview review.
