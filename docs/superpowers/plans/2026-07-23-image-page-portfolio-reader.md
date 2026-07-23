# Image Page Portfolio Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace browser-side whole-PDF rendering with complete, high-resolution, page-by-page WebP delivery while retaining navigation, counters, source jumps, and original PDF downloads.

**Architecture:** Generate deterministic 960px and 1800px WebP assets locally from each committed PDF and verify them during every production build. The browser renders a responsive `<picture>`, loads only the requested page, and preloads only the next page.

**Tech Stack:** Python 3, PyMuPDF, Pillow, TypeScript, DOM APIs, Vitest, Playwright, Vite, Cloudflare Pages

---

### Task 1: Build a deterministic PDF-to-WebP asset generator

**Files:**
- Create: `tools/render_project_pages.py`
- Create: `tools/tests/test_render_project_pages.py`
- Modify: `tools/requirements.txt`
- Test: `tools/tests/test_render_project_pages.py`

- [ ] **Step 1: Add failing generator unit tests**

Create tests for content hashing, stable output paths, and manifest structure:

```py
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from tools.render_project_pages import asset_paths, render_projects, source_digest


class RenderProjectPagesTests(unittest.TestCase):
    def test_source_digest_uses_first_twelve_sha256_characters(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "sample.pdf"
            source.write_bytes(b"portfolio-pdf")
            expected = hashlib.sha256(b"portfolio-pdf").hexdigest()[:12]
            self.assertEqual(source_digest(source), expected)

    def test_asset_paths_include_project_hash_page_and_width(self):
        mobile, desktop = asset_paths("inkseat", "a1b2c3d4e5f6", 1)
        self.assertEqual(
            mobile.as_posix(),
            "projects/pages/inkseat/a1b2c3d4e5f6/01-960.webp",
        )
        self.assertEqual(
            desktop.as_posix(),
            "projects/pages/inkseat/a1b2c3d4e5f6/01-1800.webp",
        )
```

- [ ] **Step 2: Run and verify RED**

```powershell
python -m unittest tools.tests.test_render_project_pages -v
```

Expected: import failure because the generator does not exist.

- [ ] **Step 3: Implement generator helpers and rendering**

Implement:

```py
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
OUTPUT = PUBLIC / "projects" / "pages"
MANIFEST = ROOT / "src" / "portfolio" / "generated-project-pages.json"
WIDTHS = (960, 1800)
QUALITY = 88
PROJECTS = (
    ("inkseat", "inkseat.pdf"),
    ("emovue", "emovue.pdf"),
    ("evolution-fruit", "fruit-evolution.pdf"),
    ("atempo", "atempo.pdf"),
    ("urosense", "urosense.pdf"),
    ("first-fly", "first-fly.pdf"),
)


def source_digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def asset_paths(project_id: str, digest: str, page: int) -> tuple[Path, Path]:
    base = Path("projects") / "pages" / project_id / digest
    page_name = f"{page:02d}"
    return base / f"{page_name}-960.webp", base / f"{page_name}-1800.webp"


def render_page(page: fitz.Page, width: int, destination: Path) -> None:
    scale = width / page.rect.width
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=QUALITY, method=6)


def render_projects() -> dict:
    manifest_projects = []
    for project_id, filename in PROJECTS:
        source = PUBLIC / "projects" / "pdfs" / filename
        digest = source_digest(source)
        project_output = (OUTPUT / project_id).resolve()
        if OUTPUT.resolve() not in project_output.parents:
            raise RuntimeError(f"Unsafe output path: {project_output}")
        if project_output.exists():
            shutil.rmtree(project_output)

        pages = []
        with fitz.open(source) as document:
            for index, page in enumerate(document, start=1):
                relative_mobile, relative_desktop = asset_paths(project_id, digest, index)
                render_page(page, WIDTHS[0], PUBLIC / relative_mobile)
                render_page(page, WIDTHS[1], PUBLIC / relative_desktop)
                pages.append({
                    "page": index,
                    "mobile": f"/{relative_mobile.as_posix()}",
                    "desktop": f"/{relative_desktop.as_posix()}",
                })
        manifest_projects.append({
            "id": project_id,
            "source": f"/projects/pdfs/{filename}",
            "sourceHash": digest,
            "pageCount": len(pages),
            "pages": pages,
        })
    return {"version": 1, "projects": manifest_projects}


if __name__ == "__main__":
    manifest = render_projects()
    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
```

