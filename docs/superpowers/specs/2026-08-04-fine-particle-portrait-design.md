# Fine Particle Portrait Design

**Status:** Approved

## Goal

Refine the homepage portrait into the selected M2 balance: a recognizable, dimensional particle-only figure with finer particles, no splash band, and no settled particles outside the subject silhouette.

## Scope

This change affects only the particle sampler's size-band proportions and radius ranges, plus the documentation and regression coverage that define them. It preserves the current black editorial homepage, inverted source-luminance mapping, centered head-and-shoulders composition, entrance aggregation, responsive layout, copy, navigation, AI assistant, résumé, project readers, and all other site behavior.

## Visual Direction

- The final particle mix is 82% micro, 15% medium, 3% large, and 0% splash.
- Micro particles use a `0.37–0.88px` radius range and establish the face, hair, and primary tonal structure.
- Medium particles use a `0.90–1.48px` radius range and provide restrained variation across hair, clothing, and broader facial planes.
- Large particles use a `1.56–2.34px` radius range and appear only as sparse accents around hair tips, shoulders, and garment folds.
- Splash particles receive a zero quota and never appear.
- Large particles remain prohibited from the facial core. Existing edge-strength eligibility continues to prevent large points from interrupting important facial detail.
- The existing tonal negative remains unchanged: dark hair, eyes, facial shadow, and garment folds produce brighter and denser light particles, while source highlights stay open.
- The subject alpha mask remains the sole spatial authority. Every settled target must remain inside the figure, with no decorative background spray.

## Architecture

The existing four-band particle type and assignment pipeline remain intact. The implementation changes only the radius constants and `SIZE_BAND_SHARES`; the splash share becomes zero rather than removing the band from types or control flow. This keeps the change local, deterministic, and compatible with existing quota allocation.

Sampling, source-luminance inversion, edge detection, regional classification, mask checks, deterministic randomness, target displacement, renderer behavior, parallax, animation timing, and responsive particle budgets remain unchanged.

## Data Flow

1. The paired source portrait and alpha mask load as they do now.
2. The sampler accepts candidates only inside the mask and maps source luminance through the approved tonal negative.
3. Candidate selection retains regional and edge eligibility constraints.
4. Exact band quotas are assigned as 82/15/3/0 for the final feasible particle count.
5. The renderer draws the resulting grayscale particles without a photo overlay.

## Failure and Accessibility Behavior

- Portrait or mask loading failures continue to use the existing portfolio-safe fallback path.
- Reduced-motion visitors receive the settled M2 portrait directly without entrance replay.
- Mask mismatch, non-finite limits, maximum particle limits, and deterministic behavior retain their current handling.
- No changes are made to navigation, focus behavior, assistant accessibility, or content semantics.

## Verification

- Add failing tests for the new radius ranges and exact 82/15/3/0 quota allocation before implementation.
- Preserve hard tests for `MAX_PARTICLES`, deterministic sampling, subject-mask confinement, and exclusion of oversized facial-core particles.
- Update production-budget tests for 7,000 and 14,000 particles to expect the new exact proportions.
- Run particle sampler, renderer, and controller regression tests, followed by the complete unit suite and production build.
- Run the six-viewport centered-portrait contract and the full homepage Playwright suite.
- Capture desktop, mobile portrait, and mobile landscape screenshots after browser tests and inspect recognizability, facial detail, title separation, assistant separation, and absence of exterior particles.

## Explicit Non-Goals

- Do not change the source portrait or subject mask.
- Do not alter particle luminance, tone, opacity, total budgets, or animation behavior.
- Do not remove the existing splash type or refactor the assignment architecture.
- Do not modify the AI assistant in this change; its homepage-expanded and scroll-collapse behavior will be designed as a separate follow-up specification.
