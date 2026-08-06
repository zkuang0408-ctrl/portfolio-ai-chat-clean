# Particle Chat Motion Design

## Scope

Improve the desktop AI assistant transition and align the expanded question panel with the existing particle orb language without changing copy, navigation, page content, mobile layout, or the portrait particle system's identity.

## Confirmed direction

- Use a lightweight edge-particle layer around the question panel: sparse fine particles along the perimeter and corners, with the text area left clear.
- Particles drift slowly while the panel is expanded and remain visually subordinate to the conversation content.
- During collapse, edge particles accelerate toward the docked orb and converge with its particle field, making the panel-to-orb relationship explicit.
- Keep the existing monochrome particle palette, black editorial surfaces, oxide-red labels, and no legacy star icon.
- Replace the panel's simultaneous blur-heavy collapse with a smoother approximately 380ms transform, scale, opacity, and particle-convergence sequence.

## Performance boundaries

- Precompute decorative particle positions; do not allocate or sort a new particle object array every animation frame.
- Cap the decorative layer's device-pixel ratio at 1.5 and target approximately 30fps while visible.
- Pause decorative drawing when the panel is hidden, the transition has settled, the document is backgrounded, or reduced motion is enabled.
- Preserve the main orb's existing slow rotation and reduced-motion behavior.

## State and interaction

- The expanded panel owns the decorative particle layer and keeps it pointer-transparent.
- The collapsing state drives a single progress value from panel-edge distribution to the docked orb target.
- The collapsed state leaves only the existing orb particle field active.
- Keyboard focus, drag behavior, message layout, loading state, and source navigation remain unchanged.

## Verification

- Unit tests cover the decorative canvas lifecycle, particle-count bound, expanded/collapsing/collapsed state visibility, and reduced-motion pause.
- CSS tests cover the absence of the old blur-heavy collapse filter and the edge-particle layer's pointer transparency.
- Browser verification checks a smooth expand/collapse at 1440×960 and 1024×1024, confirms the edge particles do not cover text, and checks the panel converges toward the orb.
- Run the full Vitest suite, production build, Impeccable detector, and `git diff --check`.