Add to `tools/requirements.txt`:

```text
Pillow>=11,<13
```

- [ ] **Step 4: Run tests and verify GREEN**

```powershell
python -m unittest tools.tests.test_render_project_pages -v
```

Expected: helper tests pass without rendering production PDFs.

- [ ] **Step 5: Commit generator code**

```powershell
git add tools/render_project_pages.py tools/tests/test_render_project_pages.py tools/requirements.txt
git commit -m "feat: add deterministic project page renderer"
```

### Task 2: Generate and verify all page assets

**Files:**
- Create: `public/projects/pages/**`
- Create: `src/portfolio/generated-project-pages.json`
- Create: `scripts/verify-project-page-assets.ts`
- Create: `scripts/verify-project-page-assets.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add a failing manifest verifier test**

Create a temporary manifest fixture with a missing page file and assert that verification rejects it:

```ts
// @vitest-environment node
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

import { verifyProjectPageAssets } from "./verify-project-page-assets";

test("rejects a manifest whose page asset is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "project-pages-"));
  const manifest = {
    version: 1,
    projects: [{
      id: "inkseat",
      source: "/projects/pdfs/inkseat.pdf",
      sourceHash: "a1b2c3d4e5f6",
      pageCount: 1,
      pages: [{
        page: 1,
        mobile: "/projects/pages/inkseat/a1b2c3d4e5f6/01-960.webp",
        desktop: "/projects/pages/inkseat/a1b2c3d4e5f6/01-1800.webp",
      }],
    }],
  };
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));

  await expect(
    verifyProjectPageAssets(manifest, root),
  ).rejects.toThrow(/missing page asset/i);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
& 'D:\APPS\claude\npm.cmd' test -- --run scripts/verify-project-page-assets.test.ts
```

Expected: FAIL because the verifier does not exist.

- [ ] **Step 3: Implement verification and build scripts**

Export:

```ts
export async function verifyProjectPageAssets(
  manifest: ProjectPageManifest,
  publicRoot: string,
): Promise<void>
```

The implementation must:

- require manifest version `1`;
- require exactly the six IDs in portfolio order;
- require `pages.length === pageCount`;
- require page numbers `1..pageCount` without gaps;
- require mobile paths ending `-960.webp`;
- require desktop paths ending `-1800.webp`;
- require every image file to exist and be non-empty;
- hash each source PDF and require it to start with `sourceHash`;
- require each manifest count to equal `projects[].pdf.pageCount`.

Keep the exported verifier import-safe. Put CLI execution behind an
`import.meta.url` direct-entry guard so Vitest can import
`verifyProjectPageAssets` without running production verification as a side
effect.

Add:

```json
{
  "scripts": {
    "portfolio-pages:generate": "python tools/render_project_pages.py",
    "portfolio-pages:verify": "tsx scripts/verify-project-page-assets.ts",
    "prebuild": "npm run knowledge:verify && npm run portfolio-pages:verify"
  }
}
```

- [ ] **Step 4: Install rendering dependency and generate assets**

```powershell
python -m pip install -r tools/requirements.txt
& 'D:\APPS\claude\npm.cmd' run portfolio-pages:generate
& 'D:\APPS\claude\npm.cmd' run portfolio-pages:verify
```

Expected: 135 PDF pages produce 270 WebP files; verification reports six projects and 135 pages.

- [ ] **Step 5: Run verifier tests**

```powershell
& 'D:\APPS\claude\npm.cmd' test -- --run scripts/verify-project-page-assets.test.ts
```

Expected: all verifier tests pass.

- [ ] **Step 6: Commit generated assets and verifier**

```powershell
git add public/projects/pages src/portfolio/generated-project-pages.json scripts/verify-project-page-assets.ts scripts/verify-project-page-assets.test.ts package.json package-lock.json
git commit -m "feat: generate complete responsive project pages"
```

### Task 3: Attach generated pages to portfolio content and markup

**Files:**
- Modify: `src/content/portfolio.ts`
- Modify: `src/portfolio/render-portfolio.ts`
- Modify: `src/portfolio/render-portfolio.test.ts`
- Test: `src/portfolio/render-portfolio.test.ts`

- [ ] **Step 1: Replace canvas expectations with responsive image expectations**

Assert:

```ts
expect(first?.querySelectorAll("canvas")).toHaveLength(0);
expect(first?.querySelectorAll("picture")).toHaveLength(1);
const image = first?.querySelector<HTMLImageElement>("[data-page-image]");
const mobile = first?.querySelector<HTMLSourceElement>(
  'source[media="(max-width: 760px)"]',
);
expect(image?.getAttribute("src")).toBe(projects[0]?.pdf.pages[0]?.desktop);
expect(image?.getAttribute("loading")).toBe("lazy");
expect(image?.getAttribute("decoding")).toBe("async");
expect(mobile?.getAttribute("srcset")).toBe(projects[0]?.pdf.pages[0]?.mobile);
expect(first?.querySelector("[data-open-original-pdf]")?.getAttribute("href"))
  .toBe("/projects/pdfs/inkseat.pdf");
