# Mobile Home and Reader Controls Design

**Date:** 2026-08-11
**Status:** User-approved design, pending implementation plan
**Scope:** Mobile web only (`<= 760px`); desktop presentation and behavior remain unchanged

## Goal

Adapt the portfolio homepage and project reader for phone screens without diluting the existing black editorial identity. The first viewport must prioritize the particle portrait, keep the English and Chinese statements readable in exactly two lines each, preserve a visible AI entry card without covering the face or copy, and make the collapsed assistant orb visually correct over both dark and light surfaces. Mobile project-reader chevrons must regain the same visual proportion they have relative to the project page on desktop.

## Confirmed Direction

The approved homepage direction is the portrait-led **A3 bottom horizontal card** layout:

- the portrait remains the dominant first-view artifact;
- the headline and supporting Chinese copy sit above the AI entry card;
- the AI entry card spans the lower part of the viewport and may cover only lower garment particles;
- the card, face, headline, and Chinese copy never overlap one another;
- after the guide collapses, the assistant is represented by a transparent 56px particle orb;
- opening the assistant from the card or orb uses the current readable mobile panel size.

## Mobile Navigation

At phone widths, the fixed navigation becomes one compact row, including safe-area handling:

- left: `赵实旷`;
- right: `简介 / 作品 / 联系`;
- the redundant mobile `Ask AI` text trigger is hidden because the guide card and persistent orb remain visible and accessible;
- all navigation links retain at least 44px touch targets;
- desktop navigation markup and styling remain unchanged.

The navigation stays approximately 58px tall plus any top safe-area inset. It must not wrap into a second row at 320px.

## Mobile Hero Composition

The hero continues to occupy the initial phone viewport using `svh`/safe-area-aware sizing. It is divided into explicit non-overlapping zones:

1. compact navigation;
2. role label;
3. centered face-priority particle portrait;
4. headline and supporting-copy zone;
5. bottom AI guide-card zone.

The portrait keeps the existing mobile face-priority composition. Its head and glasses remain centered and unobstructed. Shoulders and clothing may continue behind the lower content zones, but no foreground control may cover the face.

### English headline

The factual copy does not change. The two existing spans become two indivisible mobile lines:

1. `Crafting Future`
2. `Through Objects & Systems.`

Mobile size is fluid at approximately `clamp(24px, 7.2vw, 30px)`, with the existing editorial serif treatment and restrained negative tracking. Each line uses `white-space: nowrap`; the containing width and font-size floor must keep both lines inside a 320px viewport.

### Chinese supporting copy

The factual sentence remains unchanged but is presented as exactly two mobile lines:

1. `从实体产品到智能系统，`
2. `以研究、交互与原型塑造未来体验。`

Mobile size is approximately `clamp(11px, 3.2vw, 13px)`. The two-line block sits below the English headline and above the guide card.

### Non-overlap contract

- The bottom guide card uses 12–16px inline margins and a safe-area-aware bottom inset.
- The Chinese copy clears the card by at least 16px.
- The headline clears the Chinese copy with normal editorial leading and never enters the card bounds.
- The card may overlap the lower garment particle field only.
- At 320px, font sizing may reduce within the approved clamps, but the browser must not create a third English or Chinese line.

## Compact Mobile AI Guide Card

The initial homepage assistant remains a card, but it is reduced to a horizontal mobile guide rather than the current tall recommendation panel.

The compact card contains:

- `ASK SHIKUANG · AI`;
- the orientation prompt `想先了解哪件作品？`;
- a clear `开始提问` action;
- a small particle cue that visually links the card to the later orb state.

The card uses 12–16px inline margins and remains between 76px and 92px tall. Its surface and CTA both expand the existing full mobile assistant panel; they do not immediately submit a recommendation. The full panel retains the current recommendations, composer, transcript, evidence, loading state, and readable maximum height.

Once the visitor scrolls beyond the existing collapse threshold, the guide becomes the 56px orb. Returning to the top may restore the compact guide card under the existing presentation rules. Chat draft, transcript, and guide state stay mounted through presentation changes.

## Adaptive Particle Orb

Only the mobile collapsed/transition orb changes from 76px to 56px. The interactive hit area remains at least 56px and therefore exceeds the 44px touch minimum.

### Visual rules

