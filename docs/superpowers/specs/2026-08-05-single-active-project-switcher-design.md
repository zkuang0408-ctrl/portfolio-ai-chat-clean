# Single Active Project Switcher

## Goal

Replace the six vertically stacked project chapters with one stable project display controlled by the compact selector rail. Manual selection, trusted AI source navigation, and direct reader routes must activate the same project state without losing each reader's page or load state.

## Scope

This change covers:

- flatter 16:10 project selector cards;
- one visible project chapter at a time;
- directional wipe transitions for manual project changes;
- trusted AI project-source activation and exact cited-page navigation;
- direct full-screen reader route activation.

It does not change project content, project order, PDFs, generated page assets, AI retrieval or answer generation, the portrait, résumé, navigation, or other site sections.

## Approved Interaction

### Manual selection

- INKSeat is the default active project.
- Clicking a selector changes the active project without scrolling the page.
- Moving to a later project reveals the incoming chapter from the right; moving to an earlier project reveals it from the left.
- The incoming wipe lasts approximately 280ms and uses the established ease-out motion language.
- `prefers-reduced-motion: reduce` changes projects immediately with no wipe.
- Clicking the already active selector does nothing and does not restart the animation.

### AI source navigation

- Existing source trust validation remains unchanged.
- Clicking a trusted project source first activates its project through the shared activation contract.
- The page then scrolls to the newly visible project chapter without forced smooth motion.
- If the source carries a page number, the existing page-open event sends the corresponding reader to that exact page after activation.
- If the source has no page number, the project activates and scrolls to its current reader page.
- Unknown, mismatched, or invalid sources remain inert.

### Direct reader routes

- Opening or restoring `#reader/<project>/<page>` activates the matching project before presenting its full-screen reader.
- Browser back/forward behavior and the existing reader URL contract remain unchanged.

## State Architecture

Create one small shared project-activation contract in the portfolio domain. It contains the activation event name, a validated `{ projectId }` detail shape, and a helper for dispatching the event from a portfolio root.

`startProjectSelector` owns the active project state:

- collect the six selectors and six existing chapter elements;
- keep every chapter mounted so each image reader retains its page, loading, error, and full-screen state;
- expose only the active chapter and apply `hidden` plus `aria-hidden="true"` to inactive chapters;
- keep `aria-current="true"` only on the active selector;
- listen for the shared activation event from AI source navigation and reader routing;
- remove the old IntersectionObserver, because vertical chapter visibility no longer defines the active project.

Manual selector clicks call the same internal activation function as external events. Manual activation calculates direction from the old and new project indices and adds a temporary transition data attribute to the incoming chapter. External activation may switch immediately before scrolling or opening a reader; it must never animate a hidden destination after the navigation action has begun.

## Markup and Accessibility

- Keep selector controls as anchors with their existing fallback `href` values.
- Add `aria-controls` from each selector to its matching chapter.
- Preserve DOM order and keyboard tab order.
- Keep each project reader and its metadata mounted inside its original article.
- Inactive articles use the native `hidden` attribute and `aria-hidden="true"`; the active article has neither.
- Invalid activation requests leave the current selector and chapter unchanged.
- The active selector retains the oxide-red border and dot.

## Flatter Selector Layout

The cover remains a complete 16:10 image with `object-fit: contain`.

- Desktop metadata minimum height: 52px.
- Desktop metadata spacing: approximately 2–3px gap with 8–10px vertical padding.
- Desktop selector total height at 1440px: approximately 178–182px.
- Intermediate selector width: bounded near 180–240px.
- Mobile selector width: at most 260px, retaining a visible preview of the next card.
- Project number/type and title remain outside the cover image and retain ellipsis protection.

## Directional Wipe

Only the incoming active chapter animates. The outgoing chapter is hidden before the incoming reveal, so six large readers are never composited simultaneously.

- Forward activation: reveal from the right with a restrained positive horizontal offset.
- Backward activation: reveal from the left with a restrained negative horizontal offset.
- Animate `clip-path`, opacity, and a small translation; do not animate project height.
- Remove the transition marker after `animationend` so later activations restart cleanly.
- Reduced motion disables the animation and transform.

## Error and Edge Handling

- Missing selectors, missing chapters, duplicate IDs, or unknown project IDs do not throw during user interaction; invalid activations are ignored.
- Cleanup removes selector, activation-event, and animation-end listeners.
- An AI source with a trusted project but an invalid page remains rejected by the existing source-navigation validation.
- Reader page state remains in the mounted reader controller when a project becomes inactive.

## Testing and Verification

Use TDD for each behavior:

- initial state exposes only INKSeat;
- manual click swaps visible chapters, updates `aria-current`, does not scroll, and records forward/backward direction;
- active selector clicks are idempotent;
- external activation selects the requested project;
- trusted AI sources activate before scroll and exact-page dispatch;
- direct reader routes activate before full-screen presentation;
- cleanup removes every new listener;
- CSS locks the flatter selector dimensions and both wipe directions;
- reduced-motion CSS removes wipe animation;
- existing reader state and navigation tests continue to pass.

Run focused tests, the complete Vitest suite, production build, one Impeccable detector pass, and one batched browser inspection at desktop, intermediate, and mobile sizes. Make at most one bounded correction pass.
