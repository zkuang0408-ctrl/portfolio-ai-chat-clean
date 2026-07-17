# Inline PDF Project Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the six project preview images with complete, lazy-loaded, in-card PDF readers using the approved chevrons, page counters, keyboard controls, swipe controls, and production-safe fallbacks.

**Architecture:** Copy the six source PDFs to stable public URLs and use a locally bundled PDF.js display layer plus worker. Keep PDF.js behind a small runtime adapter, keep navigation math in pure helpers, and let one controller instance own each reader's document, render task, current page, errors, resize behavior, and input listeners. Initialize controllers through IntersectionObserver so the homepage does not fetch all PDFs during its initial hero load.

**Tech Stack:** TypeScript, Vite 8, Vitest/JSDOM, pdfjs-dist 6.1.200, Canvas 2D, IntersectionObserver, ResizeObserver, Playwright, Vercel static deployment.

---

## File map

- Modify **package.json** and **package-lock.json**: add the pinned PDF.js dependency.
- Create **public/projects/pdfs/*.pdf**: stable public copies of all six source documents.
- Modify **src/content/portfolio.ts** and its test: approved order and PDF metadata.
- Modify **src/public-assets.test.ts**: require all six PDFs and validate their signatures.
- Create **src/portfolio/pdf-runtime.ts** and its test: worker setup and document loader.
- Create **src/portfolio/pdf-reader-state.ts** and its test: pure page and swipe rules.
- Modify **src/portfolio/render-portfolio.ts** and its test: reader DOM and approved chevrons.
- Create **src/portfolio/pdf-reader.ts** and its test: loading, rendering, navigation, retry, input, and resize.
- Modify **src/main.ts**, **src/styles.css**, and their tests: integration and approved visuals.
- Modify **tests/homepage.spec.ts**: real PDF browser behavior and screenshots.
- Modify **vercel.json** and its test: project-PDF cache policy.

### Task 1: Ship the complete PDFs and approved metadata

**Files:**
- Create: **public/projects/pdfs/inkseat.pdf**
- Create: **public/projects/pdfs/emovue.pdf**
- Create: **public/projects/pdfs/fruit-evolution.pdf**
- Create: **public/projects/pdfs/atempo.pdf**
- Create: **public/projects/pdfs/urosense.pdf**
- Create: **public/projects/pdfs/first-fly.pdf**
- Modify: **src/content/portfolio.ts**
- Modify: **src/content/portfolio.test.ts**
- Modify: **src/public-assets.test.ts**

- [ ] **Step 1: Write the failing metadata test**

~~~ts
expect(projects.map(({ id }) => id)).toEqual([
  "inkseat",
  "emovue",
  "evolution-fruit",
  "atempo",
  "urosense",
  "first-fly",
]);

expect(projects.map(({ pdf }) => [pdf.href, pdf.pageCount])).toEqual([
  ["/projects/pdfs/inkseat.pdf", 18],
  ["/projects/pdfs/emovue.pdf", 19],
  ["/projects/pdfs/fruit-evolution.pdf", 25],
  ["/projects/pdfs/atempo.pdf", 20],
  ["/projects/pdfs/urosense.pdf", 25],
  ["/projects/pdfs/first-fly.pdf", 28],
]);
~~~

Replace the old project PNG entries in public-assets.test.ts with those six PDF paths and assert every file begins with %PDF.

- [ ] **Step 2: Run focused tests and verify RED**

~~~powershell
npm.cmd test -- src/content/portfolio.test.ts src/public-assets.test.ts
~~~

Expected: FAIL because Project.pdf and the copied files do not exist and the order is still old.

- [ ] **Step 3: Copy the six binaries without conversion**

~~~powershell
New-Item -ItemType Directory -Force public/projects/pdfs | Out-Null
Copy-Item -LiteralPath 'E:\codex\zupingji\1\inkseat.pdf' public/projects/pdfs/inkseat.pdf
Copy-Item -LiteralPath 'E:\codex\zupingji\1\EMOVUE.pdf' public/projects/pdfs/emovue.pdf
Copy-Item -LiteralPath 'E:\codex\zupingji\1\演化果实.pdf' public/projects/pdfs/fruit-evolution.pdf
Copy-Item -LiteralPath 'E:\codex\zupingji\1\交互.pdf' public/projects/pdfs/atempo.pdf
Copy-Item -LiteralPath 'E:\codex\zupingji\1\医院心内科病房场景下的智能尿量检测附件.pdf' public/projects/pdfs/urosense.pdf
Copy-Item -LiteralPath 'E:\codex\zupingji\1\第一飞行.pdf' public/projects/pdfs/first-fly.pdf
~~~

- [ ] **Step 4: Replace image metadata with PDF metadata**

~~~ts
export interface ProjectPdf {
  href: string;
  pageCount: number;
  title: string;
}

export interface Project {
  id: string;
  number: string;
  title: string;
  type: string;
  summary: string;
  role: string;
  tags: readonly string[];
  pdf: ProjectPdf;
}
~~~

Populate all six records and reorder them exactly as Step 1. Keep existing summaries, roles, tags, and IDs.

- [ ] **Step 5: Verify page counts and GREEN**

Run the focused tests. Use the bundled Poppler pdfinfo.exe to verify the copied documents contain 18, 19, 25, 20, 25, and 28 pages in approved order.

~~~powershell
npm.cmd test -- src/content/portfolio.test.ts src/public-assets.test.ts
~~~

Expected: PASS.

- [ ] **Step 6: Commit**

~~~powershell
git add public/projects/pdfs src/content/portfolio.ts src/content/portfolio.test.ts src/public-assets.test.ts
git commit -m "feat: add complete project PDF assets"
~~~

### Task 2: Add the local PDF.js runtime adapter

**Files:**
- Modify: **package.json**
- Modify: **package-lock.json**
- Create: **src/portfolio/pdf-runtime.ts**
- Create: **src/portfolio/pdf-runtime.test.ts**

- [ ] **Step 1: Install the pinned local dependency**

~~~powershell
npm.cmd install pdfjs-dist@6.1.200
~~~

Expected: pdfjs-dist appears under dependencies and no CDN is introduced.

- [ ] **Step 2: Write a failing adapter test**

~~~ts
const promise = Promise.resolve({ numPages: 18 });
const getDocument = vi.fn(() => ({ promise }));
const GlobalWorkerOptions = { workerSrc: "" };

vi.mock("pdfjs-dist", () => ({ getDocument, GlobalWorkerOptions }));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "/assets/pdf.worker.test.mjs",
}));

const { loadPdfDocument } = await import("./pdf-runtime");
await expect(loadPdfDocument("/projects/pdfs/inkseat.pdf")).resolves.toEqual({
  numPages: 18,
});
expect(getDocument).toHaveBeenCalledWith({
  url: "/projects/pdfs/inkseat.pdf",
});
expect(GlobalWorkerOptions.workerSrc).toBe("/assets/pdf.worker.test.mjs");
~~~

- [ ] **Step 3: Run the test and verify RED**

~~~powershell
npm.cmd test -- src/portfolio/pdf-runtime.test.ts
~~~

Expected: FAIL because the adapter does not exist.

- [ ] **Step 4: Implement the adapter**

~~~ts
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export type ProjectPdfDocument = PDFDocumentProxy;

export async function loadPdfDocument(url: string): Promise<PDFDocumentProxy> {
  return getDocument({ url }).promise;
}
~~~

- [ ] **Step 5: Verify GREEN and the production worker**

~~~powershell
npm.cmd test -- src/portfolio/pdf-runtime.test.ts
npm.cmd run build
~~~

Expected: test PASS and Vite emits a hashed PDF worker asset.

- [ ] **Step 6: Commit**

~~~powershell
git add package.json package-lock.json src/portfolio/pdf-runtime.ts src/portfolio/pdf-runtime.test.ts
git commit -m "feat: bundle local PDF.js runtime"
~~~

### Task 3: Implement pure navigation and swipe rules

**Files:**
- Create: **src/portfolio/pdf-reader-state.ts**
- Create: **src/portfolio/pdf-reader-state.test.ts**

- [ ] **Step 1: Write failing tests**

~~~ts
expect(boundPage(0, 18)).toBe(1);
expect(boundPage(19, 18)).toBe(18);
expect(boundPage(7, 18)).toBe(7);
expect(pageCounter(1, 18)).toEqual({ current: "01", total: "18" });
expect(pageCounter(7, 9)).toEqual({ current: "07", total: "09" });
expect(pageBoundary(1, 18)).toEqual({
  canGoPrevious: false,
  canGoNext: true,
});
expect(pageBoundary(18, 18)).toEqual({
  canGoPrevious: true,
  canGoNext: false,
});
expect(swipeDirection({ deltaX: -80, deltaY: 12 })).toBe("next");
expect(swipeDirection({ deltaX: 80, deltaY: 12 })).toBe("previous");
expect(swipeDirection({ deltaX: 20, deltaY: 65 })).toBeNull();
~~~

- [ ] **Step 2: Run the test and verify RED**

~~~powershell
npm.cmd test -- src/portfolio/pdf-reader-state.test.ts
~~~

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement the complete helper module**

~~~ts
export type PageDirection = "previous" | "next";

export function boundPage(page: number, totalPages: number): number {
  const safeTotal = Math.max(1, Math.floor(totalPages));
  const safePage = Number.isFinite(page) ? Math.floor(page) : 1;
  return Math.min(safeTotal, Math.max(1, safePage));
}

function padPage(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(2, "0");
}

export function pageCounter(currentPage: number, totalPages: number) {
  return {
    current: padPage(boundPage(currentPage, totalPages)),
    total: padPage(Math.max(1, Math.floor(totalPages))),
  };
}

export function pageBoundary(currentPage: number, totalPages: number) {
  const current = boundPage(currentPage, totalPages);
  const total = Math.max(1, Math.floor(totalPages));
  return {
    canGoPrevious: current > 1,
    canGoNext: current < total,
  };
}

export function swipeDirection(input: {
  deltaX: number;
  deltaY: number;
}): PageDirection | null {
  if (
    Math.abs(input.deltaX) < 44 ||
    Math.abs(input.deltaX) <= Math.abs(input.deltaY) * 1.25
  ) {
    return null;
  }
  return input.deltaX < 0 ? "next" : "previous";
}
~~~

- [ ] **Step 4: Verify GREEN and commit**

~~~powershell
npm.cmd test -- src/portfolio/pdf-reader-state.test.ts
git add src/portfolio/pdf-reader-state.ts src/portfolio/pdf-reader-state.test.ts
git commit -m "feat: define PDF reader navigation rules"
~~~

### Task 4: Render accessible reader markup

**Files:**
- Modify: **src/portfolio/render-portfolio.ts**
- Modify: **src/portfolio/render-portfolio.test.ts**

- [ ] **Step 1: Replace image assertions with failing reader assertions**

~~~ts
const readers = root.querySelectorAll<HTMLElement>("[data-project-reader]");
expect(readers).toHaveLength(6);
expect(root.querySelectorAll("#projects .project-media img")).toHaveLength(0);

const first = readers[0];
expect(first?.dataset.pdfUrl).toBe("/projects/pdfs/inkseat.pdf");
expect(first?.dataset.expectedPages).toBe("18");
expect(first?.querySelectorAll("canvas")).toHaveLength(1);
expect(first?.querySelectorAll("button[data-page-action]")).toHaveLength(2);
expect(first?.querySelector("[data-current-page]")?.textContent).toBe("01");
expect(first?.querySelector("[data-total-pages]")?.textContent).toBe("18");
expect(first?.querySelector("svg polyline")?.getAttribute("points")).toBe(
  "25,9 3,35 25,61",
);
~~~

Also assert the retry button, original-PDF link, polite status region, and project-specific button labels.

- [ ] **Step 2: Run the test and verify RED**

~~~powershell
npm.cmd test -- src/portfolio/render-portfolio.test.ts
~~~

Expected: FAIL because project cards still render images.

- [ ] **Step 3: Implement reader markup**

Create renderProjectReader(project). It must emit:

~~~html
<figure
  class="project-reader"
  data-project-reader
  data-pdf-url="..."
  data-expected-pages="18"
  data-project-title="INKSeat"
  tabindex="0"
  role="group"
  aria-label="INKSeat complete PDF"
>
  <div class="project-reader-stage" data-reader-stage>
    <canvas data-pdf-canvas aria-label="INKSeat complete project PDF"></canvas>
    <p data-reader-status aria-live="polite">Loading project</p>
    <div data-reader-error hidden>
      <p>Unable to load this project.</p>
      <button type="button" data-reader-retry>Retry</button>
      <a href="..." target="_blank" rel="noopener">Open original PDF</a>
    </div>
    <button type="button" data-page-action="previous" aria-label="Previous page of INKSeat">
      <svg viewBox="0 0 40 70" aria-hidden="true">
        <polyline points="25,9 3,35 25,61"></polyline>
      </svg>
    </button>
    <button type="button" data-page-action="next" aria-label="Next page of INKSeat">
      <svg viewBox="0 0 40 70" aria-hidden="true">
        <polyline points="15,9 37,35 15,61"></polyline>
      </svg>
    </button>
  </div>
  <figcaption>
    <strong data-current-page>01</strong>
    <span> / </span>
    <span data-total-pages>18</span>
  </figcaption>
</figure>
~~~

Generate project-specific strings from metadata. Keep project copy and alternating card order unchanged.

- [ ] **Step 4: Verify GREEN and commit**

~~~powershell
npm.cmd test -- src/portfolio/render-portfolio.test.ts src/content/portfolio.test.ts
git add src/portfolio/render-portfolio.ts src/portfolio/render-portfolio.test.ts
git commit -m "feat: render inline project PDF readers"
~~~

### Task 5: Implement lazy loading and current-page rendering

**Files:**
- Create: **src/portfolio/pdf-reader.ts**
- Create: **src/portfolio/pdf-reader.test.ts**

- [ ] **Step 1: Write failing controller tests with fake documents**

~~~ts
const render = vi.fn(() => ({
  cancel: vi.fn(),
  promise: Promise.resolve(),
}));
const getPage = vi.fn(async () => ({
  getViewport: ({ scale }: { scale: number }) => ({
    width: 960 * scale,
    height: 540 * scale,
  }),
  render,
}));
const loadDocument = vi.fn(async () => ({ numPages: 18, getPage }));

const reader = createPdfReader(root, {
  loadDocument,
  measureWidth: () => 960,
  outputScale: () => 2,
  requestFrame: (callback) => callback(0),
  reducedMotion: () => false,
});

expect(loadDocument).not.toHaveBeenCalled();
await reader.initialize();
expect(loadDocument).toHaveBeenCalledWith("/projects/pdfs/inkseat.pdf");
expect(getPage).toHaveBeenCalledWith(1);
expect(root.dataset.readerState).toBe("ready");
expect(root.querySelector("[data-current-page]")?.textContent).toBe("01");
~~~

Mock canvas getContext and assert a 960 CSS-pixel page creates a 1920 by 1080 backing store at output scale 2.

- [ ] **Step 2: Run the test and verify RED**

~~~powershell
npm.cmd test -- src/portfolio/pdf-reader.test.ts
~~~

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Define controller interfaces**

~~~ts
export interface PdfRenderTaskLike {
  cancel(): void;
  promise: Promise<unknown>;
}

export interface PdfPageLike {
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
    transform?: number[];
  }): PdfRenderTaskLike;
}

export interface PdfDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
}

export interface PdfReaderDependencies {
  loadDocument(url: string): Promise<PdfDocumentLike>;
  measureWidth(stage: HTMLElement): number;
  outputScale(): number;
  requestFrame(callback: FrameRequestCallback): number;
  reducedMotion(): boolean;
}
~~~

Export createPdfReader with initialize, goTo, resize, retry, and destroy methods.

- [ ] **Step 4: Implement generation-safe rendering**

Keep document, current page, generation number, and active render task in closure state. Initialization sets loading, loads the document, validates numPages against the configured count, and renders page 1.

For each render:

~~~ts
const base = page.getViewport({ scale: 1 });
const cssWidth = Math.max(1, dependencies.measureWidth(stage));
const cssScale = cssWidth / base.width;
const viewport = page.getViewport({ scale: cssScale });
const outputScale = Math.min(2, Math.max(1, dependencies.outputScale()));

canvas.width = Math.floor(viewport.width * outputScale);
canvas.height = Math.floor(viewport.height * outputScale);
canvas.style.width = Math.floor(viewport.width) + "px";
canvas.style.height = Math.floor(viewport.height) + "px";
~~~

Cancel active work before starting a new render. Commit the page number and UI only when the generation is still current. Use the output-scale transform when scale differs from 1.

- [ ] **Step 5: Add adjacent-page prefetch and verify GREEN**

After a successful page commit, call document.getPage for in-range previous and next pages without rendering them. Ignore prefetch rejection without changing visible state.

~~~powershell
npm.cmd test -- src/portfolio/pdf-reader.test.ts
~~~

Expected: PASS.

- [ ] **Step 6: Commit**

~~~powershell
git add src/portfolio/pdf-reader.ts src/portfolio/pdf-reader.test.ts
git commit -m "feat: load and render project PDF pages"
~~~

### Task 6: Add complete reader interaction and failure isolation

**Files:**
- Modify: **src/portfolio/pdf-reader.ts**
- Modify: **src/portfolio/pdf-reader.test.ts**

- [ ] **Step 1: Write failing interaction tests**

Test all of these independently:

- clicking next changes 01 to 02;
- page 1 previous and page 18 next are disabled;
- focused ArrowLeft and ArrowRight navigate only that reader;
- a second navigation cancels an unresolved first render;
- a rejected document load exposes retry and original-PDF fallback;
- retry loads only that failed reader;
- horizontal pointer swipe moves one page;
- vertical pointer movement does not navigate;
- resize renders the same page at a new width;
- reduced motion skips transition classes;
- destroy removes listeners and cancels active work.

- [ ] **Step 2: Run tests and verify RED**

~~~powershell
npm.cmd test -- src/portfolio/pdf-reader.test.ts
~~~

Expected: FAIL on the unimplemented input, retry, resize, cancellation, or cleanup behavior.

- [ ] **Step 3: Implement bounded controls and retry**

Use pageBoundary after every successful page commit. Keep both controls in place; update disabled and aria-disabled instead of removing them.

On failure:

~~~ts
root.dataset.readerState = "error";
errorRegion.hidden = false;
status.textContent = "Project unavailable";
~~~

Retry clears only this reader's error, document, and active task, then initializes it again.

- [ ] **Step 4: Implement keyboard and touch input**

Attach keydown to the focusable reader. Prevent default only when a Left or Right Arrow actually navigates.

Track pointerdown coordinates for touch or pen. On pointerup, call swipeDirection. Do not prevent default on vertical gestures.

- [ ] **Step 5: Add resize and the lazy manager**

Export startProjectReaders(root, dependencies). Create one controller per reader. Observe them with IntersectionObserver and rootMargin 600px 0px; initialize once on intersection and unobserve. If IntersectionObserver is unavailable, initialize immediately.

Use ResizeObserver for initialized readers, coalesced through requestAnimationFrame. Return a cleanup function that disconnects observers and destroys controllers.

- [ ] **Step 6: Verify GREEN and commit**

~~~powershell
npm.cmd test -- src/portfolio/pdf-reader.test.ts src/portfolio/pdf-reader-state.test.ts
git add src/portfolio/pdf-reader.ts src/portfolio/pdf-reader.test.ts
git commit -m "feat: add complete PDF reader interaction"
~~~

### Task 7: Wire readers into the app and apply approved styling

**Files:**
- Modify: **src/main.ts**
- Modify: **src/main.test.ts**
- Modify: **src/styles.css**
- Modify: **src/styles.test.ts**

- [ ] **Step 1: Write failing wiring and style tests**

Mock loadPdfDocument and startProjectReaders in main.test.ts. Assert the manager receives portfolioRoot after renderPortfolio.

Update the editorial selector test to require .project-reader instead of .project-media. Add:

~~~ts
expect(styles).toMatch(
  /\.project-reader-chevron\s*\{[\s\S]*?background:\s*transparent;/,
);
expect(styles).toMatch(
  /\.project-reader-chevron polyline\s*\{[\s\S]*?stroke-width:\s*2;/,
);
expect(styles).not.toMatch(/\.project-reader-chevron[\s\S]*?backdrop-filter/);
~~~

- [ ] **Step 2: Run focused tests and verify RED**

~~~powershell
npm.cmd test -- src/main.test.ts src/styles.test.ts
~~~

Expected: FAIL because the manager and styles are not integrated.

- [ ] **Step 3: Wire runtime dependencies in main.ts**

~~~ts
const stopReaders = startProjectReaders(portfolioRoot, {
  loadDocument: loadPdfDocument,
  measureWidth: (stage) => stage.clientWidth,
  outputScale: () => window.devicePixelRatio || 1,
  requestFrame: window.requestAnimationFrame.bind(window),
  reducedMotion: () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
});

window.addEventListener("pagehide", stopReaders, { once: true });
~~~

Import startProjectReaders and loadPdfDocument. Keep particle startup unchanged.

- [ ] **Step 4: Implement the approved visual system**

Keep alternating project grid ratios. Add:

- 16:9 clipped reader stage;
- canvas filling the stage;
- quiet loading and isolated error overlays;
- desktop chevron visual area 40 by 66 px;
- SVG stroke width 2 px and default opacity 0.58;
- transparent controls with no circle, border, shadow, or backdrop blur;
- one-pixel button inset, placing SVG tips about 4 px inside the page;
- centered page counter below the stage;
- disabled, hover, focus, loading, ready, error, and transition states;
- mobile visual size 36 by 60 px with at least a 44 px pointer target;
- no page crossfade under reduced motion.

- [ ] **Step 5: Verify unit suites and build**

~~~powershell
npm.cmd test -- src/main.test.ts src/styles.test.ts src/portfolio
npm.cmd test
npm.cmd run build
~~~

Expected: all tests PASS and Vite emits the app, PDF worker, and six PDFs.

- [ ] **Step 6: Commit**

~~~powershell
git add src/main.ts src/main.test.ts src/styles.css src/styles.test.ts
git commit -m "feat: integrate responsive project PDF readers"
~~~

### Task 8: Add production headers and browser coverage

**Files:**
- Modify: **vercel.json**
- Modify: **src/vercel-config.test.ts**
- Modify: **tests/homepage.spec.ts**

- [ ] **Step 1: Write failing Vercel and E2E expectations**

Require this PDF header rule:

~~~json
{
  "source": "/projects/pdfs/(.*)",
  "headers": [
    {
      "key": "Cache-Control",
      "value": "public, max-age=3600, s-maxage=31536000"
    }
  ]
}
~~~

Replace six-image Playwright assertions with six readers and totals:

~~~ts
await expect(page.locator("[data-project-reader]")).toHaveCount(6);
await expect(page.locator("[data-total-pages]")).toHaveText([
  "18",
  "19",
  "25",
  "20",
  "25",
  "28",
]);
~~~

Track requests ending in .pdf. After hero and About load, expect no project PDF request. Scroll INKSeat near the viewport, wait for ready, and expect only inkseat.pdf.

- [ ] **Step 2: Run tests and verify RED**

~~~powershell
npm.cmd test -- src/vercel-config.test.ts
npm.cmd run test:e2e -- --project=desktop-1440
~~~

Expected: FAIL because config and E2E still describe project images.

- [ ] **Step 3: Add desktop reader interaction tests**

For INKSeat:

- assert 01 / 18;
- click next and assert 02 / 18;
- focus, press Right, and assert 03 / 18;
- press Left and assert 02 / 18;
- navigate to page 18 and assert next disabled;
- verify page 1 previous disabled in a fresh context.

Abort one PDF route in a dedicated test. Assert that reader exposes retry and the original link while another reader reaches ready.

- [ ] **Step 4: Add mobile swipe and screenshot coverage**

On mobile-390, dispatch a horizontal pointer gesture and assert the counter increments. Dispatch a mostly vertical gesture and assert no change.

Before full-page screenshots, scroll each reader into range and wait until all six first pages are ready. Continue producing the four existing final screenshots.

- [ ] **Step 5: Run full E2E and commit**

~~~powershell
npm.cmd test -- src/vercel-config.test.ts
npm.cmd run test:e2e
git add vercel.json src/vercel-config.test.ts tests/homepage.spec.ts
git commit -m "test: verify complete project PDF experience"
~~~

Expected: all configured projects pass with no page error, console error, failed request, or HTTP response at or above 400.

### Task 9: PDF visual QA, completion verification, and deployment

**Files:**
- Verify: **public/projects/pdfs/*.pdf**
- Verify: **output/playwright/*-final.png**
- Temporary: **tmp/pdfs/**

- [ ] **Step 1: Render representative PDF pages**

Use Poppler to render these first, middle, and final pages at 120 DPI:

- INKSeat: 1, 9, 18
- EMOVUE: 1, 10, 19
- Fruit & Evolution: 1, 13, 25
- Atempo: 1, 10, 20
- UroSense: 1, 13, 25
- First Fly: 1, 14, 28

Store them under tmp/pdfs/project-name for inspection only.

- [ ] **Step 2: Inspect all 18 images**

Open every render at original detail. Verify orientation, complete edges, readable type, no black substitute glyphs, no missing imagery, and no clipping. Report a source-PDF defect by exact project and page rather than altering the document.

- [ ] **Step 3: Run fresh completion verification**

~~~powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
git status --short
~~~

Expected: all unit tests pass, the production build succeeds, full E2E passes, and the worktree is clean.

- [ ] **Step 4: Inspect final desktop and mobile screenshots**

Verify alternating card rhythm, readable first pages, accurate counters, approved 100-degree chevrons, 2 px strokes, no control backgrounds, and no horizontal overflow.

- [ ] **Step 5: Deploy and smoke-test the public alias**

~~~powershell
npx.cmd vercel deploy --prod --yes
~~~

Verify https://portfolioweb-two-rho.vercel.app:

- homepage HTTP 200;
- particle portrait still completes and becomes still;
- six readers show authoritative totals;
- six PDFs and hashed PDF worker return HTTP 200;
- INKSeat navigates from page 1 to 18;
- a mobile swipe advances one page;
- complete portfolio PDF/PPTX downloads remain HTTP 200;
- no initial page error, console error, request failure, or privacy regression.

- [ ] **Step 6: Remove temporary renders and preserve the branch**

Resolve tmp/pdfs and confirm it is inside the repository before deletion. Preserve feature/particle-homepage because this repository has no main/master branch and no configured remote.

