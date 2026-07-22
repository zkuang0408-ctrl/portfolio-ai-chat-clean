# Knowledge Index Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status:** Completed and archived. The steps below are retained as the historical execution plan; implementation and release checks were completed in the Task 5 hardening commits. Unchecked boxes are archival plan syntax, not outstanding work.

**Goal:** Enforce a canonical, privacy-safe knowledge artifact with cleanup-safe generation and a verified server-only browser boundary.

**Architecture:** Keep generation and no-OCR verification separate. Parse the committed artifact against manifest-driven canonical invariants, centralize primary-plus-cleanup error handling, classify privacy candidates by complete tokens and context, and inspect fresh build output with a deterministic helper.

**Tech Stack:** TypeScript, Node.js filesystem APIs, Vitest, Vite, PDF.js, Tesseract.js.

---

### Task 1: Canonical artifact verifier

**Files:**
- Modify: `src/chat/knowledge/build-index.test.ts`
- Modify: `src/chat/knowledge/build-index.ts`

- [ ] **Step 1: Write failing adversarial tests**

Add table-driven mutations that insert extra top/chunk keys; delete required keys; change primitive types; alter aliases, tags, project ID, title, target, citation, text normalization, or canonical terms; remove/reorder/duplicate source or page groups; omit a nonvisual page; and violate ID, length, final-size, or 150-code-point overlap rules. Each test calls `validateGeneratedIndex` with synthetic sources and expects rejection.

- [ ] **Step 2: Run the focused test and verify RED**

Run `npm.cmd test -- --run src/chat/knowledge/build-index.test.ts`. Expected: the new mutations are accepted by the current permissive validator.

- [ ] **Step 3: Implement exact parsing and sequence validation**

Add exact-key, primitive-array, ordered-array, and Unicode code-point helpers. Walk manifest sources and pages in canonical order, consume matching candidate chunks, validate metadata and `buildTerms([title, ...aliases, ...tags, text].join(" "))`, enforce chunk shape/overlap, and construct copied chunk/index objects without unknown casts.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same Vitest command. Expected: all verifier and existing index tests pass.

### Task 2: Context-aware privacy matcher

**Files:**
- Modify: `src/chat/knowledge/build-index.test.ts`
- Modify: `src/chat/knowledge/build-index.ts`

- [ ] **Step 1: Write synthetic failing privacy tests**

Cover approved email case-insensitivity, approved address embedded as a prefix/suffix of another email, unlabelled international and mobile numbers, labelled numbers, benign years, dimensions, model/page numbers, IP/memory address wording, and synthetic residential/contact address lines.

- [ ] **Step 2: Run the focused test and verify RED**

Run the build-index test file and confirm current replacement/regex behavior misclassifies the added cases.

- [ ] **Step 3: Implement token and line-context classifiers**

Extract complete email tokens and compare exact lowercase values. Normalize plausible phone candidates while excluding technical contexts. Evaluate address risk per line using contact/residential labels and street patterns, explicitly exempting IP/memory/technical address terminology.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the build-index test file and confirm every synthetic edge case passes.

### Task 3: Preserve primary failures during cleanup

**Files:**
- Modify: `src/chat/knowledge/build-index.test.ts`
- Modify: `src/chat/knowledge/build-index.ts`
- Modify: `src/chat/knowledge/pdf-extractor.test.ts`
- Modify: `src/chat/knowledge/pdf-extractor.ts`
- Modify: `src/chat/knowledge/ocr.ts`

- [ ] **Step 1: Write dual-failure tests**

Create distinct primary and cleanup `Error` objects for worker initialization/termination, sparse recognition/PSM restoration, source extraction/document destruction, and page extraction/page cleanup. Assert the thrown object is the primary error and contains cleanup context; assert cleanup was attempted once.

- [ ] **Step 2: Run focused lifecycle tests and verify RED**

Run the build-index and PDF extractor test files. Expected: cleanup currently replaces or silently discards secondary failures in at least one path.

- [ ] **Step 3: Implement a primary-error attachment helper**

Keep the primary `Error` object and attach a content-free `AggregateError` through `cause` when writable, with a symbol/property fallback only if necessary. Refactor each `try/finally` path to capture primary failure, attempt cleanup, attach cleanup failure, then rethrow primary.

- [ ] **Step 4: Run focused lifecycle tests and verify GREEN**

Run the same files and confirm all primary identities and cleanup attempts.

### Task 4: Browser bundle boundary

**Files:**
- Modify: `src/production-delivery.test.ts`
- Create: `scripts/check-client-bundle.ts`
- Create: `src/check-client-bundle.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing static and bundle tests**

Test literal dynamic imports and `.tsx/.js/.mjs` resolution in a temporary source graph. Test the bundle helper with a synthetic generated index and temporary clean/leaking asset trees; assert rejection reports only safe hashes/counts, never synthetic passage text. Assert production build invokes the helper after Vite.

- [ ] **Step 2: Run focused delivery tests and verify RED**

Run `npm.cmd test -- --run src/production-delivery.test.ts src/check-client-bundle.test.ts`. Expected: unsupported graph forms and missing helper/build hook fail.

- [ ] **Step 3: Implement deterministic scanning**

Expand import extraction and extension candidates. Export a helper that recursively scans a supplied build directory for source digest strings and sufficiently long exact chunk-text sentinels, reports only sentinel hashes/counts, and exits nonzero on a leak. Append `tsx scripts/check-client-bundle.ts` after `vite build`.

- [ ] **Step 4: Run focused delivery tests and verify GREEN**

Run the same focused command. Expected: all static and temporary bundle cases pass without requiring repository `dist`.

### Task 5: Real atomic publication

**Files:**
- Modify: `src/chat/knowledge/build-index.test.ts`
- Modify: `src/chat/knowledge/build-index.ts`

- [ ] **Step 1: Add real temporary-directory tests**

Use `mkdtemp`, `writeFile`, `readFile`, `rename`, and `rm` with same-directory destination/temp paths. Verify successful replacement. Inject a rename failure and verify the original destination remains byte-identical and the temporary path is absent.

- [ ] **Step 2: Run focused tests and verify behavior**

Run build-index tests. If current behavior passes, retain the tests as platform regression coverage; if it fails, change only the atomic helper and rerun to green. No destination removal is permitted.

### Task 6: Deterministic regeneration and release verification

**Files:**
- Modify: `src/chat/knowledge/generated-index.json`

- [ ] **Step 1: Run generation twice with the cached OCR models**

Run `npm.cmd run knowledge:generate` twice. Record SHA-256 and byte size after each run without printing chunk text. Expected: identical values, 8 sources, 137 pages total, and no empty nonvisual pages.

- [ ] **Step 2: Verify no-OCR and no-rewrite behavior**

Hash and timestamp the artifact, run `knowledge:verify`, and compare. Expected: no OCR output and unchanged hash/timestamp.

- [ ] **Step 3: Run complete release checks**

Run focused tests, full Vitest with the existing PyMuPDF user-site on `PYTHONPATH`, `tsc --noEmit`, production build/prebuild, privacy/secret scans, bundle scan, `git diff --check`, and `git status --short`. Expected: all commands exit zero, privacy scan counts are zero, no package-lock/tmp changes, and only intended files are staged.

- [ ] **Step 4: Commit focused implementation**

Stage the verifier, privacy, lifecycle, delivery, atomic tests/helper, package script, and regenerated artifact. Commit with `fix: harden knowledge index release verification` and report the commit SHA plus all RED/GREEN and artifact evidence.
