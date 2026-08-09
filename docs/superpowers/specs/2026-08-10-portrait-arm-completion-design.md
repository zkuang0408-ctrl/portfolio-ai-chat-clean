# Particle Portrait Arm Completion Design

## Goal

Complete the visible shoulder and upper-arm silhouette in the homepage particle portrait so neither side ends in an obvious flat photographic crop, while preserving the visitor's current recognition of Zhao Shikuang's real face.

The approved direction is **C: multiply the current desktop scale by `0.97` and add garment-only arm completion**.

## Observed Cause

- The current source is `1104x1425`.
- The current person mask reaches `x = 0` on the left, so the left sweater and arm are already cut by the source photograph before Canvas rendering begins.
- The current mask ends near `x = 1006` on the right, but the lower garment still inherits a visibly photographed edge.
- Desktop composition is driven by source height. Repositioning the existing particles cannot reconstruct the missing arm pixels or remove the flat source boundary.

This is therefore an asset-completion problem first and a composition problem second.

## Approved Visual Result

### Desktop

- Preserve the current head position and recognition.
- Multiply the current desktop composition scale by `0.97`.
- Show a continuous left and right shoulder line.
- Extend both sweater sleeves into natural upper-arm silhouettes that continue toward the lower frame edge.
- Do not generate hands, forearms, accessories, or new body poses.
- Keep each completed-arm landmark at least 4% of the viewport width inside the Canvas edge at the `1440`, `1920`, and `2040` desktop checks.
- The lower-right headline may continue to overlap only the lower clothing field; it must not cover the face.

### Mobile

- Continue prioritizing facial size and recognition over complete shoulder width.
- Use the completed garment asset so any visible side boundary is organic rather than flat.
- Do not force the entire desktop shoulder span into the narrow viewport.
- Preserve the current mobile headline, navigation, AI assistant, and safe-area behavior.

## Identity-Preservation Boundary

Generative editing is permitted only for missing garment and upper-arm pixels in the side completion zones. It may bridge across an original side boundary where the photographed sleeve already ends, but it may not enter the protected identity and central-clothing matte.

The final asset pipeline must:

1. Create a wider portrait canvas, targeted at `1350x1425`.
2. Place the current `1104x1425` photograph at horizontal offset `123`.
3. Use image outpainting to continue the existing sweater, shoulder line, and upper arms through the left and right side completion zones.
4. Copy the original hair, face, glasses, ears, jaw, neck, collar, and central torso back through a protected matte after generation.
5. Keep every original pixel inside that protected matte unchanged. Any seam treatment must remain in garment-only side zones outside the matte.

This makes the final face, hair, glasses, jaw, neck, collar, and central clothing real source pixels rather than generated reconstructions while still allowing a continuous right sleeve where the current mask ends before the original frame edge.

## Subject Mask

- Produce a matching `1350x1425` person-only alpha mask.
- Translate the current verified mask into the centered original-frame coordinates at `x = 123`.
- Preserve its alpha values inside the protected identity and central-clothing matte.
- Replace only the side garment zones needed to join the newly completed sweater sleeves and upper arms.
- Keep all wall, furniture, light areas, background shapes, and unrelated black sleeve/arm shapes transparent.
- The added arm mask must join the existing shoulder mask continuously without holes or rectangular seams.
- Every final particle target must remain inside this mask.

The mask verification must add required landmarks within both completed upper arms and forbidden landmarks in the background immediately above and outside those arms.

## Particle Sampling

- Preserve the existing black-and-white luminance inversion.
- Preserve the current particle-size distribution, particle budget, no-splash rule, and settle-once animation.
- Keep the face, jaw, throat, and collar tone mapping unchanged.
- Map face/core classification through the centered protected source rectangle rather than the full outpainted width. This prevents the wider canvas from changing facial density or semantic regions.
- Treat the generated sleeve extensions as edge/garment regions.
- Do not create particles from transparent background pixels.

## Responsive Composition

- Update the renderer for the wider source geometry.
- Desktop composition multiplies the current scale by `0.97` and remains horizontally centered.
- Mobile retains its current face-priority height behavior.
- The following existing landmarks remain protected: hair top, both glasses, chin, Adam's apple, collar, and lower clothing.
- Desktop tests additionally protect left and right completed-arm landmarks from viewport clipping.

## Failure Handling

- Source and mask dimension mismatch must fail the existing asset-loading and build verification.
- A missing canonical mask, a drifted public mask, or modified pixels inside the protected identity matte must fail automated verification.
- If outpainting produces an implausible sleeve, background leakage, duplicated anatomy, or a visible side seam, reject the asset instead of compensating with renderer code.
- If any target viewport cannot preserve both face visibility and arm margins, facial protection wins and the asset/composition returns for another Preview iteration.

## Test-First Verification

Before implementation, add failing tests for:

- the new `1350x1425` source and mask dimensions;
- exact pixel preservation inside the original protected identity and central-clothing matte;
- required left/right upper-arm mask landmarks and nearby forbidden background points;
- face/core mapping remaining aligned to the protected original frame;
- desktop arm landmarks staying inside `1440`, `1920`, and `2040` viewports;
- existing face, throat, collar, lower-clothing, mobile, and reduced-motion contracts remaining intact.

After implementation, run:

- focused particle, mask, asset, and composition tests;
- the complete Vitest suite;
- `npm run build`;
- the complete Playwright suite;
- one bounded visual pass at `1440x1000`, `1920x1080`, `2040x1080`, and `390x844`.

The visual pass must confirm organic shoulder/arm endings, no environment particles, unchanged identity, no facial text obstruction, and no regressions to the AI assistant or homepage layout.

## Deployment Boundary

- Work only on `feature/black-ui-redesign-20260802` in the existing isolated worktree.
- Do not alter `main`, the original homepage branch, or Production during implementation.
- Push and deploy a Cloudflare Preview only after all verification passes.
- Update Production only after the user explicitly accepts the new Preview.

## Out of Scope

- Redrawing or beautifying facial features.
- Changing hairstyle, glasses, jaw, neck, pose, or body proportions.
- Adding hands or forearms.
- Changing particle style, animation timing, homepage copy, navigation, project pages, résumé, or AI assistant behavior.
