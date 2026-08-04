# Height-Normalized Portrait Composition

## Goal

Make the external desktop-browser composition match the approved internal-browser reference: the particle portrait must keep the head, chin, neck, collar, and upper clothing visibly continuous at every desktop aspect ratio.

## Approved Reference

The internal-browser screenshot supplied on 2026-08-04 is the visual source of truth. Its portrait height is governed by the available viewport height rather than by viewport width. Wider windows may gain additional black space at the sides; they must not enlarge the portrait until the neck or clothing is cropped away.

## Composition Rule

- Preserve the existing mobile and short-landscape composition rules.
- On desktop, derive portrait scale from the usable canvas height using the existing desktop height factor of `1.16`.
- Keep the existing horizontal centering and vertical optical anchor.
- Do not allow viewport width, browser zoom, 2K displays, or ultrawide aspect ratios to increase the desktop portrait beyond this height-normalized scale.
- Continue drawing the complete masked subject only; no source-photo or environment overlay is introduced.

## Scope

Only the particle portrait composition calculation changes. Typography, navigation, headline placement, AI assistant, particle density, tonal inversion, mask geometry, entrance animation, project surfaces, and mobile interaction remain unchanged.

## Success Criteria

- At the internal reference size, the approved composition is unchanged.
- At `2040 × 1090`, the head, neck, collar, and upper clothing have the same vertical completeness as the internal reference.
- Desktop width changes alter side space, not the visible fraction of the subject.
- Existing mobile portrait and short-landscape compositions remain unchanged.
- A unit test fails under the width-driven implementation and passes with the height-normalized implementation.
- The full unit suite and production build pass.
- Screenshots at `1440 × 900`, `1920 × 1080`, and `2040 × 1090` show stable vertical composition.

## Out of Scope

- Repositioning or resizing the editorial headline.
- Changing portrait particles, mask, luminance, or animation.
- Modifying navigation or assistant behavior.
- Merging the isolated redesign branch into the original website branch.
