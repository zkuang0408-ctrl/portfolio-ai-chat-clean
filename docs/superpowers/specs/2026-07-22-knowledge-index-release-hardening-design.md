# Knowledge Index Release Hardening Design

## Goal

Make the committed portfolio knowledge index strictly canonical, privacy-safe, cleanup-safe, and provably absent from browser build output while preserving the fast no-OCR verification path.

## Trust Boundary

Verification proves that the artifact is structurally canonical for the current manifest, internally consistent with the chunking rules, and bound to the current source files by SHA-256 digests. It deliberately does not rerun OCR and therefore cannot cryptographically defeat a malicious coordinated rewrite of both application code and artifact.

## Canonical Verifier

`validateGeneratedIndex` will parse unknown input rather than cast it. It will require exact top-level and chunk key sets, validate every primitive and array, and copy accepted values into a fresh `GeneratedKnowledgeIndex`. Manifest metadata is authoritative: title, public target, citation, aliases, tags, and optional project ID must match exactly.

Chunks will be consumed in manifest source order and ascending page order. Each nonvisual page must have at least one chunk; visual pages may have none. IDs and chunk indexes must be contiguous. Text must already equal `normalizeKnowledgeText(text)`, contain at most 1,200 Unicode code points, and produce exactly the stored ordered terms from `[title, ...aliases, ...tags, text]`. Consecutive chunks on a page must have exactly 150 code points of overlap. Multi-chunk pages must use full 1,200-code-point non-final chunks, advance by 1,050 code points, and have a nonempty final chunk no longer than 1,200 code points.

## Privacy Detection

Complete email tokens are extracted before comparison; only an exact case-insensitive match with the approved public address is accepted. Longer emails containing the approved address remain unapproved.

Phone detection considers unlabelled international `+` candidates and standalone 11-digit mobile candidates, then excludes clearly technical or non-contact shapes such as year ranges, dimensions, page/model identifiers, and address-space wording. Address detection operates line by line and requires residential/contact labels or street-address context; technical uses such as IP address and memory address remain accepted. Tests use synthetic values only.

## Cleanup Semantics

All cleanup remains attempted. If the primary operation and cleanup both fail, the original primary error remains the thrown object and gains non-content cleanup context through `cause` or an attached `AggregateError`. Cleanup never replaces the primary failure. This applies to worker initialization, sparse OCR mode restoration, PDF/page destruction, and atomic temporary-file cleanup.

## Browser Boundary

The static import graph will recognize `.ts`, `.tsx`, `.js`, and `.mjs`, plus literal dynamic imports and feasible alias/glob forms. A deterministic post-build inspector will scan the freshly generated `dist` tree for source digests and hashed/aggregate chunk sentinels without logging chunk text. The production build invokes this inspector after Vite, so tests do not rely on a stale `dist` directory.

## Atomic Publish

Atomic publication continues to write a same-directory temporary file and perform one rename without deleting the destination. Real temporary-directory tests cover successful replacement and failed rename preserving the destination and removing the temporary file with Windows-safe handles and paths.

## Verification

Adversarial mutation tests cover structural extras and omissions, wrong primitive types, metadata drift, forged terms, non-normalized or replaced text, ordering and page coverage, chunk length and overlap, privacy edge cases, and dual cleanup failures. After green tests, generation runs twice using the existing model cache; both artifacts must have identical hash and size, eight sources, 137 total pages, and no empty nonvisual page. Verify must neither invoke OCR nor rewrite the file. Full tests, typecheck, build/prebuild, privacy/secret/bundle scans, diff checks, and clean status close the work.
