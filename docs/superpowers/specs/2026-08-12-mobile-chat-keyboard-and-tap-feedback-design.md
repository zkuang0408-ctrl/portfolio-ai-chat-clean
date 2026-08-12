# Mobile Chat Keyboard and Tap Feedback Design

**Date:** 2026-08-12
**Status:** User-approved direction, pending implementation plan
**Scope:** Mobile web only (`<= 760px`); desktop presentation and behavior remain unchanged

## Goal

Keep the expanded AI assistant stable while a phone keyboard opens, resizes, scrolls, or closes the visual viewport. Remove the browser's blue touch highlight and replace it with restrained physical press feedback without weakening keyboard accessibility.

## Root Cause and Chosen Direction

The current mobile panel already derives a bottom inset from `visualViewport`, but every viewport resize and scroll event writes a new CSS value immediately. Keyboard animation therefore causes repeated layout updates. Those same browser-generated scroll events continue through the page-level assistant collapse logic, so the panel and document can compete while the keyboard is moving.

The approved solution keeps the existing document and chat state mounted, then coordinates keyboard motion through one mobile-only visual-viewport controller:

- coalesce visual-viewport resize and scroll signals into at most one update per animation frame;
- treat a focused chat input plus a meaningfully reduced visual viewport as keyboard-active;
- keep the expanded panel inside the visible viewport using stable top and bottom limits;
- ignore page-scroll collapse while the keyboard is active or settling;
- preserve the page's pre-keyboard scroll position and smoothly restore only browser-induced displacement after the keyboard closes;
- do not prevent input focus, text selection, transcript scrolling, or normal keyboard dismissal.

## Keyboard and Viewport Behavior

### Keyboard-active detection

Keyboard-active state requires all of the following:

1. mobile viewport (`<= 760px`);
2. the chat input is focused;
3. `visualViewport.height` is sufficiently smaller than the layout viewport to distinguish the keyboard from browser chrome noise.

The threshold must tolerate small address-bar changes. A reduction of roughly 120px or more is considered a keyboard opening; the implementation may express this as a tested helper rather than a magic inline condition.

### Stable expanded panel

While keyboard-active:

- the chat panel remains fixed within the current visual viewport;
- its top edge clears the navigation and visual viewport offset;
- its bottom edge clears the keyboard with a small safe gap and any safe-area inset;
- the transcript flexes to the remaining height and remains independently scrollable;
- the composer stays visible and does not jump between competing bottom offsets;
- successive visual-viewport events update CSS geometry only once per animation frame.

The visual viewport offset is part of the calculation. This prevents mobile browsers that pan the layout viewport on focus from placing the panel outside the actually visible region.

### Scroll stabilization

Before keyboard activation, record the current document scroll position. While the keyboard is active and during a short post-close settling window:

- page scroll events must not collapse the assistant;
- programmatic scroll correction must not trigger a presentation transition;
- user scrolling inside the transcript remains enabled.

After the keyboard closes, restore the recorded page position only when the displacement matches keyboard/browser viewport movement. Do not override a deliberate navigation or large user scroll. Restoration uses the browser's normal smooth scrolling only when reduced motion is not requested; reduced-motion users receive an immediate correction.

### Fallback

If `visualViewport` is unavailable, retain the existing mobile bottom-sheet behavior. Input and submission remain fully functional; no viewport lock or global body freeze is introduced.

## Touch and Focus Feedback

The browser's blue tap overlay is removed from mobile interactive controls with `-webkit-tap-highlight-color: transparent`. This applies to site buttons, links, project controls, assistant controls, recommendations, sources, and composer actions without changing their semantics.

Coarse-pointer press feedback replaces the highlight:

- press begins immediately on pointer down;
- the touched control scales to approximately `1.02` around its own center, matching the user's requested smooth enlargement;
- release returns to `scale(1)` over roughly 160–220ms with the site's restrained ease-out curve;
- controls that already use transforms must compose the feedback through a dedicated scale variable or inner element rather than overwriting layout transforms;
- the feedback must not move surrounding content or trigger horizontal overflow;
- disabled controls do not animate;
- dragging the particle orb keeps its existing drag feedback and is not given a second competing press transform.

Under `prefers-reduced-motion: reduce`, the scale animation is removed. The blue tap overlay remains removed, but state is communicated by the existing color/opacity treatment.

Keyboard focus is separate from touch feedback. `:focus-visible` retains a deliberate one-pixel oxide-red outline or equivalent visible ring. Pointer/touch focus must not show the former blue browser rectangle, while Tab navigation remains unambiguous.

## Component Boundaries

- `src/chat/chat-presentation.ts`: own keyboard-active detection, visual-viewport batching, scroll-collapse suspension, and cleanup.
- A small pure helper module may be introduced if needed to make visual-viewport geometry and keyboard thresholds deterministic and unit-testable.
- `src/styles.css`: own mobile panel geometry variables, tap-highlight removal, press scaling, focus-visible styling, reduced-motion behavior, and composer/transcript containment.
- `src/chat/render-chat.ts`: unchanged unless a semantic wrapper is strictly required to compose press transforms.
- AI endpoint, request handling, citations, session state, desktop assistant placement, homepage composition, portrait particles, résumé, and project content are out of scope.

## Accessibility and Interaction Guarantees

- Opening the assistant may continue to focus the chat input and show the keyboard.
- Input, IME composition, Enter submission, Shift+Enter, dismissing the keyboard, and transcript scrolling remain functional.
- No `preventDefault()` is added to ordinary touch activation.
- All existing 44px mobile touch targets remain intact.
- Keyboard users retain visible `:focus-visible` indication.
- Reduced-motion preferences remove nonessential scaling and smooth scroll.
- Cleanup removes every viewport, focus, and animation-frame listener to avoid duplicate controllers after remounting.

## Test-First Verification

Implementation starts with failing tests. Required contracts include:

1. keyboard-active detection ignores small browser-chrome height changes and recognizes a focused input plus meaningful visual-viewport reduction;
2. visual-viewport resize/scroll bursts produce one geometry write per animation frame;
3. visual viewport height and offset produce a panel entirely inside the visible mobile region;
4. page scroll cannot collapse the assistant while keyboard-active or during the settling window;
5. keyboard close restores browser-induced scroll displacement without overriding deliberate large scroll changes;
6. input, IME, submission, collapse, orb reopening, and transcript scrolling retain existing behavior;
7. mobile controls have no blue tap highlight and expose the approved press scale without changing their box geometry;
8. `:focus-visible` remains visible and reduced motion removes the scale transition;
9. desktop panel geometry, scroll collapse, and control feedback remain unchanged.

Run focused unit tests first, followed by the complete Vitest suite, production build, and Playwright. Browser QA must cover portrait and landscape mobile viewports, simulated visual-viewport resize/offset sequences, a real-device check where available, and representative desktop widths. Deploy only to Cloudflare Preview until the user explicitly accepts Production.
