# Portfolio Content and Particle Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a data-driven one-page portfolio with a strictly particle-only hero, six selected projects, safe resume content, downloadable portfolio files, responsive accessibility, and an updated Vercel deployment.

**Architecture:** Keep the existing Vite/TypeScript particle engine isolated from content rendering. A typed content module supplies profile, project, and document records to a focused portfolio renderer; the hero remains responsible only for identity/navigation/portrait markup. Static project and document assets use stable paths under `public/` so future replacement does not require structural code changes.

**Tech Stack:** TypeScript, Vite, Canvas 2D, Vitest + jsdom, Playwright, CSS, Vercel static deployment.

---

### Task 1: Enforce the particle-only portrait contract

**Files:**
- Modify: `src/hero/render-hero.test.ts`
- Modify: `src/hero/render-hero.ts`
- Modify: `src/styles.test.ts`
- Modify: `src/styles.css`
- Modify: `tests/homepage.spec.ts`

- [ ] **Step 1: Write failing unit tests for hidden sampling image semantics**

Add to `src/hero/render-hero.test.ts`:

```ts
test("marks the sampling image as decorative and hidden from assistive technology", () => {
  const root = document.createElement("div");
  renderHero(root, "/portrait.png");
  const image = root.querySelector<HTMLImageElement>(".portrait-base");
  expect(image?.alt).toBe("");
  expect(image?.getAttribute("aria-hidden")).toBe("true");
});
```

Replace the fallback visibility assertion in `src/styles.test.ts` with tests that require zero opacity in the base, mobile, fallback, and error rules:

```ts
test("never presents the portrait sampling image", () => {
  expect(styles).toMatch(/\.portrait-base\s*\{[\s\S]*?opacity:\s*0;/);
  expect(styles).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?\.portrait-base\s*\{\s*opacity:\s*0;/);
  expect(styles).toMatch(/\.portrait-stage--fallback \.portrait-base,[\s\S]*?\.portrait-stage\.is-error \.portrait-base\s*\{[\s\S]*?opacity:\s*0;/);
  expect(styles).not.toMatch(/\.portrait-base\s*\{[\s\S]*?opacity:\s*0\.(?:28|32|46)/);
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npm test -- src/hero/render-hero.test.ts src/styles.test.ts`

Expected: FAIL because the image lacks `aria-hidden` and CSS still uses opacity `0.32`, `0.28`, and `0.46`.

- [ ] **Step 3: Implement the minimal hidden-source contract**

Change the hero image markup to:

```html
<img class="portrait-base" alt="" aria-hidden="true" />
```

Change every `.portrait-base` presentation rule in `src/styles.css` to `opacity: 0;`. Preserve sizing and object positioning because Canvas sampling still depends on the image asset, but remove visual-only filters and masks. Keep Canvas hidden on fallback/error and keep the black portrait stage.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `npm test -- src/hero/render-hero.test.ts src/styles.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 5: Add the failing browser assertion**

In `tests/homepage.spec.ts`, replace the visible base-image assertion with:

```ts
const portraitBase = page.locator(".portrait-base");
await expect(portraitBase).toHaveCSS("opacity", "0");
await expect(page.locator(".portrait-canvas")).toBeVisible();
```

Add a DOM-state test that applies `portrait-stage--fallback` and `portrait-stage--error` and expects computed opacity to remain `0` in both states.

- [ ] **Step 6: Commit the particle-only contract**

```bash
git add src/hero/render-hero.ts src/hero/render-hero.test.ts src/styles.css src/styles.test.ts tests/homepage.spec.ts
git commit -m "fix: render portrait exclusively with particles"
```

### Task 2: Add typed portfolio content and privacy checks

**Files:**
- Create: `src/content/portfolio.ts`
- Create: `src/content/portfolio.test.ts`

- [ ] **Step 1: Write failing tests for the public content model**

Create `src/content/portfolio.test.ts`:

```ts
import { expect, test } from "vitest";
import { documents, profile, projects } from "./portfolio";

