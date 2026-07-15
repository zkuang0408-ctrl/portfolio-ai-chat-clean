# Particle-Only Portrait Design

## Goal

Replace the current photographic-underlay composition with a genuinely particle-only portrait. In every normal, reduced-motion, resized, and error state, the source photograph must remain visually hidden. The photograph continues to exist only as an internal pixel source for particle sampling.

## Confirmed visual direction

- The black background is visible between particles; there is no translucent skin, hair, shirt, or photographic silhouette below the Canvas.
- Facial structure comes only from particle density, grayscale tone, alpha, clustering, and edge placement.
- The result should resemble the approved reference: a recognizable, high-contrast stippled face with deep black shadow gaps.
- Particle sizing remains exactly 65% micro, 25% medium, 8% large, and 2% splash.
- Core facial landmarks never receive large or splash particles; the wider face never receives splash particles.
- Large particles remain concentrated around hair, outer contour, shoulders, and dispersed edge splashes.

## Rendering and layering

The existing `<img class="portrait-base">` remains in the DOM because `imageToPixels()` needs a decoded source image. It is not a presentation layer:

- `.portrait-base` is always visually hidden with zero opacity, including mobile, fallback, and error states.
- It is non-interactive and hidden from assistive technology.
- `.portrait-canvas` is the only visible portrait surface.
- The Canvas keeps the existing `object-position`-equivalent 18% vertical alignment.
- The renderer keeps grayscale particles, but final visual tuning may raise particle contrast or adjust tone/alpha mapping if the particle-only face is too dim after the underlay is removed.

## Failure behavior

No technical fallback may reveal the source photo. If Canvas creation, image decoding, sampling, or drawing fails:

- hide the Canvas;
- keep the portrait area black;
- expose a concise status message to assistive technology;
- retain identity and headline content so the homepage remains usable.

The source image may still load invisibly so sampling can recover on a future reload; it must never fade in as a visual substitute.

## Accessibility

- The hidden source image uses an empty alt value and `aria-hidden="true"`.
- The portrait stage keeps its descriptive label.
- Canvas remains decorative to screen readers because the stage already provides the portrait label.
- Error status text remains available to assistive technology even when it is visually subtle.

## Animation and responsive behavior

- Keep the one-time 2,200ms aggregation entrance.
- After aggregation, the Canvas remains still with no active animation frames.
- Reduced-motion users see the settled particle-only portrait immediately.
- Desktop uses 14,000 particles and mobile uses 7,000.
- Crossing the 760px breakpoint resamples the correct budget and redraws the settled state without replaying the entrance.

## Verification

Automated checks must prove:

1. The base image has computed opacity `0` in normal desktop and mobile states.
2. Fallback and error classes do not make the base image visible.
3. The Canvas contains a substantial particle drawing, not a blank or single-pixel result.
4. The final Canvas is stable after the entrance.
5. The 65/25/8/2 distribution and facial-region restrictions remain intact.
6. Four required visual QA screenshots (1440x900, 1920x1080, 390x844, 430x932) show a particle-only face with no photographic underlay.
7. The deployed Vercel page has zero page, console, failed-response, or request errors on desktop and mobile.

## Deployment

After local unit, production E2E, build, and visual review pass, deploy to the existing Vercel project. Preserve the public alias `https://portfolioweb-two-rho.vercel.app`. Do not bind a custom domain or change GitHub state.
