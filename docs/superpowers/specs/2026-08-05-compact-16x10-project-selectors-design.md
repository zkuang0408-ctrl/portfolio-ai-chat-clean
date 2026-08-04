# Compact 16:10 Project Selectors

## Goal

Make the six project-selection controls smaller while preserving each original PPT cover as a complete 16:10 image. Keep the existing black editorial visual language and all current navigation behavior.

## Scope

Change only the selector rail above the project chapters:

- `.project-selector-rail`
- `.project-selector`
- `.project-selector__media`
- `.project-selector__meta`

Do not change the project order, project copy, project readers, PDFs, page images, navigation, AI assistant, particle portrait, or other page sections. The large project reader retains its existing 16:9 stage because this request concerns only the project-selection controls.

## Approved Layout

### Wide desktop

- Keep six equal selector cards in one row.
- Give every selector image an explicit `aspect-ratio: 16 / 10`.
- Use `object-fit: contain` and a dark neutral image ground so the complete first PPT page remains visible without cropping.
- Remove the existing viewport-height-like media row sizing.
- Reduce the metadata area's minimum height and padding so the total card height is approximately 190–210px at a 1440px viewport instead of roughly 330px.
- Preserve readable project number/type and title text without overlaying it on the image.

### Intermediate widths

- Preserve the horizontal selector rail and scroll snapping below 1180px.
- Use compact, bounded card widths and the same 16:10 media ratio.
- Keep enough of the next card visible to communicate horizontal scrolling.

### Mobile

- Preserve horizontal scrolling and touch targets.
- Use a smaller width than the current 82vw card while keeping titles legible.
- Keep 16:10 media and compact metadata rather than introducing an image overlay.

## Interaction and Accessibility

- Keep selector elements as semantic anchors.
- Preserve click-to-scroll behavior and active state synchronization with visible project chapters.
- Preserve `aria-current`, keyboard focus, the oxide-red active border/dot, reduced-motion handling, and the restrained `1.03` hover/focus scale.
- Do not change focus order or DOM order.

## Visual Thesis

The PPT cover is the primary evidence, the project label is supporting orientation, and the selector rail is compact navigation rather than a second project gallery. The complete 16:10 cover should read first; metadata should remain quiet and close to its card. The reduced height creates a clear gap between the large “Selected projects” heading and the detailed project chapters.

## Testing and Verification

Write failing tests before production CSS changes. Verify that:

- selector media declares `aspect-ratio: 16 / 10`;
- selector images use `object-fit: contain`;
- old cropping and tall row-sizing rules are absent;
- desktop, intermediate, and mobile selector sizes remain compact;
- existing render and project-selector interaction tests still pass.

Run the focused tests, full Vitest suite, production build, Impeccable detector, and browser screenshots at representative desktop and mobile widths. Inspect the selector rail before making at most one bounded correction pass.