```

- [ ] **Step 2: Run and verify RED**

```powershell
& 'D:\APPS\claude\npm.cmd' test -- --run src/portfolio/render-portfolio.test.ts
```

Expected: FAIL because readers still render canvas and page assets are not attached.

- [ ] **Step 3: Extend content types and render `<picture>`**

Add:

```ts
import generatedPages from "../portfolio/generated-project-pages.json";

export interface ProjectPageAsset {
  readonly page: number;
  readonly mobile: string;
  readonly desktop: string;
}

export interface ProjectPdf {
  href: string;
  pageCount: number;
  title: string;
  pages: readonly ProjectPageAsset[];
}

function pagesFor(projectId: string): readonly ProjectPageAsset[] {
  const entry = generatedPages.projects.find(({ id }) => id === projectId);
  if (!entry) throw new Error(`Missing generated pages for ${projectId}`);
  return entry.pages;
}
```

Attach `pages: pagesFor("<id>")` to every project PDF.

Replace the canvas in `renderProjectReader` with:

```html
<picture data-page-picture>
  <source
    data-page-mobile
    media="(max-width: 760px)"
    srcset="${project.pdf.pages[0]?.mobile}"
  />
  <img
    data-page-image
    src="${project.pdf.pages[0]?.desktop}"
    alt="${pdfTitle} — page 1 of ${expectedPages}"
    loading="lazy"
    decoding="async"
  />
</picture>
```

Add a persistent original link:

```html
<a
  data-open-original-pdf
  href="${pdfUrl}"
  target="_blank"
  rel="noopener"
>Open complete PDF</a>
```

- [ ] **Step 4: Run and verify GREEN**

```powershell
& 'D:\APPS\claude\npm.cmd' test -- --run src/portfolio/render-portfolio.test.ts
```

Expected: all render tests pass for six readers and 135 manifest pages.

- [ ] **Step 5: Commit**

```powershell
git add src/content/portfolio.ts src/portfolio/render-portfolio.ts src/portfolio/render-portfolio.test.ts
git commit -m "feat: render responsive project page images"
```

### Task 4: Replace PDF.js controller with an image-page controller

**Files:**
- Create: `src/portfolio/image-reader.ts`
- Create: `src/portfolio/image-reader.test.ts`
- Modify: `src/main.ts`
- Delete: `src/portfolio/pdf-reader.ts`
- Delete: `src/portfolio/pdf-reader.test.ts`
- Delete: `src/portfolio/pdf-runtime.ts`
- Delete: `src/portfolio/pdf-runtime.test.ts`
- Test: `src/portfolio/image-reader.test.ts`

- [ ] **Step 1: Add failing controller tests**

Cover:

```ts
test("loads only the requested page and preloads only its successor", async () => {
  const load = vi.fn(async () => undefined);
  const preload = vi.fn();
  const reader = createImageReader(createRoot(), { load, preload });

  await reader.goTo(2);

  expect(load).toHaveBeenCalledTimes(1);
  expect(load).toHaveBeenCalledWith(project.pages[1]);
  expect(preload).toHaveBeenCalledTimes(1);
  expect(preload).toHaveBeenCalledWith(project.pages[2]);
});

