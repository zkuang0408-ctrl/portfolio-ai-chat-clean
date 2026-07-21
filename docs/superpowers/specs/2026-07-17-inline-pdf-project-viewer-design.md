# Inline PDF Project Viewer Design

Date: 2026-07-17

## Objective

Replace each selected project's single preview image with a complete, in-page PDF reader. The reader must preserve the current portfolio's alternating project-card rhythm, work on desktop and mobile, expose every page in all six PDFs, and remain suitable for the existing Vercel deployment.

The hero, particle portrait, About section, Contact section, and existing complete-portfolio PDF/PPTX download area remain unchanged.

## Project order and source documents

The selected work section uses this fixed order:

| Number | Project | Source PDF | Pages | Public filename |
| --- | --- | --- | ---: | --- |
| 01 | INKSeat | `E:/codex/zupingji/1/inkseat.pdf` | 18 | `inkseat.pdf` |
| 02 | EMOVUE | `E:/codex/zupingji/1/EMOVUE.pdf` | 19 | `emovue.pdf` |
| 03 | Fruit & Evolution | `E:/codex/zupingji/1/演化果实.pdf` | 25 | `fruit-evolution.pdf` |
| 04 | Atempo | `E:/codex/zupingji/1/交互.pdf` | 20 | `atempo.pdf` |
| 05 | UroSense | `E:/codex/zupingji/1/医院心内科病房场景下的智能尿量检测附件.pdf` | 25 | `urosense.pdf` |
| 06 | First Fly | `E:/codex/zupingji/1/第一飞行.pdf` | 28 | `first-fly.pdf` |

The six PDFs contain 135 pages in total. Each source file is copied without page removal, recompression, or content alteration to a stable ASCII public path under `/projects/pdfs/`.

## Chosen rendering architecture

Use a locally bundled PDF.js display layer and worker. Do not use a CDN, native browser PDF iframe, or pre-rendered page-image set.

Reasons:

- PDF.js provides reliable control of previous/next navigation, page count, responsive rendering, and error states.
- Original documents remain intact and downloadable.
- The six PDFs add about 39.51 MB; the estimated source deployment becomes about 54.96 MB, below Vercel Hobby's current 100 MB CLI static upload limit.
- Lazy document loading keeps the homepage's initial network cost independent of the six PDFs.
- Rendering only the current page avoids keeping 135 page canvases in memory.

PDF.js and its worker are bundled locally as project dependencies. The worker URL must be emitted by Vite and remain same-origin in production.

## Component boundaries

### Portfolio content data

Extend each project record with:

- stable PDF URL;
- expected page count;
- accessible PDF title.

Reorder the existing records to match the approved sequence. Keep the current project summaries, roles, and tags.

### Project markup

Replace each `.project-media` image with a focusable `.project-reader` containing:

- a fixed-ratio 16:9 canvas stage;
- a loading state;
- an error state with retry and original-PDF link;
- left and right controls;
- a centered page counter below the stage.

Project copy remains beside the reader on desktop and below it on mobile. Alternating desktop alignment remains intact.

### PDF reader controller

Each project reader owns independent state:

- `idle`, `loading`, `ready`, or `error` status;
- loaded PDF document proxy;
- current page number;
- total page count;
- active render task;
- adjacent-page cache or prefetch promise.

The reader exposes bounded previous/next operations, retry, focus-aware keyboard navigation, and touch-swipe navigation. Rapid navigation cancels or supersedes stale render work so only the latest requested page is committed to the canvas.

## Visual specification

The approved reader is the inline card layout, not a modal and not a full-width standalone section.

The navigation controls use custom SVG chevrons rather than text glyphs:

- approximate included angle: 100 degrees;
- desktop visual area: about 40 by 66 px;
- stroke width: 2 px;
- default color: neutral gray at 58% opacity;
- no circle, background, border, shadow, or backdrop blur;
- chevron tip: about 4 px inside the PDF page edge;
- vertically centered in the page stage;
- hover/focus state becomes more opaque without adding a background.

The invisible pointer target remains large enough for reliable input. Mobile uses a slightly smaller visual glyph while preserving an accessible touch target.

The counter uses a zero-padded form such as `01 / 18` and sits centered below the PDF stage. The current page crossfades subtly after a completed render. There is no page-wrap behavior: previous is unavailable on page 1, and next is unavailable on the final page.

## Input behavior

- Pointer: click the left or right chevron.
- Keyboard: when a reader contains focus, Left Arrow and Right Arrow change its page.
- Touch: a deliberate horizontal swipe changes page; vertical scrolling remains available.
- Boundary state: the unavailable chevron remains positioned but becomes less opaque, receives `aria-disabled="true"`, and performs no action.
- Independent state: navigating one project does not reset any other project reader.

## Loading and performance

- Use `IntersectionObserver` to initialize a PDF only when its project approaches the viewport.
- The initial hero and About content do not request the project PDFs.
- After rendering the current page, request adjacent page data opportunistically.
- Render at device-pixel-aware resolution for sharp text, with a maximum backing-store scale to bound mobile memory use.
- On resize, re-render the current page at the new display size without changing its page number.
- Do not retain rendered canvases for all pages.

## Error handling

Reader failures are isolated per project.

- During metadata or first-page loading, show a quiet dark placeholder with a loading label.
- If loading or rendering fails, show a retry button and an `Open original PDF` link.
- Retrying resets only that reader's failed task.
- A failed reader does not prevent other projects or the rest of the homepage from rendering.
- Mismatches between configured and actual page counts are treated as test failures; the runtime counter uses the PDF document's authoritative `numPages` value.

## Accessibility

- The reader is keyboard focusable and has an accessible label containing the project title.
- Previous and next controls have project-specific `aria-label` values.
- Status changes use a polite live region without announcing every canvas repaint.
- Canvas has a useful accessible description and the original PDF link remains available in the error state.
- Focus treatment is visible but does not add a permanent background behind the chevrons.
- Reduced-motion users receive an immediate page replacement without crossfade.

## Testing and verification

### Unit tests

- Project order, PDF URL, and expected page count for all six projects.
- Reader state transitions and bounded page navigation.
- First-page and final-page disabled controls.
- Stale render cancellation during rapid navigation.
- Retry after document or page-render failure.
- Resize keeps the current page and requests a new render scale.
- Touch threshold distinguishes horizontal page navigation from vertical scroll.

### Browser tests

- Six project readers appear in the approved order.
- Each reader reports the correct total page count: 18, 19, 25, 20, 25, and 28.
- Previous/next controls render, update the counter, and respect boundaries.
- Keyboard navigation works only for the focused reader.
- Mobile swipe navigation changes one page without blocking normal page scroll.
- Lazy loading prevents all six PDFs from being requested during the initial hero load.
- Loading failure exposes retry and original-PDF fallback without browser errors.
- Desktop and mobile screenshots verify the approved 100-degree, 2 px, 4 px inset chevrons.

### PDF and production checks

- `pdfinfo` or PDF.js verifies the authoritative page count for every copied source PDF.
- Representative first, middle, and last pages from every PDF are rendered and visually inspected for clipping, missing type, incorrect orientation, or low resolution.
- Production build and full Playwright suite pass.
- The deployed public alias returns HTTP 200 for all six PDFs and the emitted PDF.js worker.
- Production smoke verifies one full first-to-last navigation path and one mobile swipe path.

## Out of scope

- PDF zoom controls;
- thumbnail strip;
- fullscreen or modal reader;
- annotations or selectable text layer;
- changing PDF content;
- changing the hero, About, Contact, or existing complete-portfolio downloads.