test("publishes the approved six-project selection in evidence-led order", () => {
  expect(projects.map(({ id }) => id)).toEqual([
    "atempo", "inkseat", "emovue", "urosense", "evolution-fruit", "first-fly",
  ]);
  expect(projects).toHaveLength(6);
  expect(projects.every((project) => project.imageAlt && project.tags.length >= 3)).toBe(true);
});

test("uses stable document paths for later asset replacement", () => {
  expect(documents.map(({ href }) => href)).toEqual([
    "/documents/zhao-shikuang-portfolio.pdf",
    "/documents/zhao-shikuang-portfolio.pptx",
  ]);
});

test("keeps restricted resume details out of public content", () => {
  const serialized = JSON.stringify({ documents, profile, projects });
  expect(serialized).toContain("zkuang0408@gmail.com");
  expect(serialized).not.toContain("18099592958");
  expect(serialized).not.toContain("2643414752@qq.com");
  expect(serialized).not.toContain("彰武路102号");
});
```

- [ ] **Step 2: Run the content test and confirm RED**

Run: `npm test -- src/content/portfolio.test.ts`

Expected: FAIL because `src/content/portfolio.ts` does not exist.

- [ ] **Step 3: Implement the typed content module**

Create exported `Profile`, `Project`, and `DocumentLink` interfaces plus immutable records. Use the approved profile copy, Gmail/Shanghai only, the six stable image URLs under `/projects/`, and the two document URLs tested above. Each project record must include `id`, `number`, `title`, `type`, `summary`, `role`, `tags`, `image`, and `imageAlt`.

- [ ] **Step 4: Run the content test and confirm GREEN**

Run: `npm test -- src/content/portfolio.test.ts`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit the content model**

```bash
git add src/content/portfolio.ts src/content/portfolio.test.ts
git commit -m "feat: add public portfolio content model"
```

### Task 3: Render About, Projects, Documents, and Contact

**Files:**
- Create: `src/portfolio/render-portfolio.ts`
- Create: `src/portfolio/render-portfolio.test.ts`
- Modify: `src/hero/render-hero.ts`
- Modify: `src/hero/render-hero.test.ts`
- Modify: `src/main.ts`
- Modify: `src/main.test.ts`

- [ ] **Step 1: Write the failing portfolio renderer test**

Create `src/portfolio/render-portfolio.test.ts`:

```ts
import { expect, test } from "vitest";
import { renderPortfolio } from "./render-portfolio";

test("renders accessible resume, project, document, and contact sections", () => {
  const root = document.createElement("main");
  renderPortfolio(root);
  expect(root.querySelector("#about h2")?.textContent).toContain("About");
  expect(root.querySelectorAll("#projects article")).toHaveLength(6);
  expect(root.querySelectorAll("#projects img[alt]")).toHaveLength(6);
  expect(root.querySelectorAll(".project-tags li").length).toBeGreaterThanOrEqual(18);
  expect(root.querySelectorAll(".documents a[download]")).toHaveLength(2);
  expect(root.querySelector<HTMLAnchorElement>('a[href="mailto:zkuang0408@gmail.com"]')).not.toBeNull();
  expect(root.textContent).toContain("同济大学设计创意学院");
});
```

- [ ] **Step 2: Run the renderer test and confirm RED**

Run: `npm test -- src/portfolio/render-portfolio.test.ts`

Expected: FAIL because the renderer does not exist.

- [ ] **Step 3: Implement the renderer with isolated section functions**

Create `renderAbout`, `renderProjects`, `renderDocuments`, and `renderContact` helpers inside `src/portfolio/render-portfolio.ts`. Export only:

```ts
export function renderPortfolio(root: HTMLElement): void {
  root.insertAdjacentHTML(
    "beforeend",
    `${renderAbout()}${renderProjects()}${renderDocuments()}${renderContact()}`,
  );
}
```

Escape is not required because all content is trusted local constants, but use semantic `<section>`, `<article>`, `<ul>`, `<figure>`, `<time>`, and heading markup. Do not render case-study links.

- [ ] **Step 4: Run the renderer test and confirm GREEN**

Run: `npm test -- src/portfolio/render-portfolio.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing integration tests for real navigation and composition**