test("ignores a stale page load after a later navigation completes", async () => {
  const first = deferred<void>();
  const load = vi.fn()
    .mockImplementationOnce(() => first.promise)
    .mockResolvedValueOnce(undefined);
  const reader = createImageReader(createRoot(), { load, preload: vi.fn() });

  const pageTwo = reader.goTo(2);
  await reader.goTo(3);
  first.resolve();
  await pageTwo;

  expect(currentPage()).toBe("03");
  expect(visibleImage().src).toContain(project.pages[2]?.desktop);
});
```

Retain tests for boundaries, keyboard arrows, swipe, retry, source-navigation events, destruction, and page counters.

- [ ] **Step 2: Run and verify RED**

```powershell
& 'D:\APPS\claude\npm.cmd' test -- --run src/portfolio/image-reader.test.ts
```

Expected: FAIL because `createImageReader` does not exist.

- [ ] **Step 3: Implement the image reader API**

Use:

```ts
export interface ImageReaderDependencies {
  load(asset: ProjectPageAsset): Promise<void>;
  preload(asset: ProjectPageAsset): void;
  awaitVisibleImage(image: HTMLImageElement): Promise<void>;
  IntersectionObserver?: IntersectionObserverConstructor;
}

export interface ImageReader {
  initialize(): Promise<void>;
  goTo(pageNumber: number): Promise<void>;
  retry(): Promise<void>;
  destroy(): void;
}

function applyAsset(
  mobile: HTMLSourceElement,
  image: HTMLImageElement,
  asset: ProjectPageAsset,
  title: string,
  total: number,
): void {
  mobile.srcset = asset.mobile;
  image.src = asset.desktop;
  image.alt = `${title} — page ${asset.page} of ${total}`;
}
```

The controller must initialize the already-rendered first page by awaiting
`awaitVisibleImage(image)`; it must not call `load()` for page 1 and trigger a
duplicate request. For navigation, increment a generation, await
`load(asset)`, apply only the latest generation, update controls and counter,
then call `preload(nextAsset)` exactly once. Keep existing keyboard, pointer,
retry, intersection, and `OPEN_PROJECT_PAGE_EVENT` behavior.

In `main.ts`, create browser dependencies:

```ts
function loadProjectPage(asset: ProjectPageAsset): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const mobile = window.matchMedia("(max-width: 760px)").matches;
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Project page unavailable"));
    image.src = mobile ? asset.mobile : asset.desktop;
  });
}

function preloadProjectPage(asset: ProjectPageAsset): void {
  const image = new Image();
  const mobile = window.matchMedia("(max-width: 760px)").matches;
  image.src = mobile ? asset.mobile : asset.desktop;
}

function awaitVisibleImage(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0) {
    return image.decode?.().catch(() => undefined) ?? Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error("Project page unavailable")),
      { once: true },
    );
  });
}
```

Start `startProjectReaders` from `image-reader.ts` with these dependencies.

- [ ] **Step 4: Run and verify GREEN**

```powershell
& 'D:\APPS\claude\npm.cmd' test -- --run src/portfolio/image-reader.test.ts src/main.test.ts
```

Expected: image reader and bootstrap tests pass.

- [ ] **Step 5: Remove PDF runtime files and commit**

```powershell
git add src/main.ts src/portfolio/image-reader.ts src/portfolio/image-reader.test.ts
git rm src/portfolio/pdf-reader.ts src/portfolio/pdf-reader.test.ts src/portfolio/pdf-runtime.ts src/portfolio/pdf-runtime.test.ts
git commit -m "refactor: load portfolio pages as images"
```

### Task 5: Update styles, dependencies, and Cloudflare caching

**Files:**
- Modify: `src/styles.css`
- Modify: `src/styles.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `public/_headers`
- Modify: `src/production-delivery.test.ts`

