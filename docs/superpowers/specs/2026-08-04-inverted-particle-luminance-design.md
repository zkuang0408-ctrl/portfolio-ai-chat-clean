# Inverted Particle Luminance Design

## Objective

Reverse the portrait's tonal interpretation while preserving the approved black editorial homepage. Dark source features such as hair, eyes, facial shadow, and garment folds should produce the brightest and densest visible particles. Bright skin highlights should become quieter and more open.

## Visual Direction

- Keep the page background, navigation, typography, layout, and grayscale particle palette unchanged.
- Keep particles light gray to white so they remain visible on the exhibition-black background.
- Reverse the source luminance used by particle acceptance and particle visual intensity: `invertedLight = 1 - sourceLight`.
- Preserve edge strength from the original source. Absolute luminance gradients are invariant under inversion, so existing edge detail remains valid.
- Preserve the alpha mask as the only subject boundary. No particle may be introduced outside the approved head-and-clothing silhouette.

## Behavior

The inversion occurs once in the sampler after the source pixel luminance is read and before luminance thresholds, regional acceptance, alpha, and tone are calculated. Region classification, clustering, deterministic randomness, target displacement, size quotas, particle count limits, entrance aggregation, settled parallax, and reduced-motion behavior remain unchanged.

The renderer continues to draw grayscale particles using the sampler's tone and alpha. It does not apply a canvas filter or invert the entire page.

## Expected Result

- Hair, eyes, brows, nostrils, lip shadow, jaw shadow, and dark clothing structure become more prominent.
- Skin highlights and other bright areas become sparser without eliminating the protected facial structure.
- The result reads as a tonal negative made from light particles, not as a white-background photographic negative.

## Tests

- Add a focused luminance-inversion unit test proving that a dark source pixel produces higher particle acceptance and stronger visual output than a bright source pixel under equal region, edge, cluster, and random inputs.
- Preserve deterministic output, regional quotas, `MAX_PARTICLES`, alpha-mask confinement, and facial large-particle restrictions.
- Run the full unit suite and production build.
- Run the centered portrait geometry and fallback browser tests across all six configured viewports.
- Regenerate and inspect 1440×900, 390×844, and 667×375 screenshots after all browser tests finish.

## Non-goals

- No white page background or black particle palette.
- No change to portrait crop, mask, layout, typography, navigation, résumé, projects, or AI assistant.
- No additional user-facing toggle or theme control.
- No new particle motion or size distribution.

## Acceptance Criteria

1. The black editorial visual world is unchanged outside the portrait's tonal mapping.
2. Dark source features visibly dominate over bright source highlights.
3. The subject silhouette and all particle safety constraints remain intact.
4. Existing responsive geometry and collision tests continue to pass.
5. Final screenshots show a recognizable negative-toned portrait without face/title or title/assistant collisions.
