# Particle Facial Clarity Design

## Goal

Make the particle-only portrait read as a recognizable face at first glance without restoring a photographic underlay, flattening the portrait into a uniform dot grid, or weakening the irregular splash language around the hair and shoulders.

## Confirmed direction

Use **facial precision first**:

- eyes, eyebrows, nose, lips, and jaw structure must remain spatially accurate;
- the facial core is built predominantly from fine particles;
- hair, outer contour, shoulders, and peripheral spray retain irregular displacement and occasional large particles;
- the portrait source remains invisible in every state.

## Root cause

The existing sampler calculates facial tone from the source image but then moves even core particles outward by as much as 2.5% of source width. On the current 1024px source, this can move a facial sample roughly 25px horizontally. Bright particles surrounding the eyes, nostrils, and mouth therefore drift into dark landmark gaps and erase the negative-space structure that makes the reference portrait sharp.

The current acceptance formula also uses edge strength only to decide whether a particle is admitted. It does not protect edge samples after admission or guarantee that landmark edges receive micro particles. Adding more particles alone would fill more dark gaps and make the face denser rather than clearer.

## Sampling changes

### 1. Preserve core coordinates

- `core` particles settle at the sampled source coordinate with no horizontal displacement.
- Core vertical jitter is removed from the settled target.
- Entrance start positions remain scattered, so the one-time aggregation animation is preserved.

### 2. Reduce face drift

- `face` particles outside the core may move outward only slightly, capped at 0.6% of source width.
- Face target vertical jitter is capped at 0.35px in source coordinates.
- `edge` particles keep the existing broad 2-15% outward displacement and wider vertical variation.

### 3. Protect high-information edges

- Candidates with strong local luminance gradients receive higher admission priority inside the core and face.
- High-edge core candidates are assigned before low-edge candidates when size bands are distributed.
- Core candidates remain micro or medium; they never become large or splash.
- Strong-edge core candidates are always micro so eye, brow, nostril, lip, and jaw boundaries stay fine.

### 4. Increase landmark contrast

- Particle tone and alpha use a steeper luminance curve in the core.
- Bright facial samples become more legible, while dark landmarks remain black gaps instead of being filled by displaced particles.
- The renderer keeps grayscale output and does not add blur, glow, shadow, compositing, or a photographic layer.

## Particle distribution

The global approved distribution remains 65% micro, 25% medium, 8% large, and 2% splash. Distribution changes only in spatial assignment:

- core: micro and medium only, with strong-edge samples preferentially micro;
- face: micro and medium dominate; large particles are allowed only outside the core and away from strong facial edges;
- edge: absorbs all splash particles and most large particles;
- total budgets remain 14,000 desktop and 7,000 mobile.

This preserves the existing performance envelope and irregular overall silhouette.

## Animation and responsive behavior

- Keep the 2,200ms aggregation entrance.
- The settled target is the precision state; only the entrance origin is scattered.
- After aggregation, the portrait remains completely still.
- Reduced-motion users receive the same precise settled state immediately.
- Breakpoint resampling keeps the desktop/mobile budgets without replaying the animation.

## Error handling and accessibility

- The source image remains `opacity: 0` in normal, mobile, fallback, and error states.
- Canvas failure leaves a black portrait stage with the existing accessible status text.
- No fallback may reveal the source photograph.

## Testing

Unit tests must prove:

1. core settled targets equal their sampled source coordinates;
2. face drift never exceeds 0.6% of source width and 0.35px vertically;
3. edge displacement retains the existing broad splash range;
4. strong-edge core particles are assigned to the micro band;
5. core contains no large or splash particles;
6. the global 65/25/8/2 distribution remains exact;
7. tone and alpha remain finite and clamped;
8. existing deterministic seed, entrance, resize, reduced-motion, and particle-budget tests remain green.

Browser and visual checks must prove:

1. eyes, eyebrows, nose, and mouth remain readable at 1440x900 and 1920x1080;
2. the mobile portrait remains recognizable at 390x844 and 430x932;
3. the final Canvas stays stable after aggregation;
4. the source image has computed opacity `0` in all presentation states;
5. hair and shoulders retain uneven fine-particle clusters with occasional large splashes;
6. no page, console, response, or request errors occur locally or in production.

## Deployment

After unit tests, production build, the six-viewport Playwright matrix, and four screenshot reviews pass, redeploy to the existing Vercel project and preserve `https://portfolioweb-two-rho.vercel.app`.

## Design lock

- **Must improve:** landmark sharpness and first-glance facial recognition.
- **Must keep:** pure particles, irregular density, fine-particle majority, occasional large edge particles, one-time aggregation, still final frame.
- **Must avoid:** visible photo, uniform particle sizing, glow/blur effects, global density inflation, hard halftone posterization.
