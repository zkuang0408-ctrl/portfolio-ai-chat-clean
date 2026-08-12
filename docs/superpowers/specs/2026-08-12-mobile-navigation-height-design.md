# Mobile Navigation Height Design

## Goal

Reduce the mobile header's visual footprint so it no longer feels excessively tall, while preserving reliable touch interaction and the existing black editorial visual language.

## Scope

- Apply only at viewport widths of 760px or less.
- Set the navigation bar's visual height to 48px, plus the device top safe-area inset.
- Keep every navigation link's minimum touch height at 44px.
- Keep the existing single-row brand and navigation layout, type sizes, labels, active state, and hidden mobile `Ask AI` navigation action.
- Do not change desktop navigation, homepage composition, portrait particles, projects, resume, or AI assistant behavior.

## Layout

The bar uses a 48px mobile navigation token and vertically centers its existing 44px controls. Its horizontal padding remains unchanged unless real-browser verification proves that the 48px height introduces clipping; no horizontal redesign is part of this change.

The hero and any other offsets that consume `--nav-height` inherit the new 48px value, so content continues to clear the fixed header without an obsolete 58px gap.

## Accessibility and Motion

- The 44px minimum touch target remains intact.
- Keyboard focus styles and current-section indication remain unchanged.
- No new animation is introduced.

## Verification

- Add a failing CSS contract asserting a 48px mobile navigation token and 44px controls.
- Verify the navigation is 48px high, excluding safe-area inset, in representative portrait and short-landscape mobile viewports.
- Confirm the row stays single-line, has no horizontal overflow, and does not collide with homepage content.
- Run the focused tests, full unit suite, production build, and relevant mobile Playwright checks before updating the Preview deployment.
