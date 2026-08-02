# Centered Particle Hero Redesign

**Date:** 2026-08-02  
**Status:** User-approved design  
**Scope:** The first viewport only. The résumé, projects, reader, contact section, navigation behavior, and AI assistant behavior remain unchanged.

## Objective

Replace the current wide, diffuse particle silhouette with a recognizable portrait of Zhao Shikuang. The first viewport must follow the centered editorial composition of the user-provided Ashley reference: a monumental head-and-shoulders particle portrait occupies the full screen, identity information remains at the upper left, and the headline sits across the lower-right negative space with a slight overlap onto clothing particles.

The result must still be particle-only. The source photograph must never be visible as a composited layer.

## Approved Composition

The hero is a black `100svh` canvas beneath the fixed navigation. The portrait is centered horizontally and runs from near the top of the usable viewport to the bottom edge.

- Show the complete head, glasses, face, neck, shoulders, and upper clothing.
- Exclude the photographic background and the partial person visible at the right edge of the source image.
- On desktop, the face occupies approximately 30–36% of viewport width. The shoulders extend across approximately 62–72% of viewport width.
- The head begins around 10–14% of the usable hero height. The clothing continues beyond the lower viewport edge so the crop feels intentional.
- The identity block remains in the upper-left negative space.
- The main headline is anchored in the lower-right quadrant. It may overlap approximately 10–15% of the shoulder or chest particles, but it must never overlap the eyes, glasses, nose, mouth, or primary facial contour.
- Supporting copy stays beneath the headline within the same negative-space area.

The approved scale is the balanced option A from the visual companion. It preserves facial recognition without sacrificing the full shoulder-and-clothing silhouette.

## Source Isolation and Masking

Create a dedicated subject mask from `public/portrait-resume-retouched-v1.png` before browser rendering.

- The mask dimensions must exactly match the source image dimensions.
- Subject pixels use non-zero alpha; background pixels use zero alpha.
- The mask includes hair, face, glasses, ears, neck, shoulders, and upper clothing.
- The mask excludes the light room background and the unrelated person at the right edge.
- The browser loads the source image and mask together, but only particles generated from accepted mask pixels are drawn.
- The hidden source image remains non-visible and inaccessible to pointer interaction.
- If either image or mask cannot be decoded, the hero enters a typography-only fallback state. It must not reveal the photograph.

The mask is a production asset, not a runtime AI dependency. Runtime rendering remains deterministic and deployable as a static frontend.

## Particle System

Particles reconstruct the subject with different priorities by region.

### Facial Detail

- Use a dedicated facial feature region covering glasses, eyebrows, eyes, nose bridge, nostrils, lips, jaw, and the strongest light-shadow transitions.
- Favor micro particles in the face; micro and small particles together must account for at least 88% of facial particles.
- Increase sampling probability around high-contrast facial edges rather than distributing particles uniformly.
- Preserve tonal variation so cheeks, nose volume, eye sockets, and jaw remain dimensional.
- Glasses receive explicit edge emphasis because they are a primary identity cue.

### Hair and Clothing

- Hair density is high enough to preserve the hairstyle and parting, with sparse larger particles along the outer silhouette.
- Clothing is lower-density than the face and hair so the portrait gains visual hierarchy.
- Medium and occasional large particles may appear on hair and outer shoulder edges.
- Large particles must not cover the eyes, nose, lips, or central glasses area.

### Motion

- The portrait aggregates once on first entry over approximately 2.0–2.4 seconds.
- After aggregation, it becomes effectively still.
- Pointer parallax is limited to a maximum of 4 CSS pixels in either axis and must not degrade facial alignment.
- `prefers-reduced-motion` renders the settled state immediately.
- Resizing redraws the settled composition without replaying the entrance.

## Typography and Layering

- Retain the existing black editorial visual system, warm white display typography, oxide-red signals, and visible top navigation.
- Keep the identity and navigation readable over true negative space, not over dense particles.
- The headline remains above the canvas and may cross only the lower clothing region.
- A restrained dark text shadow or local canvas fade may be used beneath the headline to maintain contrast; no glass card or opaque text panel is introduced.
- The AI assistant stays above the hero and must not cover the headline at its collapsed or expanded sizes.

## Responsive Behavior

### Desktop and Wide Tablet

- Preserve the centered monument composition.
- Use the balanced A scale with complete head and strong shoulders.
- Maintain headline overlap only on the lower-right clothing area.

### Portrait Mobile

- Keep the portrait centered rather than converting to a split layout.
- Enlarge the face relative to the viewport; crop some shoulder width before reducing facial scale.
- Keep the head, glasses, chin, neck, and upper clothing visible.
- Move or scale the headline as needed so it avoids facial features, the fixed navigation, safe areas, and the AI orb.

### Short Landscape Mobile

- Maintain a centered or slightly right-shifted head-and-shoulders crop.
- Reduce supporting copy before shrinking the face below a recognizable scale.
- The title may overlap clothing but not the face.

## Architecture and Data Flow

1. The hero creates the hidden source image, hidden mask image, canvas, identity block, and headline layer.
2. The controller decodes both images and converts them to aligned pixel buffers.
3. The sampler rejects every pixel whose mask alpha is zero.
4. Accepted pixels receive region classification, edge weighting, particle size, tone, opacity, and deterministic scatter targets.
5. The renderer maps the portrait source bounds into a viewport-specific centered crop and draws the entrance or settled state.
6. Resize and reduced-motion paths reuse the same sampled subject and composition rules.

The mask concern belongs to image loading and sampling. The renderer remains responsible only for composition and drawing. This keeps the subject-isolation logic independently testable.

## Failure Handling

- Source or mask decode failure: typography-only hero; no visible photograph.
- Canvas unavailable: typography-only hero with the existing black background.
- Empty or invalid mask: treat as a controlled portrait failure rather than sampling the full image.
- Rendering error after initialization: stop animation listeners, retain navigation and text, and mark the portrait stage as failed for diagnostics.

## Verification

### Unit Tests

- Mask-alpha-zero pixels never create particle candidates.
- Empty and mismatched masks fail safely.
- Facial regions favor micro particles and prevent large particles on protected features.
- Clothing density remains lower than facial density.
- Composition calculations keep the portrait centered and preserve the approved crop across representative viewport sizes.
- Reduced-motion and resize paths render settled state without replay.

### Browser Tests

- Desktop viewports show the complete head, recognizable glasses and facial features, and clothing to the lower edge.
- Mobile viewports preserve the face before shoulders and avoid navigation, title, and AI-assistant collisions.
- The headline overlaps only the clothing region.
- The source photograph is never visible.
- A failed mask request leaves a usable typography-only homepage.

### Visual Review

Perform one bounded desktop-and-mobile screenshot review after implementation, fix all material composition defects in one batch, and run one confirmation pass. The acceptance reference is the user-approved balanced option A and the supplied Ashley layout image.

## Out of Scope

- Rewriting homepage copy.
- Changing the black visual identity or navigation.
- Modifying the résumé, project chapters, project reader, contact section, RAG knowledge base, or AI provider.
- Adding continuous ambient particle motion.
- Displaying the original photograph beneath or above the particle canvas.
