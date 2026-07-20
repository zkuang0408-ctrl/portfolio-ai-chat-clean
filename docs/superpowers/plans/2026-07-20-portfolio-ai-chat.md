# Portfolio AI Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public, evidence-grounded DeepSeek assistant to Zhao Shikuang's homepage that answers from the approved profile, sanitized resume, and six complete project PDFs, streams concise bilingual responses, and opens verified source pages in the existing PDF readers.

**Architecture:** Generate and commit a server-only local hybrid knowledge index from structured profile data and page-bounded PDF/OCR text, then verify source digests during every production build. A root Vercel Function validates and rate-limits requests, retrieves up to eight chunks through a replaceable `Retriever`, streams DeepSeek output through a replaceable `ChatProvider`, and emits only server-verified source records. The browser renders a frameless hero-integrated assistant, keeps ten conversation pairs in `sessionStorage`, and dispatches verified project/page navigation to the existing PDF reader controllers.

**Tech Stack:** TypeScript 7, Vite 8, Vitest/JSDOM, Playwright 1.61, PDF.js 6.1.200, Tesseract.js 7, `@napi-rs/canvas`, PyMuPDF tooling for one-time resume redaction, Vercel Web Handler Functions, Upstash Redis REST, DeepSeek Chat Completions SSE.

---

## Required references

