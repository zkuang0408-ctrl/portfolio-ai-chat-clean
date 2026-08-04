# Recognizable Side-Profile Particle Portrait

## Goal

Replace the homepage's old front-facing portrait with the supplied black-and-white three-quarter side-profile glasses photograph while making Zhao Shikuang immediately recognizable. The result remains a pure Canvas particle portrait: it uses the real photograph's pixels and a precise subject mask, never a generated or visibly overlaid portrait.

## Approved Source and Subject Scope

The approved input is the user-supplied `1104 × 1425` black-and-white photograph uploaded on 2026-08-04. Its dimensions match the existing particle-mask canvas, so the current height-normalized desktop composition can remain intact.

The subject mask must retain:

- all visible hair, including fine outer strands where they can be separated reliably;
- the complete face and identity-bearing glasses;
- the chin, jaw shadow, complete neck, Adam's apple, collar, and clothing through the bottom edge;
- the subject's left and right shoulders where present in the photograph.

The mask must remove:

- the raised forearm and black sleeve at the far right, confirmed by the user as belonging to someone else;
- all wall, furniture, fixtures, shadows, and other environmental pixels;
- disconnected foreground fragments that are not part of the central subject.

## Asset and Mask Pipeline

Use a segmentation model only to obtain an initial alpha estimate. It must not generate, inpaint, redraw, beautify, or otherwise replace any portrait pixels. Refine the alpha mask manually around hair, glasses arms, jaw, neck, collar, shoulders, and the bottom garment boundary.

Commit the refined mask as a canonical bitmap source under `scripts/assets/portrait-subject-mask.png`. Update `scripts/build-portrait-mask.ts` to normalize that source deterministically to `1104 × 1425`, validate required and forbidden regions, and generate `public/portrait-particle-mask.png`. Production tests and builds must not download or execute the segmentation model.

Replace `src/assets/portrait.png` with the approved real photograph at its native `1104 × 1425` resolution. The image and mask remain hidden inputs; only the Canvas output is visible.

## Recognizability-First Sampling

The particle system must prioritize a recognizable likeness over uniform abstraction while preserving the existing editorial particle style.

Introduce source-normalized regions aligned to the new photograph:

- **Identity core:** glasses frames, eyes, eyebrows, nose bridge and nostril edge, lips, chin, and jawline. Candidates in this region receive a higher acceptance weight, strong luminance edges remain micro-particle-only, and final targets do not move away from their sampled landmark coordinates.
- **Neck continuity bridge:** the centered path from lower chin through the Adam's apple to the collar. Its light mapping combines the existing tonal negative with restrained source-light and edge contributions so middle-gray structure survives without becoming a uniform white field.
- **Outer subject:** hair tips, shoulders, and clothing. These retain looser clustering and restrained edge displacement so the portrait keeps its particulate silhouette.

Every sampled and displaced final target must remain inside the subject mask. The right-side arm exclusion and every other transparent mask region must produce zero settled particles.

## Preserved Particle Behavior

Keep the existing production profile unchanged:

- desktop budget: `14,000` particles;
- mobile budget: `7,000` particles;
- size distribution: `82%` micro, `15%` medium, `3%` large, `0%` splash;
- current radius and stretch ranges;
- black-and-white inverted luminance style;
- one `2.2s` entrance aggregation followed by a mostly settled portrait;
- reduced-motion behavior and restrained settled parallax;
- height-normalized desktop composition and current mobile composition rules.

The recognizability gain comes from regional acceptance, fixed facial-core targets, and neck tonal mapping rather than a higher total particle budget or a photo layer.

## Error Handling and Build Independence

Keep the current portrait fallback when the image, mask, Canvas context, or decoded dimensions are invalid. Mask verification must fail clearly when the canonical mask is missing, has the wrong dimensions, contains no visible subject, includes alpha in confirmed right-arm/background checkpoints, or omits required facial, neck, collar, and lower-garment checkpoints.

The committed source photograph and canonical mask are the only runtime inputs. Model-assisted segmentation is an authoring step and cannot become a production dependency.

## Test Strategy

Follow test-driven development for code changes:

1. Add failing tests for the `1104 × 1425` canonical mask, required subject checkpoints, forbidden background/right-arm checkpoints, and deterministic mask output.
2. Add failing sampler tests for the new identity-core geometry, fixed identity-core targets, neck-bridge middle-gray and edge contribution, and mask-contained final targets.
3. Update composition landmarks to the new photograph and verify the face, chin, neck, collar, and lower clothing remain complete at desktop sizes.
4. Preserve existing tests for particle quotas, no splash particles, mask containment, entrance timing, reduced motion, error fallback, navigation, AI assistant, and page structure.
5. Run the complete Vitest suite, mask verification, and production build.

## Visual Acceptance

Run Vite Preview and inspect settled screenshots at:

- `1440 × 900`;
- `1920 × 1080`;
- `2040 × 1026`.

At every size:

- the likeness is immediately legible from the glasses, eyes, nose, mouth, jaw, and hairstyle;
- the chin, jaw shadow, Adam's apple, neck, and collar read as a continuous structure;
- the face is intentionally denser and clearer than the clothing without becoming a field of uniform white dots;
- hair and garment edges remain particulate rather than looking like a cutout photograph;
- no particle appears in the wall, furniture, or removed right-side arm area;
- the complete subject composition remains visible according to the existing height-normalized desktop rule;
- homepage copy, navigation, AI assistant, project presentation, and all other page layouts remain unchanged.

Use one bounded batch of desktop screenshots, fix all visible defects together, and perform at most one confirmation batch. Run the Impeccable detector once over changed web targets after the implementation is visually complete.

## Out of Scope

- Generating, redrawing, retouching, or beautifying the person's identity.
- Displaying the source photograph or mask as a visible layer.
- Increasing the production particle budget or changing particle-size ratios.
- Changing homepage text, navigation, AI assistant behavior, project surfaces, résumé, or any other page layout.
- Modifying or merging the original website branch.
