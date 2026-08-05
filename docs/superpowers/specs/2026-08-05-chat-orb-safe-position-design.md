# AI Assistant Orb Safe Position Design

## Scope

Refine the existing desktop AI assistant presentation without changing the homepage copy, navigation, portrait, project content, résumé content, or mobile bottom-sheet behavior.

## Confirmed behavior

- The particle orb defaults to the left edge on desktop.
- Its initial centre is 172px from the top of the layout viewport, placing the 76px orb at `top: 134px` with the existing 16px horizontal edge gap.
- Desktop content keeps a uniform 108px inline safe margin so the orb does not cover résumé, project, or contact content when docked on either side.
- The expanded guide or chat panel does not collapse on small incidental scroll movement.
- Collapse begins only after the page has moved 160px from the scroll position captured when the guide or expanded panel became active. This corresponds to roughly two conventional mouse-wheel steps while remaining usable with trackpads.
- Returning to the top of the page restores the guide and resets the scroll threshold.
- Manual orb dragging remains unchanged: the orb follows the pointer freely and docks to the nearest side only after release.
- Mobile behavior at 760px and below remains unchanged.

## Implementation boundaries

- Keep the threshold and initial dock position in the existing chat presentation controller.
- Use the existing desktop breakpoint and layout system for the 108px safe margin.
- Apply the safe margin to desktop portfolio sections and the résumé panel without altering their internal hierarchy.
- Preserve the existing panel-to-particle collapse animation, reduced-motion behavior, keyboard interaction, and content-avoidance calculation.

## Verification

- Unit tests cover the 172px initial centre, 160px cumulative scroll threshold, reset at page top, and retained right-side docking after manual placement.
- CSS tests cover the 108px desktop safe margin and confirm the mobile layout remains unchanged.
- Browser verification checks the first collapse and representative résumé, projects, and contact scroll positions at desktop sizes.
- Run the complete Vitest suite, production build, Impeccable detector, and `git diff --check`.
