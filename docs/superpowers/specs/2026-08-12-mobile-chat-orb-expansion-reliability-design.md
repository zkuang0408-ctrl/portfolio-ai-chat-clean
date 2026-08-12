# Mobile Chat Orb Expansion Reliability Design

**Date:** 2026-08-12  
**Scope:** Mobile viewport (`<= 760px`) only  
**Status:** Approved direction

## Goal

Make the mobile AI assistant feel directly connected to its particle orb and remain dependable while the visitor is browsing the ordinary project section. Tapping the orb must never show the Android blue tap rectangle, minor finger drift must still count as a tap, and the chat panel must open smoothly without being immediately collapsed by page or keyboard movement.

## Confirmed Problems

- The orb is deliberately excluded from the generic coarse-pointer tap rule, so Chromium reports the native highlight as `rgba(51, 181, 229, 0.4)`.
- Mobile expansion bypasses the existing `expanding` path and changes to the complete panel in the first frame, with no visible transition.
- The orb promotes movement to a drag at 8px and suppresses the following click. Small touch movement is more common while the project section is still scrolling.
- Input focus and visual-viewport updates happen after opening. Before keyboard state is detected, project-section scroll movement can race the collapse handler.

## Interaction Design

### Tap feedback

- The mobile orb uses a transparent WebKit tap highlight.
- Touch-down enlarges the orb smoothly to `1.04`; release returns it to `1`.
- A deliberate drag remains attached to the finger and keeps the existing edge-docking behavior.
- Touch movement is treated as a drag only after it exceeds 12px. Mouse behavior keeps its current precision threshold.
- Keyboard navigation retains the oxide-red `:focus-visible` outline. Removing the touch overlay must not remove accessible focus indication.

### Expansion

- The panel materializes from the tapped orb's actual on-screen center.
- The animation uses compositor-only transform and opacity: approximately `scale(0.12)` at the orb, then the existing full mobile panel.
- Arrival takes about 320ms with the site's existing confident ease-out curve and no bounce.
- The orb disappears into the opening surface rather than flashing a second mark.
- Input focus happens only after the opening transition finishes. The keyboard may still open automatically, but it must not distort the transition.

### Collapse

- Collapse follows the same spatial path in reverse and finishes slightly faster, around 260ms.
- The panel contracts toward the current dock point; the particle orb becomes visible at that point when the contraction completes.
- A new open/close request cancels the active transition and continues from the current visual state rather than waiting for stale timers.

### Scroll and keyboard reliability

- Scroll-collapse is suspended while an opening or closing transition is active.
- Scroll-collapse is also suspended as soon as the composer has focus, not only after visual-viewport keyboard detection catches up.
- Once the keyboard is active, the existing visual-viewport geometry and bounded scroll restoration remain authoritative.
- Ordinary project-section scrolling still collapses an idle, unfocused expanded panel after the existing threshold.

### Reduced motion

- With `prefers-reduced-motion: reduce`, the spatial scale animation is replaced by the existing immediate/short opacity behavior.
- Tap feedback does not scale under reduced motion.

## Implementation Boundaries

- Modify only the existing assistant presentation controller, assistant styles, their unit contracts, mobile browser regressions, and the durable design note.
- Do not change desktop panel placement, desktop orb dimensions, project content, project navigation, homepage typography, portrait particles, or AI request behavior.
- Do not introduce an animation dependency. Use the browser animation/runtime APIs already available to the Vite target.
- Preserve the mounted chat transcript and draft state throughout transitions.

## Verification

- Unit tests prove touch-versus-drag classification, transition lifecycle cleanup, delayed focus, and scroll guards.
- CSS tests prove transparent orb highlighting, restrained press scale, keyboard focus visibility, and reduced-motion behavior.
- Trusted mobile touch tests cover a stable tap, a 12px jitter tap, a deliberate drag, and opening from `#projects`.
- Real-browser timeline checks confirm intermediate transform/opacity values before the final expanded state.
- Run the complete Vitest suite, production build, and bounded mobile/desktop Playwright matrix before Preview deployment.
- Deploy only a Cloudflare Preview; Production remains unchanged until explicit acceptance.
