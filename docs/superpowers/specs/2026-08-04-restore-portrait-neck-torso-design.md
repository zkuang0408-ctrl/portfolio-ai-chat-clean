# Restore Portrait Neck and Torso Design

## Goal

Restore the visible particle continuity from the face through the neck into the clothing while keeping the approved full-screen composition and excluding the photographed environment.

## Locked visual behavior

- Preserve the current portrait scale, vertical position, horizontal centering, title, navigation, assistant, particle radii, particle quotas, entrance aggregation, parallax, and reduced-motion behavior.
- Keep the existing alpha subject mask as the hard boundary: no final particle may appear outside the subject mask.
- Preserve the tonal-negative treatment across the face, hair, eyes, and clothing.
- In the neck bridge only, retain a restrained portion of the source luminance so pale skin does not disappear after tonal inversion.
- The restored neck must remain quieter than the darkest hair and garment folds. It should connect the chin to the collar rather than become a bright filled shape.
- Clothing below the neck remains governed by the existing inverted luminance and particle hierarchy.
- The raised peripheral arm remains outside the primary portrait reading path; the centered head, neck, shoulders, and upper garment form the intended human silhouette.

## Implementation boundary

Add one pure luminance-mapping function in `src/particles/sampler.ts`. It receives source luminance and normalized sample coordinates, returns the existing inverted luminance outside the neck bridge, and returns the stronger of the inverted value and a restrained source-light contribution inside the neck bridge. `samplePortrait` uses this mapped light before acceptance and visual mapping.

No CSS, mask asset, renderer composition, copy, or layout files change.

## Verification

- Unit tests prove face, hair, clothing, and off-subject behavior retain the existing inversion.
- Unit tests prove bright neck samples receive enough mapped luminance to remain visible while staying below a dark garment sample.
- Existing mask tests prove final targets remain inside the subject mask.
- Desktop, mobile portrait, and short-landscape screenshots verify a continuous chin–neck–collar reading without background particles or new text collisions.