Update hero/main tests to require exactly three anchors with `#about`, `#projects`, and `#contact`, no `aria-disabled`, one `.portfolio-content` wrapper, six project articles, and one call to `startPortrait` using the hero elements.

- [ ] **Step 6: Run hero/main tests and confirm RED**

Run: `npm test -- src/hero/render-hero.test.ts src/main.test.ts`

Expected: FAIL because navigation is disabled and `main.ts` renders only the hero.

- [ ] **Step 7: Implement real navigation and page composition**

Change hero navigation to:

```html
<nav aria-label="主要栏目">
  <a href="#about">About</a>
  <a href="#projects">Projects</a>
  <a href="#contact">Contact</a>
</nav>
```

In `src/main.ts`, create a `.portfolio-content` `<main>`, append it after the hero, call `renderPortfolio(main)`, and preserve the existing `startPortrait` invocation.

- [ ] **Step 8: Run integration tests and confirm GREEN**

Run: `npm test -- src/hero/render-hero.test.ts src/main.test.ts src/portfolio/render-portfolio.test.ts`

Expected: all tests PASS.

- [ ] **Step 9: Commit the page structure**

```bash
git add src/portfolio src/hero/render-hero.ts src/hero/render-hero.test.ts src/main.ts src/main.test.ts
git commit -m "feat: add portfolio sections and navigation"
```

### Task 4: Ship stable project and portfolio assets

**Files:**
- Create: `public/projects/atempo.png`
- Create: `public/projects/inkseat.png`
- Create: `public/projects/emovue.png`
- Create: `public/projects/urosense.png`
- Create: `public/projects/evolution-fruit.png`
- Create: `public/projects/first-fly.png`
- Create: `public/documents/zhao-shikuang-portfolio.pdf`
- Create: `public/documents/zhao-shikuang-portfolio.pptx`
- Create: `src/public-assets.test.ts`

- [ ] **Step 1: Write the failing filesystem asset test**

Create `src/public-assets.test.ts` with node environment and assert that all eight stable public paths exist and have non-zero size. Also read the PDF header and require `%PDF`, and read the PPTX header and require ZIP bytes `PK`.

- [ ] **Step 2: Run the asset test and confirm RED**

Run: `npm test -- src/public-assets.test.ts`

Expected: FAIL because the stable assets do not yet exist.

- [ ] **Step 3: Copy audited assets into stable public paths**

Copy these exact sources:

```text
portfolio_work/review/preview/master/slide-11.png -> public/projects/atempo.png
portfolio_work/review/preview/master/slide-14.png -> public/projects/inkseat.png
portfolio_work/review/preview/master/slide-17.png -> public/projects/emovue.png
portfolio_work/review/preview/master/slide-05.png -> public/projects/urosense.png
portfolio_work/review/preview/master/slide-26.png -> public/projects/evolution-fruit.png
portfolio_work/review/preview/master/slide-21.png -> public/projects/first-fly.png
portfolio_work/output/赵实旷_实习作品集_母版.pdf -> public/documents/zhao-shikuang-portfolio.pdf
portfolio_work/output/赵实旷_实习作品集_母版.pptx -> public/documents/zhao-shikuang-portfolio.pptx
```

- [ ] **Step 4: Run the asset test and confirm GREEN**

Run: `npm test -- src/public-assets.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the stable assets**

```bash
git add public/projects public/documents src/public-assets.test.ts
git commit -m "assets: add selected work and portfolio downloads"
```

### Task 5: Add the responsive editorial visual system

**Files:**
- Modify: `src/styles.test.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing structural CSS tests**

Add assertions for `.portfolio-content`, `.section-heading`, `.about-grid`, `.project-list`, `.project-card`, `.project-media`, `.documents`, `.contact`, anchor focus-visible styles, a single-column project layout below 760px, and reduced-motion scroll behavior.

- [ ] **Step 2: Run style tests and confirm RED**