- Approved design: `docs/superpowers/specs/2026-07-20-portfolio-ai-chat-design.md`
- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel Functions](https://vercel.com/docs/functions)
- [Vercel Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js)
- [Upstash Redis REST](https://upstash.com/docs/redis/features/restapi)
- [DeepSeek API quick start](https://api-docs.deepseek.com/)
- [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)
- [Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md)

## File map

### Content-authoring and generated knowledge

- Modify `.gitignore`: exclude private source documents, OCR caches, and PDF review output.
- Create `tools/requirements.txt`: pin the local PDF redaction dependency range.
- Create `tools/sanitize_resume.py`: create a truly redacted public resume derivative.
- Create `tools/tests/test_sanitize_resume.py`: prove redaction removes synthetic private contact content.
- Create `public/documents/zhao-shikuang-resume-public.pdf`: reviewed one-page public resume.
- Create `src/chat/knowledge/types.ts`: shared source, extracted-page, chunk, index, and citation types.
- Create `src/chat/knowledge/manifest.ts`: profile, sanitized resume, and six project sources.
- Create `src/chat/knowledge/pdf-extractor.ts`: per-page PDF.js text extraction with injected OCR fallback.
- Create `src/chat/knowledge/ocr.ts`: reusable Chinese/English Tesseract worker and PDF page renderer.
- Create `src/chat/knowledge/build-index.ts`: normalization, page-bounded chunking, search terms, privacy scan, and source digests.
- Create `scripts/build-knowledge-index.ts`: CLI wrapper for generation and verification.
- Create `src/chat/knowledge/generated-index.json`: committed server-only generated artifact.
- Create focused tests beside each knowledge module.

### Retrieval and server runtime

- Create `src/chat/retrieval/retriever.ts`: replaceable `Retriever` interface.
- Create `src/chat/retrieval/local-hybrid.ts`: BM25-style, CJK n-gram, alias, title, and tag scoring.
- Create `src/chat/server/chat-types.ts`: request, history, SSE, provider, and public error contracts.
- Create `src/chat/server/validation.ts`: same-origin and request-body validation.
- Create `src/chat/server/prompt.ts`: grounded bilingual prompt and citation mapping.
- Create `src/chat/server/citations.ts`: split-safe source-marker stripping and verification.
- Create `src/chat/server/rate-limit.ts`: HMAC visitor identity plus in-memory and Upstash stores.
- Create `src/chat/server/deepseek-provider.ts`: OpenAI-compatible DeepSeek SSE adapter.
- Create `src/chat/server/chat-handler.ts`: orchestration, retries, streaming events, and public errors.
- Create `src/chat/server/runtime.ts`: production dependency wiring and environment validation.
- Create `api/chat.ts`: Vercel Web Handler entry point.
- Create focused Node-environment Vitest tests for every server module.

### Browser integration

- Create `src/chat/content.ts`: localized labels and fixed four-question recommendation subset.
- Create `src/chat/render-chat.ts`: accessible frameless hero markup.
- Create `src/chat/session.ts`: validated ten-pair `sessionStorage` state.
- Create `src/chat/sse.ts`: browser SSE event parser.
- Create `src/chat/chat-controller.ts`: submission, streaming, errors, history, and cleanup.
- Create `src/chat/source-navigation.ts`: verified source-to-project/page navigation.
- Modify `src/hero/render-hero.ts`: add and return the chat mount point.
- Modify `src/portfolio/render-portfolio.ts`: add stable project IDs to reader roots.
- Modify `src/portfolio/pdf-reader.ts`: accept explicit project/page navigation without breaking lazy loading.
- Modify `src/main.ts`: start and clean up the chat controller.
- Modify `src/styles.css`: approved desktop position, frameless visual rules, mobile flow, accessibility, and reduced motion.
- Modify existing unit/browser tests and `tests/homepage.spec.ts`.

### Build and deployment

- Modify `package.json` and `package-lock.json`: dependencies and knowledge scripts.
- Modify `tsconfig.json`: type-check `api`, `scripts`, and server modules.
- Modify `vercel.json`: configure the chat function duration.
- Modify `src/vercel-config.test.ts`, `src/production-delivery.test.ts`, and `src/public-assets.test.ts`.
- Create `.env.example`: variable names only, never secrets.
- Create `docs/portfolio-ai-operations.md`: regeneration, privacy review, Vercel/Upstash setup, key rotation, and smoke checks.

### Task 1: Produce a privacy-safe public resume

**Files:**
- Modify: `.gitignore`
- Create: `tools/requirements.txt`
- Create: `tools/sanitize_resume.py`
- Create: `tools/tests/test_sanitize_resume.py`
- Create: `public/documents/zhao-shikuang-resume-public.pdf`
- Modify: `src/public-assets.test.ts`

- [ ] **Step 1: Write the failing sanitizer test with synthetic private data**

Use `unittest` and generate a one-page fixture with PyMuPDF. Do not put Zhao Shikuang's real private contact values in the new test.

~~~python
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
import fitz

from tools.sanitize_resume import sanitize_resume


class SanitizeResumeTest(unittest.TestCase):
    def test_removes_private_contact_region_and_keeps_public_email(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.pdf"
            output = root / "public.pdf"
            document = fitz.open()
            page = document.new_page(width=595, height=842)
            page.insert_text((24, 450), "CONTACT")
            page.insert_text((24, 490), "private@example.test")
            page.insert_text((24, 525), "+86 13800000000")
            page.insert_text((24, 560), "PRIVATE STREET ADDRESS")
            page.insert_text((190, 120), "PUBLIC EXPERIENCE")
            document.save(source)

            sanitize_resume(source, output, "public@example.test")

            sanitized = fitz.open(output)
            text = "\n".join(page.get_text() for page in sanitized)
            self.assertIn("public@example.test", text)
            self.assertIn("PUBLIC EXPERIENCE", text)
            self.assertNotIn("private@example.test", text)
            self.assertNotIn("13800000000", text)
            self.assertNotIn("PRIVATE STREET ADDRESS", text)


if __name__ == "__main__":
    unittest.main()
~~~

- [ ] **Step 2: Run the test and verify RED**

~~~powershell
python -m pip install -r tools/requirements.txt
python -m unittest tools.tests.test_sanitize_resume -v
~~~

Expected: FAIL because `tools.sanitize_resume` does not exist.

- [ ] **Step 3: Implement true PDF redaction, not a recoverable overlay**

`tools/requirements.txt`:

~~~text
PyMuPDF>=1.26,<2
~~~

`tools/sanitize_resume.py` must use PyMuPDF redaction annotations, apply pixel redaction to intersecting images, and then insert only the public contact block:

~~~python
from argparse import ArgumentParser
from pathlib import Path
import fitz

PRIVATE_CONTACT_RECT = fitz.Rect(0, 420, 160, 630)
SIDEBAR_GRAY = (0.23, 0.23, 0.23)


def sanitize_resume(source: Path, output: Path, public_email: str) -> None:
    document = fitz.open(source)
    if document.page_count != 1:
        raise ValueError("Expected a one-page A4 resume")
    page = document[0]
    page.add_redact_annot(PRIVATE_CONTACT_RECT, fill=SIDEBAR_GRAY)
    page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS)
    page.insert_text((22, 448), "CONTACT", fontsize=15, fontname="helv", color=(1, 1, 1))
    page.insert_text((22, 485), "Email:", fontsize=10, fontname="helv", color=(1, 1, 1))
    page.insert_text((22, 504), public_email, fontsize=10, fontname="helv", color=(1, 1, 1))
    output.parent.mkdir(parents=True, exist_ok=True)
    document.save(output, garbage=4, clean=True, deflate=True)


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--public-email", required=True)
    args = parser.parse_args()
    sanitize_resume(args.input, args.output, args.public_email)


if __name__ == "__main__":
    main()
~~~

- [ ] **Step 4: Run RED/GREEN and create the real derivative**

~~~powershell
python -m unittest tools.tests.test_sanitize_resume -v
python tools/sanitize_resume.py --input 'D:\edge浏览器下载\A4 (1).pdf' --output public/documents/zhao-shikuang-resume-public.pdf --public-email zkuang0408@gmail.com
~~~

Expected: unit test PASS and a one-page PDF is created. The original `A4 (1).pdf` remains outside the repository.

- [ ] **Step 5: Add privacy and asset checks, render, and inspect**

Add `tmp/pdfs/`, `tmp/tesseract-cache/`, and `knowledge/private-sources/` to `.gitignore`. Extend `src/public-assets.test.ts` to require the public resume PDF signature and forbid any file named `A4*.pdf` in tracked paths. Render the public PDF with bundled Poppler, inspect the PNG, and verify that only the public Gmail remains in the contact block.

~~~powershell
$pdfToPpm='C:\Users\Kuang\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe'
New-Item -ItemType Directory -Force tmp/pdfs | Out-Null
& $pdfToPpm -f 1 -singlefile -png -r 150 public/documents/zhao-shikuang-resume-public.pdf tmp/pdfs/resume-public-review
npm.cmd test -- src/public-assets.test.ts src/production-delivery.test.ts
git ls-files | Select-String -Pattern 'A4.*\.pdf|private-sources'
~~~

Expected: tests PASS and the tracked-file search returns no private resume.

- [ ] **Step 6: Commit**

~~~powershell
git add .gitignore tools public/documents/zhao-shikuang-resume-public.pdf src/public-assets.test.ts
git commit -m "feat: add privacy-safe public resume"
~~~

### Task 2: Install server, index-generation, and OCR dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`

- [ ] **Step 1: Add a failing dependency/config assertion**

Extend `src/production-delivery.test.ts` to assert that runtime dependencies contain `@upstash/redis` and `@vercel/functions`, dev dependencies contain `tsx`, `@napi-rs/canvas`, and `tesseract.js`, and `tsconfig.json` includes `api` and `scripts`.

- [ ] **Step 2: Run the test and verify RED**

~~~powershell
npm.cmd test -- src/production-delivery.test.ts
~~~

Expected: FAIL because the packages and TypeScript include paths are absent.

- [ ] **Step 3: Install the current verified packages**

~~~powershell
npm.cmd install @upstash/redis@1.38.0 @vercel/functions@3.7.5
npm.cmd install --save-dev tsx@4.23.1 @napi-rs/canvas@1.0.2 tesseract.js@7.0.0
~~~

Do not install an OpenAI SDK; the DeepSeek adapter uses `fetch` and its documented OpenAI-compatible HTTP/SSE format.

- [ ] **Step 4: Expand the TypeScript project**

Change the `include` array to:

~~~json
["src", "api", "scripts", "vite.config.ts", "vitest.config.ts", "playwright.config.ts", "tests"]
~~~

- [ ] **Step 5: Verify GREEN and commit**

~~~powershell
npm.cmd test -- src/production-delivery.test.ts
npm.cmd exec tsc -- --noEmit
git add package.json package-lock.json tsconfig.json src/production-delivery.test.ts
git commit -m "build: add portfolio chat tooling"
~~~

Expected: focused test and type-check PASS.

### Task 3: Define the knowledge manifest and server-only data contract

**Files:**
- Create: `src/chat/knowledge/types.ts`
- Create: `src/chat/knowledge/manifest.ts`
- Create: `src/chat/knowledge/manifest.test.ts`

- [ ] **Step 1: Write the failing manifest test**

~~~ts
// @vitest-environment node
import { expect, test } from "vitest";
import { knowledgeSources } from "./manifest";

test("covers the profile, sanitized resume, and six ordered project PDFs", () => {
  expect(knowledgeSources.map((source) => source.id)).toEqual([
    "profile",
    "resume",
    "inkseat",
    "emovue",
    "evolution-fruit",
    "atempo",
    "urosense",
    "first-fly",
  ]);
  expect(knowledgeSources[1]).toMatchObject({
    filePath: "public/documents/zhao-shikuang-resume-public.pdf",
    pageCount: 1,
    publicHref: "/documents/zhao-shikuang-resume-public.pdf",
  });
  expect(JSON.stringify(knowledgeSources)).toContain("赵实旷");
  expect(JSON.stringify(knowledgeSources)).not.toContain("A4 (1).pdf");
});
~~~

- [ ] **Step 2: Run the test and verify RED**

~~~powershell
npm.cmd test -- src/chat/knowledge/manifest.test.ts
~~~

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Define exact shared types**

~~~ts
export type KnowledgeSourceKind = "profile" | "resume" | "project-pdf";

export interface KnowledgeSource {
  id: string;
  kind: KnowledgeSourceKind;
  title: string;
  aliases: readonly string[];
  tags: readonly string[];
  filePath?: string;
  publicHref?: string;
  projectId?: string;
  pageCount?: number;
  structuredText?: string;
  visualPages?: readonly number[];
}

export interface ExtractedPage {
  page: number;
  text: string;
  method: "structured" | "pdf-text" | "ocr";
}

export interface KnowledgeChunk {
  id: string;
  sourceId: string;
  projectId?: string;
  title: string;
  page?: number;
  text: string;
  terms: readonly string[];
  aliases: readonly string[];
  tags: readonly string[];
  citationLabel: string;
  publicHref: string;
}

export interface GeneratedKnowledgeIndex {
  version: 1;
  sourceDigests: Record<string, string>;
  chunks: KnowledgeChunk[];
}
~~~

- [ ] **Step 4: Build the manifest from existing content metadata**

Import `profile` and `projects` from `src/content/portfolio.ts`. Construct structured profile text from the approved public fields only. Map the six existing `project.pdf.href` values to repository file paths. Set page counts to `1, 18, 19, 25, 20, 25, 28` for resume then projects. Never include phone, QQ email, street address, or the external resume path.

- [ ] **Step 5: Verify and commit**

~~~powershell
npm.cmd test -- src/chat/knowledge/manifest.test.ts src/content/portfolio.test.ts
git add src/chat/knowledge
git commit -m "feat: define portfolio knowledge sources"
~~~

Expected: PASS.

### Task 4: Extract page text with OCR fallback

**Files:**
- Create: `src/chat/knowledge/pdf-extractor.ts`
- Create: `src/chat/knowledge/pdf-extractor.test.ts`
- Create: `src/chat/knowledge/ocr.ts`

- [ ] **Step 1: Write failing extractor tests with injected PDF/OCR dependencies**

Test these exact cases:

~~~ts
test("keeps native page text when at least 40 normalized characters exist", async () => {
  const ocrPage = vi.fn();
  const pages = await extractPdfPages(fakeDocument(["a".repeat(40)]), ocrPage);
  expect(pages).toEqual([{ page: 1, text: "a".repeat(40), method: "pdf-text" }]);
  expect(ocrPage).not.toHaveBeenCalled();
});

test("uses OCR for a non-visual low-text page", async () => {
  const ocrPage = vi.fn().mockResolvedValue("识别后的中文与 English text");
  const pages = await extractPdfPages(fakeDocument([""]), ocrPage, new Set());
  expect(pages[0]).toMatchObject({ page: 1, method: "ocr" });
  expect(ocrPage).toHaveBeenCalledOnce();
});

test("does not OCR an allowlisted visual page", async () => {
  const ocrPage = vi.fn();
  const pages = await extractPdfPages(fakeDocument([""]), ocrPage, new Set([1]));
  expect(pages).toEqual([{ page: 1, text: "", method: "pdf-text" }]);
});
~~~

- [ ] **Step 2: Run the tests and verify RED**

~~~powershell
npm.cmd test -- src/chat/knowledge/pdf-extractor.test.ts
~~~

Expected: FAIL because the extractor does not exist.

- [ ] **Step 3: Implement dependency-injected page extraction**

Use `pdfjs-dist/legacy/build/pdf.mjs`, concatenate `TextItem.str` values, normalize whitespace, enforce the 40-character threshold, and call the injected `OcrPage` only when needed. Throw if the actual page count differs from the manifest.

~~~ts
export type OcrPage = (page: PDFPageProxy, pageNumber: number) => Promise<string>;

export async function extractPdfPages(
  document: PDFDocumentProxy,
  ocrPage: OcrPage,
  visualPages = new Set<number>(),
): Promise<ExtractedPage[]> {
  const result: ExtractedPage[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const nativeText = normalizeText(content.items.flatMap((item) =>
      "str" in item ? [item.str] : [],
    ).join(" "));
    if (normalizedLength(nativeText) >= 40 || visualPages.has(pageNumber)) {
      result.push({ page: pageNumber, text: nativeText, method: "pdf-text" });
      continue;
    }
    result.push({ page: pageNumber, text: normalizeText(await ocrPage(page, pageNumber)), method: "ocr" });
  }
  return result;
}
~~~

- [ ] **Step 4: Implement the reusable OCR adapter**

Create one `createWorker(["chi_sim", "eng"], 1, { cachePath: "tmp/tesseract-cache" })` per generation run. Render each low-text PDF page at scale `2` with `@napi-rs/canvas`, recognize its PNG buffer, and expose `terminate()` in a `finally` block. Do not initialize a worker during module import or unit tests.

- [ ] **Step 5: Verify and commit**

~~~powershell
npm.cmd test -- src/chat/knowledge/pdf-extractor.test.ts
git add src/chat/knowledge/pdf-extractor.ts src/chat/knowledge/pdf-extractor.test.ts src/chat/knowledge/ocr.ts
git commit -m "feat: extract PDF knowledge with OCR fallback"
~~~

Expected: PASS without starting a real OCR worker in tests.

### Task 5: Generate, privacy-scan, and verify the local index

**Files:**
- Create: `src/chat/knowledge/build-index.ts`
- Create: `src/chat/knowledge/build-index.test.ts`
- Create: `scripts/build-knowledge-index.ts`
- Create: `src/chat/knowledge/generated-index.json`
- Modify: `package.json`
- Modify: `src/production-delivery.test.ts`

- [ ] **Step 1: Write failing pure generator tests**

Cover page-bounded chunks, stable IDs, SHA-256 source digests, Chinese bigrams, English terms, exact public viewer targets, duplicate IDs, empty required sources, and privacy rejection. Use synthetic contact data, not Zhao Shikuang's real private values.

~~~ts
expect(buildTerms("智能交互 AI Product")).toEqual(
  expect.arrayContaining(["智能", "能交", "交互", "ai", "product"]),
);
expect(chunks.every((chunk) => !chunk.text.includes("PRIVATE_ADDRESS"))).toBe(true);
expect(() => assertPrivacySafe("phone: +86 13800000000")).toThrow(
  "Private contact data detected",
);
~~~

- [ ] **Step 2: Run the test and verify RED**

~~~powershell
npm.cmd test -- src/chat/knowledge/build-index.test.ts
~~~

Expected: FAIL because the generator does not exist.

- [ ] **Step 3: Implement generation and verification modes**

The CLI accepts exactly `--generate` or `--verify`.

- `--generate`: read the manifest, extract/OCR pages, chunk within page boundaries, scan privacy, calculate file digests, write `generated-index.json` with stable key ordering.
- `--verify`: recalculate source digests, validate schema/page targets, and fail without OCR or rewriting the index.

Use chunk IDs like `${source.id}:p${page}:c${index}`. Limit chunk text to about 1,200 normalized characters with 150-character overlap, never crossing a page.

- [ ] **Step 4: Add scripts and generate the real index locally**

~~~json
{
  "knowledge:generate": "tsx scripts/build-knowledge-index.ts --generate",
  "knowledge:verify": "tsx scripts/build-knowledge-index.ts --verify",
  "prebuild": "npm run knowledge:verify"
}
~~~

Run:

~~~powershell
npm.cmd run knowledge:generate
npm.cmd run knowledge:verify
~~~

Expected: the index contains profile, sanitized resume, and all six project IDs; OCR is used for image-heavy INKSeat, Atempo, UroSense, and low-text pages in other documents. No private-contact scan failure occurs.

- [ ] **Step 5: Verify deterministic output and production guard**

Run generation twice while preserving the first file hash. Do not place a wall-clock generation timestamp in the artifact; unchanged sources must generate byte-identical output. Extend `src/production-delivery.test.ts` to assert that `build` invokes `prebuild` verification and the browser source tree never imports the generated index.

~~~powershell
npm.cmd test -- src/chat/knowledge/build-index.test.ts src/production-delivery.test.ts
npm.cmd run build
~~~

Expected: PASS.

- [ ] **Step 6: Commit**

~~~powershell
git add package.json package-lock.json scripts src/chat/knowledge/generated-index.json src/chat/knowledge/build-index.ts src/chat/knowledge/build-index.test.ts src/production-delivery.test.ts
git commit -m "feat: generate verified portfolio knowledge index"
~~~

### Task 6: Implement the replaceable local hybrid retriever

**Files:**
- Create: `src/chat/retrieval/retriever.ts`
- Create: `src/chat/retrieval/local-hybrid.ts`
- Create: `src/chat/retrieval/local-hybrid.test.ts`

- [ ] **Step 1: Write failing retrieval fixtures**

Use small in-memory chunks and assert:

- `ink seat` and `INKSeat` rank the INKSeat title first;
- `系统思考` boosts system/product tags;
- English questions can return Chinese source chunks through aliases;
- no source contributes more than three of eight results;
- unrelated questions return an empty array.

~~~ts
const retriever = createLocalHybridRetriever(fixtureIndex, {
  minimumScore: 2.5,
  maxResults: 8,
  maxPerSource: 3,
});
expect((await retriever.search("What problem does Inkseat solve?", { locale: "en" }))[0]?.sourceId).toBe("inkseat");
expect(await retriever.search("quantum tax law", { locale: "en" })).toEqual([]);
~~~

- [ ] **Step 2: Run and verify RED**

~~~powershell
npm.cmd test -- src/chat/retrieval/local-hybrid.test.ts
~~~

Expected: FAIL because the retriever does not exist.

- [ ] **Step 3: Define the stable retriever contract**

~~~ts
export interface SearchOptions {
  locale: "zh" | "en";
  limit?: number;
}

export interface SearchResult {
  chunk: KnowledgeChunk;
  score: number;
}

export interface Retriever {
  search(query: string, options: SearchOptions): Promise<SearchResult[]>;
}
~~~

- [ ] **Step 4: Implement deterministic scoring**

Compute document frequency once at construction. Score BM25-style term matches, then add explicit boosts for exact title/alias, source ID, and tags. Sort by descending score then stable chunk ID. Apply threshold, per-source cap, and final limit. Do not introduce a vector dependency.

- [ ] **Step 5: Verify and commit**

~~~powershell
npm.cmd test -- src/chat/retrieval/local-hybrid.test.ts
git add src/chat/retrieval
git commit -m "feat: add local hybrid portfolio retrieval"
~~~

### Task 7: Validate chat input and build the grounded prompt/citations

**Files:**
- Create: `src/chat/server/chat-types.ts`
- Create: `src/chat/server/validation.ts`
- Create: `src/chat/server/validation.test.ts`
- Create: `src/chat/server/prompt.ts`
- Create: `src/chat/server/prompt.test.ts`
- Create: `src/chat/server/citations.ts`
- Create: `src/chat/server/citations.test.ts`

- [ ] **Step 1: Write failing request-validation tests**

Cover valid Chinese/English requests, more than 600 Unicode code points, invalid session IDs, more than ten pairs, client-supplied `system` roles, oversized bodies, non-JSON content type, and cross-origin requests.

~~~ts
expect(parseChatBody({ message: "你好", history: [], sessionId: "session_123", locale: "zh-CN" })).toMatchObject({ locale: "zh" });
expect(() => parseChatBody({ message: "你".repeat(601), history: [], sessionId: "session_123" })).toThrow("message_too_long");
~~~

- [ ] **Step 2: Write failing prompt and split-marker tests**

~~~ts
expect(buildGroundedPrompt(input).system).toContain("赵实旷的 AI 作品集助手");
expect(buildGroundedPrompt(input).system).toContain("资料不足");

const parser = createCitationParser(new Set(["S1", "S2"]));
expect(parser.push("Answer [[S")).toBe("Answer ");
expect(parser.push("1]] end [[BAD]]")).toBe(" end ");
expect(parser.finish()).toEqual({ text: "", sourceIds: ["S1"] });
~~~

- [ ] **Step 3: Run and verify RED**

~~~powershell
npm.cmd test -- src/chat/server/validation.test.ts src/chat/server/prompt.test.ts src/chat/server/citations.test.ts
~~~

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement exact contracts**

`parseChatBody` accepts only alternating `user`/`assistant` history, truncates to ten pairs after validation, maps locale to `zh` or `en`, and counts Unicode code points with `Array.from`. `buildGroundedPrompt` labels profile facts, retrieved excerpts, and source IDs as untrusted evidence; it forbids invention, prompt disclosure, tools, and hidden data. Assign `S1` through `S8` only on the server.

`createCitationParser` must hold an incomplete trailing `[[...` sequence across stream chunks, strip complete markers from visible text, collect only allowed IDs, and ignore invalid IDs. If a grounded answer finishes with no valid marker, the handler later exposes the two highest-ranked consulted sources as `参考资料 / Consulted sources`.

- [ ] **Step 5: Verify and commit**

~~~powershell
npm.cmd test -- src/chat/server/validation.test.ts src/chat/server/prompt.test.ts src/chat/server/citations.test.ts
git add src/chat/server/chat-types.ts src/chat/server/validation.ts src/chat/server/validation.test.ts src/chat/server/prompt.ts src/chat/server/prompt.test.ts src/chat/server/citations.ts src/chat/server/citations.test.ts
git commit -m "feat: enforce grounded chat contracts"
~~~

### Task 8: Enforce anonymous cooldown, minute, visitor-day, and site-day limits

**Files:**
- Create: `src/chat/server/rate-limit.ts`
- Create: `src/chat/server/rate-limit.test.ts`

- [ ] **Step 1: Write failing in-memory rate-limit tests**

Use an injected clock. Assert one request is allowed, a second inside 3 seconds is blocked, the seventh request inside a rolling minute is blocked, the thirty-first visitor request is blocked, the 301st site request is blocked, and the Asia/Shanghai day bucket resets at midnight. Assert stored keys contain an HMAC, not the raw IP.

- [ ] **Step 2: Run and verify RED**

~~~powershell
npm.cmd test -- src/chat/server/rate-limit.test.ts
~~~

Expected: FAIL because the rate limiter does not exist.

- [ ] **Step 3: Define the store and result contract**

~~~ts
export type RateLimitReason = "cooldown" | "minute" | "visitor_day" | "site_day";

export interface RateLimitResult {
  allowed: boolean;
  reason?: RateLimitReason;
  resetAt: number;
}

export interface RateLimitStore {
  consume(input: { visitorKey: string; now: number; requestId: string }): Promise<RateLimitResult>;
}
~~~

- [ ] **Step 4: Implement HMAC identity and both adapters**

Use `createHmac("sha256", RATE_LIMIT_SALT).update(ip).digest("hex")`. The in-memory adapter mirrors production semantics for tests/local development. The Upstash adapter uses one atomic Lua script to:

1. reject an existing 3-second cooldown key;
2. remove rolling-minute sorted-set entries older than 60 seconds and reject a count of 6;
3. reject visitor-day count 30 or site-day count 300;
4. set cooldown, add the unique request ID to the minute set, increment day counters, and set TTLs only when allowed.

Use `Asia/Shanghai` date keys and 48-hour day-key TTLs. Set `analytics: false`; no transcript or raw IP enters Redis.

- [ ] **Step 5: Verify and commit**

~~~powershell
npm.cmd test -- src/chat/server/rate-limit.test.ts
git add src/chat/server/rate-limit.ts src/chat/server/rate-limit.test.ts
git commit -m "feat: add anonymous portfolio chat limits"
~~~

### Task 9: Add the DeepSeek streaming provider

**Files:**
- Create: `src/chat/server/deepseek-provider.ts`
- Create: `src/chat/server/deepseek-provider.test.ts`

- [ ] **Step 1: Write failing provider tests with a fake fetch stream**

Assert the request uses `https://api.deepseek.com/chat/completions`, bearer auth, configurable `deepseek-v4-flash`, `thinking: { type: "disabled" }`, `temperature: 0.2`, `max_tokens: 700`, `stream: true`, `stream_options.include_usage: true`, and opaque `user_id`. Feed SSE chunks containing keep-alive comments, JSON deltas, usage, and `[DONE]`.

- [ ] **Step 2: Run and verify RED**

~~~powershell
npm.cmd test -- src/chat/server/deepseek-provider.test.ts
~~~

Expected: FAIL because the provider does not exist.

- [ ] **Step 3: Implement provider and normalized errors**

~~~ts
export interface ChatProvider {
  stream(input: ProviderInput, signal: AbortSignal): AsyncIterable<ProviderEvent>;
}

export type ProviderEvent =
  | { type: "delta"; text: string }
  | { type: "usage"; inputTokens: number; outputTokens: number; cacheHitTokens?: number }
  | { type: "done" };
~~~

Parse SSE incrementally with `TextDecoder`, skip blank/colon keep-alive lines, and never log the request body, provider response body, or key. Normalize HTTP `401/402`, `429`, `500/503`, timeout, malformed SSE, and interrupted stream into private error categories.

- [ ] **Step 4: Verify abort and no-secret behavior**

Add tests proving the 45-second timeout aborts, an external abort propagates, and thrown public errors contain neither the bearer token nor provider response body.

- [ ] **Step 5: Verify and commit**

~~~powershell
npm.cmd test -- src/chat/server/deepseek-provider.test.ts
git add src/chat/server/deepseek-provider.ts src/chat/server/deepseek-provider.test.ts
git commit -m "feat: stream grounded answers from DeepSeek"
~~~

### Task 10: Orchestrate retrieval, retries, verified sources, and SSE

**Files:**
- Create: `src/chat/server/chat-handler.ts`
- Create: `src/chat/server/chat-handler.test.ts`
- Create: `src/chat/server/runtime.ts`
- Create: `src/chat/server/runtime.test.ts`

- [ ] **Step 1: Write failing handler tests**

Test event order `start → delta* → sources → done`, Chinese and English no-result responses without a model call, source-marker filtering, consulted-source fallback, rate-limit errors, provider retry exactly once before the first delta, no retry after a partial stream, and assistant failure isolation.

~~~ts
const response = await handleChat(request, fakeDependencies);
expect(response.headers.get("content-type")).toContain("text/event-stream");
expect(await readEvents(response)).toEqual([
  { event: "start", data: expect.any(Object) },
  { event: "delta", data: { text: "..." } },
  { event: "sources", data: { sources: [expect.objectContaining({ projectId: "inkseat", page: 8 })] } },
  { event: "done", data: expect.any(Object) },
]);
~~~

- [ ] **Step 2: Run and verify RED**

~~~powershell
npm.cmd test -- src/chat/server/chat-handler.test.ts src/chat/server/runtime.test.ts
~~~

Expected: FAIL because the handler/runtime do not exist.

- [ ] **Step 3: Implement the Web Handler core**

`handleChat(request, dependencies)` must:

1. require POST, same-origin, JSON, body size, and schema validity;
2. derive the HMAC visitor key from `ipAddress(request)` supplied through dependencies;
3. rate-limit before retrieval/model work;
4. return a localized static no-result stream when profile and retrieval cannot answer;
5. compose the prompt and stream through the citation parser;
6. retry only once and only before any visible delta;
7. emit stable public error codes and `Cache-Control: no-store`;
8. record only aggregate counters/latency/token totals through an injected metrics sink.

- [ ] **Step 4: Wire production dependencies without module-side secret leakage**

`createRuntime()` validates `DEEPSEEK_API_KEY`, `RATE_LIMIT_KV_URL`, `RATE_LIMIT_KV_TOKEN`, and `RATE_LIMIT_SALT`; imports the generated index only in the server runtime; constructs the local retriever, Upstash store, and DeepSeek provider; and respects `CHAT_ENABLED`. Missing secrets return a disabled handler state rather than exposing configuration details.

- [ ] **Step 5: Verify and commit**

~~~powershell
npm.cmd test -- src/chat/server/chat-handler.test.ts src/chat/server/runtime.test.ts
git add src/chat/server/chat-handler.ts src/chat/server/chat-handler.test.ts src/chat/server/runtime.ts src/chat/server/runtime.test.ts
git commit -m "feat: orchestrate grounded portfolio chat"
~~~

### Task 11: Expose the Vercel API and production configuration

**Files:**
- Create: `api/chat.ts`
- Create: `.env.example`
- Modify: `vercel.json`
- Modify: `src/vercel-config.test.ts`
- Modify: `src/production-delivery.test.ts`

- [ ] **Step 1: Write failing delivery/config tests**

Assert `api/chat.ts` exists, exports the recommended Vercel Web Handler shape, `vercel.json.functions["api/chat.ts"].maxDuration` is `60`, `.env.example` lists variable names without values, and no tracked file matches a DeepSeek `sk-` secret pattern.

- [ ] **Step 2: Run and verify RED**

~~~powershell
npm.cmd test -- src/vercel-config.test.ts src/production-delivery.test.ts
~~~

Expected: FAIL because the route/config are absent.

- [ ] **Step 3: Add the Web Handler entry point**

~~~ts
import { createRuntime } from "../src/chat/server/runtime";

let runtime: ReturnType<typeof createRuntime> | undefined;

export default {
  fetch(request: Request): Promise<Response> {
    runtime ??= createRuntime();
    return runtime.handle(request);
  },
};
~~~

This matches the current Vercel recommendation for root `api/*.ts` functions in non-framework/Vite projects.

- [ ] **Step 4: Add safe configuration**

Add this `vercel.json` entry without removing existing headers:

~~~json
"functions": {
  "api/chat.ts": { "maxDuration": 60 }
}
~~~

`.env.example` contains only names and safe defaults:

~~~dotenv
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
RATE_LIMIT_KV_URL=
RATE_LIMIT_KV_TOKEN=
RATE_LIMIT_SALT=
CHAT_ENABLED=true
CHAT_SITE_DAILY_LIMIT=300
CHAT_VISITOR_DAILY_LIMIT=30
CHAT_VISITOR_MINUTE_LIMIT=6
CHAT_COOLDOWN_SECONDS=3
CHAT_MAX_OUTPUT_TOKENS=700
CHAT_UPSTREAM_TIMEOUT_MS=45000
~~~

- [ ] **Step 5: Verify and commit**

~~~powershell
npm.cmd test -- src/vercel-config.test.ts src/production-delivery.test.ts
npm.cmd run build
git add api .env.example vercel.json src/vercel-config.test.ts src/production-delivery.test.ts
git commit -m "feat: expose portfolio chat API on Vercel"
~~~

Expected: tests/build PASS without a real API key because build verifies code/index, not live provider access.

### Task 12: Render the approved frameless hero assistant

**Files:**
- Create: `src/chat/content.ts`
- Create: `src/chat/render-chat.ts`
- Create: `src/chat/render-chat.test.ts`
- Modify: `src/hero/render-hero.ts`
- Modify: `src/hero/render-hero.test.ts`
- Modify: `src/styles.css`
- Modify: `src/styles.test.ts`

- [ ] **Step 1: Write failing hero/chat markup tests**

Assert the visible name is `赵实旷`, the hero returns `[data-chat-root]`, the assistant label is `ASK SHIKUANG · AI`, exactly four fixed balanced recommendations render, the composer has an accessible label, and there is no close button, dialog role, outer panel class, or modal markup.

- [ ] **Step 2: Write failing approved-style tests**

Assert desktop chat CSS includes approximately `left: 6.5%` and `top: 39%`, no background/border/shadow on `.hero-chat`, underlined recommendation actions, and a mobile normal-flow rule under `760px`.

- [ ] **Step 3: Run and verify RED**

~~~powershell
npm.cmd test -- src/chat/render-chat.test.ts src/hero/render-hero.test.ts src/styles.test.ts
~~~

Expected: FAIL because chat markup/styles are absent.

- [ ] **Step 4: Implement localized content and markup**

`renderChat(root, locale)` renders:

- accent rule and label;
- explicit AI introduction;
- four buttons: one-minute introduction, core capabilities, representative systems-thinking project, current opportunities;
- transcript region with `aria-live="polite"`;
- textarea, send button with accessible name, source region, status/disclosure copy;
- no outer UI container styling beyond the semantic `.hero-chat` mount.

Return typed references needed by the controller rather than re-querying global DOM.

- [ ] **Step 5: Implement desktop and mobile CSS**

Desktop:

~~~css
.hero-chat {
  position: absolute;
  z-index: 3;
  top: 39%;
  left: 6.5%;
  width: min(330px, 24vw);
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
~~~

Mobile uses normal flow with safe hero spacing, full content width, and no portrait/headline overlap. Recommendation and source controls keep 44px pointer targets while their visible treatment remains a thin underline or quiet source outline. Reduced motion removes cursors/crossfades.

- [ ] **Step 6: Verify and commit**

~~~powershell
npm.cmd test -- src/chat/render-chat.test.ts src/hero/render-hero.test.ts src/styles.test.ts
git add src/chat/content.ts src/chat/render-chat.ts src/chat/render-chat.test.ts src/hero/render-hero.ts src/hero/render-hero.test.ts src/styles.css src/styles.test.ts
git commit -m "feat: render frameless homepage AI assistant"
~~~

### Task 13: Add session history, browser SSE, and controller behavior

**Files:**
- Create: `src/chat/session.ts`
- Create: `src/chat/session.test.ts`
- Create: `src/chat/sse.ts`
- Create: `src/chat/sse.test.ts`
- Create: `src/chat/chat-controller.ts`
- Create: `src/chat/chat-controller.test.ts`
- Modify: `src/main.ts`
- Modify: `src/main.test.ts`

- [ ] **Step 1: Write failing session and SSE tests**

Assert session state keeps only ten user/assistant pairs, rejects malformed stored JSON, never uses `localStorage`, and creates an opaque session ID. Feed SSE across arbitrary byte boundaries and assert typed `start`, `delta`, `sources`, `done`, and `error` events.

- [ ] **Step 2: Write failing controller tests**

Using injected `fetch`, `sessionStorage`, and source navigation, test:

- recommendation click submits the exact localized question;
- `Enter` submits and `Shift+Enter` does not;
- deltas append in order and sentence batches update the live region;
- sources render only from server events;
- follow-up copy appears after success;
- public error codes map to Chinese/English copy;
- aborted/failed streams preserve received text and expose retry;
- cleanup aborts in-flight requests.

- [ ] **Step 3: Run and verify RED**

~~~powershell
npm.cmd test -- src/chat/session.test.ts src/chat/sse.test.ts src/chat/chat-controller.test.ts src/main.test.ts
~~~

Expected: FAIL because the browser modules/integration do not exist.

- [ ] **Step 4: Implement session and SSE utilities**

Use `sessionStorage` keys `portfolio-chat-session-id` and `portfolio-chat-history-v1`. Validate every read. Keep ten pairs after appending. `parseSse(response.body)` uses `TextDecoder` and yields complete event blocks split by blank lines; it rejects unknown event types without executing content.

- [ ] **Step 5: Implement and integrate the controller**

`startPortfolioChat(chatRoot, dependencies)` renders the initial state, binds recommendation/composer actions, sends `/api/chat`, consumes typed SSE, stores only successful local turns, and returns cleanup. In `main.ts`, start it after hero and portfolio markup exist. On non-persisted `pagehide`, abort chat and destroy PDF readers; preserve both during BFCache pagehide.

- [ ] **Step 6: Verify and commit**

~~~powershell
npm.cmd test -- src/chat/session.test.ts src/chat/sse.test.ts src/chat/chat-controller.test.ts src/main.test.ts
git add src/chat/session.ts src/chat/session.test.ts src/chat/sse.ts src/chat/sse.test.ts src/chat/chat-controller.ts src/chat/chat-controller.test.ts src/main.ts src/main.test.ts
git commit -m "feat: add streaming portfolio chat interaction"
~~~

### Task 14: Connect verified sources to exact PDF pages and finish production verification

**Files:**
- Create: `src/chat/source-navigation.ts`
- Create: `src/chat/source-navigation.test.ts`
- Modify: `src/portfolio/render-portfolio.ts`
- Modify: `src/portfolio/render-portfolio.test.ts`
- Modify: `src/portfolio/pdf-reader.ts`
- Modify: `src/portfolio/pdf-reader.test.ts`
- Modify: `tests/homepage.spec.ts`
- Create: `docs/portfolio-ai-operations.md`

- [ ] **Step 1: Write failing source-navigation and reader tests**

Add `data-project-id` to each reader root. Define a `portfolio:open-project-page` event with `{ projectId, page }`. Assert dispatching `inkseat, 8`:

- initializes the lazy controller if needed;
- scrolls `#project-inkseat` into view;
- calls `goTo(8)` after initialization;
- ignores unknown projects and bounds invalid pages through existing reader logic;
- removes its event listener on reader cleanup.

Also test the two non-project targets: a `profile` source scrolls to `#about`, and the sanitized `resume` source opens `/documents/zhao-shikuang-resume-public.pdf#page=1` in a new tab with `noopener` semantics.

- [ ] **Step 2: Run and verify RED**

~~~powershell
npm.cmd test -- src/chat/source-navigation.test.ts src/portfolio/render-portfolio.test.ts src/portfolio/pdf-reader.test.ts
~~~

Expected: FAIL because the event/data attribute are absent.

- [ ] **Step 3: Implement navigation without changing the existing cleanup API**

`navigateToSource(portfolioRoot, source, browser)` accepts only server-returned normalized source records. Project sources validate `projectId` and a positive integer page, then dispatch the custom reader event. Profile sources scroll to `#about`. Resume sources open the fixed sanitized public PDF URL with `#page=1`; ignore any arbitrary URL that is not represented by a known manifest source. Update `startProjectReaders` so its internal `initialize(readerRoot)` returns/stores one promise; the event handler awaits initialization and `controller.goTo(page)`. Keep `startProjectReaders` returning the existing cleanup function so current `main.ts` and tests remain compatible.

- [ ] **Step 4: Add Playwright chat coverage with mocked SSE**

Extend `tests/homepage.spec.ts` to intercept `**/api/chat` and stream deterministic responses. Cover:

- desktop assistant at the approved left/top region with no close button or visible outer frame;
- correct `赵实旷` identity;
- exactly four recommendation questions;
- Chinese and English delta rendering;
- same-tab `sessionStorage` reload and new-context absence;
- error/rate-limit states;
- source `INKSEAT · P.08` scrolling to INKSeat and changing its counter to `08`;
- profile sources scrolling to About and resume sources opening only the sanitized public PDF;
- 390px/430px mobile layout with no assistant/portrait/headline/project overlap;
- keyboard and reduced-motion behavior;
- API failure leaving navigation, portrait, and all six readers usable.

- [ ] **Step 5: Write the operations guide**

Document exact commands and checks:

1. revoke the compromised design-time DeepSeek key;
2. create a replacement key and enter it directly in Vercel;
3. create Upstash Redis and configure REST URL/token plus a random rate-limit salt;
4. run resume sanitation, render review, `knowledge:generate`, and `knowledge:verify` after content changes;
5. run unit, E2E, build, and secret scans;
6. deploy preview, run Chinese/English/no-result/citation/rate-limit smoke checks, then promote;
7. disable `CHAT_ENABLED` or roll back if provider/KV failures occur;
8. never paste a secret into chat or commit `.env`.

- [ ] **Step 6: Run the full verification gate**

~~~powershell
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
git grep -n -E 'sk-[A-Za-z0-9]{10,}' -- ':!docs/superpowers/specs/2026-07-20-portfolio-ai-chat-design.md'
git status --short
~~~

Expected:

- all Vitest tests pass;
- all applicable Playwright projects pass with only intentional skips;
- production build passes after knowledge verification;
- secret scan returns no matches;
- only intended implementation files are modified.

- [ ] **Step 7: Preview deployment smoke test**

Deploy to Vercel preview with the replacement DeepSeek key and Upstash variables configured through the Vercel dashboard/CLI, never command history. Verify `/api/chat` returns `405` for GET, accepts a Chinese POST, streams an English POST, opens one exact PDF page, rejects a cross-origin request, and returns a friendly response when limits are exceeded. Inspect logs to confirm message/prompt/answer bodies are absent.

- [ ] **Step 8: Commit**

~~~powershell
git add src/chat/source-navigation.ts src/chat/source-navigation.test.ts src/portfolio/render-portfolio.ts src/portfolio/render-portfolio.test.ts src/portfolio/pdf-reader.ts src/portfolio/pdf-reader.test.ts tests/homepage.spec.ts docs/portfolio-ai-operations.md
git commit -m "feat: complete grounded portfolio AI chat"
~~~

## Final handoff checklist

- [ ] The original `D:/edge浏览器下载/A4 (1).pdf` is unchanged and absent from tracked/deployed files.
- [ ] The public resume derivative contains only approved public contact information and passes rendered visual review.
- [ ] The server-only index covers profile, sanitized resume, and all six PDF page sets with valid digests.
- [ ] `Retriever` and `ChatProvider` boundaries allow future vector/provider replacement.
- [ ] The homepage assistant matches the approved permanent, frameless, left-side composition.
- [ ] Every displayed source is server-owned and exact PDF page navigation works.
- [ ] Limits are 3-second cooldown, 6 rolling minute, 30 visitor/day, and 300 site/day.
- [ ] Raw IPs, transcripts, prompts, answers, source passages, and secrets are not persisted or logged.
- [ ] The compromised DeepSeek key is revoked and never appears in repository or Vercel configuration.
- [ ] Unit tests, Playwright tests, production build, preview smoke checks, and clean-worktree review pass.
