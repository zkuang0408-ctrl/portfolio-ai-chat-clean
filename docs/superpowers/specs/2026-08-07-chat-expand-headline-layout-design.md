# Chat Expansion and Hero Headline Design

## Scope

This change has two bounded desktop goals:

1. Expand the AI chat panel from the docked particle ball using the same spatial scale relationship as the existing collapse animation.
2. Recompose the homepage hero copy so the English headline occupies exactly two lines and the Chinese supporting sentence occupies one line, while allowing the copy to overlap the lower-right portrait particles.

The portrait renderer, particle-ball appearance, assistant content, navigation, project sections, résumé, and mobile information architecture remain unchanged.

## Chat expansion motion

Desktop opening from the collapsed ball gains an `expanding` presentation state. The panel starts at the dock-side transform used by `collapsing`: `translate(-28px, -50%) scale(0.12)` on the left and the mirrored positive translation on the right. On the next animation frame it enters `expanded`, reaching the existing full-size raised position over 380ms with the shared ease-out curve. Opacity rises during the same transition.

The panel remains mounted throughout the transition, retains its conversation and draft state, and receives pointer interaction only after it is expanded. The docked ball stays visible while expansion begins and then yields to the panel. Reduced-motion and mobile paths continue to open immediately without the desktop scale sequence.

Opening from the initial homepage guide remains direct because the guide is already a visible panel rather than a docked ball.

## Hero headline composition

On desktop, the English headline uses two authored lines:

1. `Crafting Future`
2. `Through Objects & Systems.`

The Chinese supporting sentence stays unchanged and is kept on one desktop line. The headline container becomes wide enough for the second line at the supported 1440, 1920, and 2040 desktop viewports. Its left edge may enter the portrait field so the typography can cover a restrained portion of lower-right portrait particles. The text remains above the Canvas in stacking order; the portrait itself is not moved, masked, or cropped.

Below the desktop breakpoint, both English and Chinese copy may wrap to avoid viewport overflow and preserve readable margins.

## Accessibility and performance

- Expansion uses only `transform` and `opacity`; it does not add blur, `clip-path`, panel particles, or a new animation dependency.
- `prefers-reduced-motion: reduce` bypasses the intermediate desktop expansion state.
- The headline remains a single semantic `h1`, and the Chinese supporting copy remains a paragraph.
- The animation is interruptible by cleanup and does not leave stale timers or animation-frame callbacks.

## Verification

- Unit tests verify the `expanding` state occurs before `expanded`, preserves the existing panel DOM, and is bypassed for reduced motion.
- Style tests verify mirrored expansion transforms, 380ms transform timing, two authored English line spans, and a one-line desktop Chinese rule with a mobile wrapping override.
- Production build and the full test suite must pass.
- Browser checks at 1440×960, 1920×1080, and 2040×1152 confirm two English lines, one Chinese line, controlled portrait overlap, and a smooth ball-to-panel expansion.