Run: `npm test -- src/styles.test.ts`

Expected: FAIL because portfolio section styles do not exist.

- [ ] **Step 3: Implement the editorial section styles**

Extend `src/styles.css` using the existing tokens. Use full-bleed black sections, `clamp()` spacing/type, a two-column About grid, alternating project media/text columns on desktop, one-column cards on mobile, square image frames without rounded corners, restrained borders, grayscale images with hover color recovery, visible keyboard focus, and `scroll-behavior: smooth` only under `prefers-reduced-motion: no-preference`.

- [ ] **Step 4: Run style tests and confirm GREEN**

Run: `npm test -- src/styles.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit responsive styling**

```bash
git add src/styles.css src/styles.test.ts
git commit -m "style: extend editorial system across portfolio"
```

### Task 6: Extend end-to-end coverage and visual QA

**Files:**
- Modify: `tests/homepage.spec.ts`
- Modify: `scripts/clean-e2e-output.mjs` only if the new screenshots require additional cleanup paths

- [ ] **Step 1: Write failing E2E checks for content, assets, privacy, and anchor navigation**

Add a test that verifies the three navigation links, scrolls each target into view, checks six project articles and six successfully loaded images, requests both document URLs and expects status 200, verifies Gmail is visible, rejects phone/QQ/address text in `document.body.innerText`, and requires computed base-image opacity `0` after normal load plus fallback/error class toggles.

- [ ] **Step 2: Run canonical desktop/mobile E2E projects and confirm RED if any integration remains missing**

Run: `npx playwright test --project=desktop-1440 --project=mobile-390`

Expected before final integration: at least one new assertion FAILS; record the exact missing behavior.

- [ ] **Step 3: Make the minimal markup/style adjustment required by the failing behavior**

Change only the responsible renderer or CSS rule. Do not loosen canvas completeness, privacy, asset, or opacity thresholds.

- [ ] **Step 4: Run all unit tests**

Run: `npm test`

Expected: all Vitest tests PASS with zero failures.

- [ ] **Step 5: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite complete with exit code 0.

- [ ] **Step 6: Run the full six-project Playwright matrix**

Run: `npm run test:e2e`

Expected: all Playwright tests PASS across desktop-1440, desktop-1920, mobile-390, mobile-430, mobile-320, and mobile-landscape-667; required screenshots are written to `output/playwright/`.

- [ ] **Step 7: Inspect the four required screenshots**

Open:

```text
output/playwright/desktop-1440-final.png
output/playwright/desktop-1920-final.png
output/playwright/mobile-390-final.png
output/playwright/mobile-430-final.png
```

Confirm no photographic underlay, a recognizable particle face, readable section hierarchy, sharp project images, no clipped content, and no horizontal overflow. If any defect is found, add a failing regression test where practical before changing CSS.

- [ ] **Step 8: Commit verified integration**

```bash
git add tests/homepage.spec.ts scripts/clean-e2e-output.mjs output/playwright
git commit -m "test: verify complete portfolio experience"
```

### Task 7: Deploy and verify production

**Files:**
- Modify: `.vercel/production-url.txt` only if Vercel updates it automatically

- [ ] **Step 1: Confirm the worktree is intentional and clean enough to deploy**

Run: `git status --short && git log -7 --oneline`

Expected: only intentional generated deployment metadata may remain uncommitted; all source/content/asset changes are committed.

- [ ] **Step 2: Deploy to the existing production project**

Run: `npx vercel deploy --prod --yes`

Expected: exit code 0 and production alias remains `https://portfolioweb-two-rho.vercel.app`.

- [ ] **Step 3: Verify the live document and assets**

Run a Playwright production smoke test against the alias that checks HTTP 200, hero Canvas completeness, base-image opacity `0`, six project images, two document downloads, Gmail contact, privacy exclusions, and zero console/page/request errors.

- [ ] **Step 4: Report evidence**

Record the fresh Vitest count, Playwright count, build exit status, deployment URL, and screenshot paths. Do not claim completion without those outputs.