- Button, Canvas, and surrounding shell are transparent.
- Remove the solid `#050505` circular pseudo-element used behind collapsed, expanding, and collapsing states.
- Keep the particle Canvas above page content without adding a disc, halo, border, shadow, or backdrop blur.
- Continue using contrast blending so white particles appear white over black and invert to black over paper/light imagery.
- The expanded panel stays dark and the small header particle cue stays light.

The implementation should prefer the existing `mix-blend-mode: difference` path instead of adding section-specific JavaScript theme detection. This directly matches the required black/white inversion and also adapts over grayscale imagery.

### Interaction rules

- Dragging continues to follow the pointer directly.
- The orb docks left or right only after release.
- Docking keeps the orb inside safe viewport margins.
- Clicking opens the existing full-size mobile panel.
- Reduced-motion mode draws a static particle field.
- If Canvas is unavailable, expose a transparent, text-only `AI` control with the existing accessible label; do not reintroduce a filled circular fallback.

Desktop orb size, drag behavior, collapse/expand animation, and panel placement remain unchanged.

## Mobile Project-Reader Chevrons

The current mobile SVG size (`36×60px`) is visually too large relative to the 16:9 project page. Desktop remains `40×66px`.

For phone and phone-landscape readers:

- the reader stage becomes the mobile inline-size container and the visible SVG width uses `clamp(14px, 3.1cqw, 22px)` rather than a copied desktop pixel size;
- SVG height follows the existing `40:66` width-to-height proportion;
- typical 320–430px screens render approximately `14×23px`;
- wider phones and landscape views cap near `22×36px`;
- the aspect ratio of the desktop chevron is preserved;
- the transparent button target remains at least `44×44px`;
- edge inset uses `clamp(4px, 1.5cqw, 10px)` and respects safe-area insets;
- stroke, disabled state, click navigation, swipe navigation, keyboard navigation, and boundary behavior remain intact.

The visible glyph is proportional; the hit target is deliberately larger and must not be used as the visual size.

## Component Boundaries

- `src/hero/render-hero.ts`: introduce only the semantic wrappers or line spans required for the approved mobile zones; factual copy is unchanged.
- `src/styles.css`: own the mobile navigation, hero safe zones, guide-card presentation, 56px orb shell, transparent contrast behavior, and proportional reader chevrons.
- `src/chat/render-chat.ts`: add the smallest semantic hook required for the compact guide action if existing elements cannot express it cleanly.
- `src/chat/chat-presentation.ts`: preserve the state machine, drag/dock behavior, and chat state; change only mobile metrics or activation wiring if required.
- `src/chat/particle-assistant.ts`: preserve particle generation and rotation; do not redesign the particle field unless a test proves the transparent contrast behavior needs a minimal drawing adjustment.
- AI endpoint, retrieval, citations, session persistence, project selection, résumé content, and desktop layout are out of scope.

## Error Handling and Accessibility

- Navigation and assistant controls keep semantic buttons/links and accessible names.
- Touch targets remain at least 44px even when the visible chevron is smaller.
- The guide card and orb must remain keyboard-focusable.
- Canvas failure preserves access to the assistant through a transparent text fallback.
- Reduced motion removes nonessential transitions without removing content or controls.
- Safe-area insets protect the navigation, bottom guide card, expanded panel, and reader controls.

## Test-First Verification

Implementation starts with failing tests. Required contracts include:

1. mobile navigation stays one row and the redundant mobile `Ask AI` text entry is visually removed without removing assistant access;
2. English and Chinese hero copy expose exactly two intended lines each;
3. at 320×568, 390×844, and 430×932, the face, copy blocks, and compact guide-card bounds do not intersect;
4. the card intersects only the lower garment/portrait region where overlap is allowed;
5. the mobile collapsed orb is 56px and has no solid pseudo-element or opaque shell;
6. orb dragging, release docking, activation, expanded-panel size, reduced motion, and fallback remain functional;
7. mobile reader SVG size scales with the reader stage while its button remains at least 44×44px;
8. project click, swipe, keyboard, disabled-boundary, and error-state behavior remain unchanged;
9. desktop hero, assistant, and reader geometry retain their existing contracts.

Run the focused unit tests first, then the complete Vitest suite, production build, and Playwright suite. Perform one bounded visual batch at:

- 320×568;
- 390×844;
- 430×932;
- 667×375;
- representative desktop widths to prove no regression.

The final change is deployed to a Cloudflare Preview with the verified public chat endpoint. Production changes only after explicit user acceptance.
