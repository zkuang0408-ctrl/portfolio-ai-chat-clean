# Portrait Position and Scale Refinement Design

**Date:** 2026-08-04  
**Status:** Approved for implementation planning  
**Scope:** Homepage particle portrait composition only

## Objective

Move the approved particle-only portrait slightly upward and make it slightly larger without changing its identity, particle hierarchy, tonal treatment, animation, horizontal centering, or relationship with the rest of the homepage.

The refinement must improve the portrait's presence while remaining visibly restrained. It must not cause the hair, glasses, facial core, headline, supporting copy, navigation, or AI assistant to collide.

## Selected Approach

Adjust the source-to-canvas composition parameters inside `portraitCompositionFor` rather than scaling the rendered canvas with CSS.

This preserves native canvas sharpness, keeps particle and landmark geometry in one coordinate system, and lets existing browser tests continue to validate the real rendered position. CSS transforms are rejected because they would introduce a second geometry layer and could soften the particle output. A full crop-anchor redesign is rejected because it exceeds the requested refinement.

## Responsive Composition

Keep the existing three composition modes and horizontal centering. Replace their scale factors and viewport anchor as follows:

| Mode | Width factor | Height factor | Viewport Y anchor | Intended result |
| --- | ---: | ---: | ---: | --- |
| Desktop | `0.725` | `1.16` | `0.09` | Approximately 3.6% larger and 20–24px higher at 1440×900 |
| Mobile portrait | `1.13` | `0.80` | `0.095` | Approximately 2.6% larger and 10–14px higher at 390×844 |
| Short mobile landscape | `0.80` | `0.94` | `0.09` | Approximately 2.6% larger and 8–10px higher at 667×375 |

The composition remains:

```ts
const scale = Math.max(
  (width / source.width) * widthFactor,
  (height / source.height) * heightFactor,
);

const offsetX = (width - source.width * scale) / 2;
const offsetY = height * viewportYAnchor - source.height * 0.13 * scale;
```

The source landmark anchor (`0.13`) remains unchanged. This ensures the slight upward movement comes from a deliberate viewport adjustment plus the natural effect of the modest scale increase.

## Preserved Behavior

This refinement must not change:

- The M2 particle distribution: 82% micro, 15% medium, 3% large, 0% splash.
- Particle radius ranges, density, luminance inversion, mask containment, or facial-core protection.
- The one-time aggregation animation, settled state, parallax, or reduced-motion behavior.
- The centered horizontal portrait axis.
- Homepage copy, navigation, AI assistant, project readers, résumé, or contact sections.
- The permitted light overlap between the headline and the lower clothing field.

## Test Contract

Update the renderer composition unit test before implementation so it fails against the current parameters and passes only with the approved values.

The test must assert:

- Desktop uses width factor `0.725`, height factor `1.16`, and viewport Y anchor `0.09`.
- Mobile portrait uses width factor `1.13`, height factor `0.80`, and viewport Y anchor `0.095`.
- Short mobile landscape uses width factor `0.80`, height factor `0.94`, and viewport Y anchor `0.09`.
- Glasses remain horizontally centered within one pixel.
- Hair remains inside or naturally tangent to the visible portrait field.
- Chin remains visible.
- Desktop and short landscape clothing may continue below the viewport; portrait-mobile clothing remains within its existing crop contract.

Run the existing centered-portrait Playwright contract across all six configured viewports. No geometry or fallback case may fail.

## Visual Acceptance

Capture settled-state screenshots at 1440×900, 390×844, and 667×375 and verify:

- The portrait is perceptibly but not dramatically larger.
- The face sits slightly higher and reads as the primary visual object.
- The top navigation and role label retain clear breathing room.
- The glasses, eyes, nose, mouth, and jaw remain readable.
- The headline does not cover the protected face region.
- The supporting copy and AI orb remain unobstructed.
- No horizontal overflow or unintended canvas clipping appears.

## Files Expected to Change

- `src/particles/renderer.test.ts`
- `src/particles/renderer.ts`
- `DESIGN.md`

No CSS change is expected.
