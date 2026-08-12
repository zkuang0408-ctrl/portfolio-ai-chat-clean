# Mobile Navigation Height Design

## Goal

Reduce the mobile header's visual footprint and correct the active-link alignment while preserving the existing black editorial visual language.

## Scope

- Apply only at viewport widths of 760px or less.
- Set the navigation bar and every navigation item to a unified 36px height, plus the device top safe-area inset for the bar.
- Set each visible section link's minimum width to 36px.
- Keep the existing single-row brand and navigation layout, type sizes, labels, active state, and hidden mobile `Ask AI` navigation action.
- Do not change desktop navigation, homepage composition, portrait particles, projects, resume, or AI assistant behavior.

## Layout

The bar uses a 36px mobile navigation token. The brand and the three section links share the same 36px control height. Their horizontal padding and existing gaps remain unchanged unless real-browser verification proves that the narrower controls introduce clipping.

The active link no longer places its red indicator with the desktop percentage-based background. On mobile, the text and a one-pixel red underline form one centered visual unit. The underline is horizontally centered beneath the label, its top edge is 4px below the text line box, and the complete text-plus-line unit sits optically centered with a slight bias toward the top of the 36px control.

The hero and any other offsets that consume `--nav-height` inherit the new 36px value, so content continues to clear the fixed header without an obsolete 48px gap.

## Accessibility and Motion

- The user has explicitly selected a unified 36px touch target, accepting that it is smaller than the common 44px mobile recommendation.
- Keyboard focus styles and current-section indication remain unchanged.
- No new animation is introduced.

## Verification

- Add a failing CSS contract asserting a 36px mobile navigation token and 36px controls.
- Add a contract for the mobile active indicator's centered one-pixel line and 4px text gap.
- Verify the navigation and visible controls are 36px high, excluding safe-area inset, in representative portrait and short-landscape mobile viewports.
- Verify the active underline is horizontally centered beneath its label and separated from its text line box by 4px.
- Confirm the row stays single-line, has no horizontal overflow, and does not collide with homepage content.
- Run the focused tests, full unit suite, production build, and relevant mobile Playwright checks before updating the Preview deployment.