- [ ] **Step 1: Add failing delivery and style tests**

Require `.project-reader picture` and `.project-reader [data-page-image]` to fill the 16:9 stage with `object-fit: contain`. Assert `pdfjs-dist` is absent from browser-facing `dependencies`, remains present in `devDependencies` for the knowledge-index build, and that no client entry imports `pdf-runtime` or `pdf-reader`. Assert `_headers` contains:

```text
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/projects/pages/*
  Cache-Control: public, max-age=31536000, immutable

/projects/pdfs/*
  Cache-Control: public, max-age=86400, s-maxage=31536000
```

- [ ] **Step 2: Run and verify RED**

```powershell
& 'D:\APPS\claude\npm.cmd' test -- --run src/styles.test.ts src/production-delivery.test.ts
```

Expected: FAIL because CSS targets canvas, PDF.js remains, and `_headers` is missing.

- [ ] **Step 3: Implement styles and cache rules**

Replace canvas selectors with:

```css
.project-reader picture,
.project-reader [data-page-image] {
  display: block;
  width: 100%;
  height: 100%;
}

.project-reader [data-page-image] {
  object-fit: contain;
  opacity: 0;
  transition: opacity 180ms ease;
}
```

Update state selectors to target `[data-page-image]`. Add `public/_headers` with the exact cache blocks plus the existing security headers from `vercel.json`.

Move PDF.js to development-only dependencies because
`scripts/build-knowledge-index.ts` still uses it to extract portfolio text:

```powershell
& 'D:\APPS\claude\npm.cmd' install --save-dev pdfjs-dist@6.1.200
```

- [ ] **Step 4: Run all verification**

```powershell
& 'D:\APPS\claude\npm.cmd' test
& 'D:\APPS\claude\npm.cmd' run build
```

Expected: all tests pass; the browser build output has no `pdf.worker` asset;
the knowledge-index verification still passes; page asset verification
reports six projects and 135 pages.

- [ ] **Step 5: Commit**

```powershell
git add src/styles.css src/styles.test.ts package.json package-lock.json public/_headers src/production-delivery.test.ts
git commit -m "perf: cache and display responsive project pages"
```

### Task 6: Browser performance acceptance and Cloudflare release

**Files:**
- Modify only if a verified browser defect requires a test-first correction

- [ ] **Step 1: Run local browser acceptance**

```powershell
& 'D:\APPS\claude\npm.cmd' run dev -- --host 127.0.0.1
```

Using Playwright at desktop and mobile widths, verify:

- homepage makes no `/projects/pdfs/*.pdf` request;
- no `pdf.worker` request occurs;
- entering a project loads its first responsive image;
- clicking next loads only page 2 and preloads only page 3;
- page counters, chevrons, keyboard, swipe, and AI citation navigation work;
- “Open complete PDF” still opens the original file.

- [ ] **Step 2: Push to GitHub**

```powershell
git push origin feature/portfolio-ai-chat-clean
```

Expected: Cloudflare automatically creates a successful production deployment.

- [ ] **Step 3: Verify production headers and network**

```powershell
$manifest = Get-Content -Raw 'src/portfolio/generated-project-pages.json' | ConvertFrom-Json
$hash = ($manifest.projects | Where-Object id -eq 'inkseat').sourceHash
curl.exe -I "https://portfolio-ai-chat-clean.pages.dev/projects/pages/inkseat/$hash/01-1800.webp"
curl.exe -I https://portfolio-ai-chat-clean.pages.dev/projects/pdfs/inkseat.pdf
```

Expected: image has one-year immutable caching; PDF has the configured cache policy.

- [ ] **Step 4: Inspect production in the browser**

Repeat the desktop and mobile network checks against the `pages.dev` URL and confirm readable text on representative first, middle, and final pages from all six projects.
