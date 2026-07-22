# Knowledge Index Release Hardening Design

## Goal

Make the committed portfolio knowledge index strictly canonical, privacy-safe, cleanup-safe, and provably absent from browser build output while preserving the fast no-OCR verification path.

## Trust Boundary

Verification proves that the artifact is structurally canonical for the current manifest and internally consistent with the chunking rules. Matching SHA-256 digests prove source-file freshness: the current source files still match the digests recorded in the artifact. Because verification deliberately does not rerun extraction or OCR, those digests do not prove that artifact text was derived from the source files, and verification cannot resist coordinated artifact or code-and-artifact edits.

## Canonical Verifier

`validateGeneratedIndex` will parse unknown input rather than cast it. It will require exact top-level and chunk key sets, validate every primitive and array, and copy accepted values into a fresh `GeneratedKnowledgeIndex`. Manifest metadata is authoritative: title, public target, citation, aliases, tags, and optional project ID must match exactly.

Chunks will be consumed in manifest source order and ascending page order. Each nonvisual page must have at least one chunk; visual pages may have none. IDs and chunk indexes must be contiguous. Text must already equal `normalizeKnowledgeText(text)`, contain at most 1,200 Unicode code points, and produce exactly the stored ordered terms from `[title, ...aliases, ...tags, text]`. Chunk boundaries move backward when needed so emitted chunks have no leading or trailing normalized whitespace. Consecutive chunks on a multi-chunk page have exactly 150 code points of overlap; the verifier reconstructs and deterministically rechunks the page to enforce canonical progression and a nonempty final chunk of at most 1,200 code points.

## Privacy Detection

Complete email tokens are extracted before comparison; only an exact case-insensitive match with the approved public address is accepted. Longer emails containing the approved address remain unapproved.

Phone detection considers unlabelled international `+` candidates, standalone 11-digit mobile candidates, and high-confidence formatted 10–11 digit local candidates, then excludes labelled non-contact shapes such as year ranges, dimensions, dates, and page/model/serial/product identifiers. Address detection operates line by line, evaluates residential/contact labels and street-address context before technical exemptions, and still accepts technical-only uses such as IP address and memory address. Tests use synthetic values only.

## Cleanup Semantics

All cleanup remains attempted. If the primary operation and cleanup both fail, the original primary error remains the thrown object and gains non-content cleanup context through `cause` or an attached `AggregateError`. Cleanup never replaces the primary failure. This applies to worker initialization, sparse OCR mode restoration, PDF/page destruction, and atomic temporary-file cleanup.

## Browser Boundary

The static import graph will recognize `.ts`, `.tsx`, `.js`, and `.mjs`, plus literal dynamic imports and feasible alias/glob forms. A deterministic post-build inspector will scan the freshly generated `dist` tree for source digests and hashed/aggregate chunk sentinels without logging chunk text. The production build invokes this inspector after Vite, so tests do not rely on a stale `dist` directory.

## Atomic Publish

Atomic publication continues to write a same-directory temporary file and perform one rename without deleting the destination. Real temporary-directory tests cover successful replacement and failed rename preserving the destination and removing the temporary file with Windows-safe handles and paths.

## Verification

Adversarial mutation tests cover structural extras and omissions, wrong primitive types, metadata drift, forged terms, non-normalized or replaced text, ordering and page coverage, chunk length and overlap, privacy edge cases, and dual cleanup failures. After green tests, generation runs twice using the existing model cache; both artifacts must have identical hash and size, eight sources, 137 total pages, and no empty nonvisual page. Verify must neither invoke OCR nor rewrite the file. Full tests, typecheck, build/prebuild, privacy/secret/bundle scans, diff checks, and clean status close the work.
