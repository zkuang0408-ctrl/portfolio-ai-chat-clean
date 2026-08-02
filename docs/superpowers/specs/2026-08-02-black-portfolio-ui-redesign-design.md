# Black Portfolio UI Redesign

## Status

Approved design direction. Implementation must occur only on the isolated branch `feature/black-ui-redesign-20260802`; the original checkout, existing deployed site, and deployment configuration remain unchanged until explicit preview approval.

## Objective

Refine the existing near-black portfolio rather than replace its identity. The redesign must improve the homepage portrait, résumé scanability, project discovery, reader continuity, and AI availability while preserving all working content, RAG behavior, rate limits, generated project pages, and deployment paths.

## Audience and Success Criteria

Primary visitors are recruiters and design team leaders. A successful visit lets them:

1. understand Zhao Shikuang's positioning from the first screen;
2. scan a concise résumé on the second screen;
3. find and inspect all six projects in the confirmed order;
4. ask the grounded AI assistant from any location;
5. reach Zhao Shikuang without exposing private contact details.

## Confirmed Information Architecture

1. Black particle-portrait homepage.
2. Warm-light-gray landscape résumé panel on a black section.
3. `Selected projects.` section introduction.
4. Six rounded project selector cards.
5. Six vertical editorial project chapters.
6. Full-screen responsive image reader for each project.
7. Minimal black contact ending.

The project order is fixed:

1. INKSeat
2. EMOVUE
3. Fruit & Evolution
4. Atempo
5. UroSense
6. First Fly

## Visual System

- Preserve the pure/near-black environment, gray-white typography, monochrome imagery, restrained dark-red accent, and editorial serif display type.
- Do not adopt the discarded white Apple-style redesign. Apple references apply only to restraint, rounded geometry, motion quality, and interaction clarity.
- UI surfaces must recede behind the portfolio evidence. Avoid decorative glass panels unless they communicate an interactive layer.
- Use one coherent radius family: approximately 22–28px for major cards/panels and pill/circle geometry for compact controls.
- Use subtle 1px borders and restrained shadows. Avoid loud gradients, neon glows, and persistent animation.

## Persistent Navigation

- Desktop and mobile use the same fixed top navigation structure.
- Left: `赵实旷`.
- Right: `简介 / 作品 / 联系 / Ask AI`.
- The mobile version reduces typography and gaps instead of replacing navigation with a hamburger or bottom bar.
- Navigation remains visible while scrolling.
- Use a translucent black background with restrained blur and enough contrast over both the black sections and the light résumé panel.
- Respect mobile top safe-area insets.

## Homepage

### Composition

- Use the previously approved A composition: positioning statement in the upper region, particle portrait growing upward beneath it.
- Preserve the existing serif headline: `Crafting Future Through Objects & Systems.`
- Add one concise Chinese supporting sentence beneath the headline.
- Use the newly approved retouched three-quarter portrait as the particle sampling source.

### Particle Portrait

- Render particles only; never place the source photograph behind or beneath the particles.
- Face uses dense fine particles to preserve light, shadow, and identity.
- Hair and clothing use mostly fine particles with occasional larger particles.
- Edge density falls away organically; particle sizes must not be uniform.
- Separate subtle depth layers for eyes/glasses, nose/cheeks, face plane, hair, and shoulders.
- Run one complete aggregation on first homepage entry. After settling, the portrait is almost still.
- Cursor or device motion may create only restrained parallax. The effect must remain legible with no interaction.
- Reduced-motion mode shows the settled portrait immediately.

## Landscape Résumé

- Keep the confirmed B editorial split layout.
- The section remains black, containing a warm light-gray panel approximately 90% of the viewport width.
- The latest retouched black-and-white photograph occupies the left side; curated résumé content occupies the right.
- Use dark-red labels and rules to tie the light panel back to the black brand world.
- Expose only the approved contacts: `zkuang0408@gmail.com`, `2643414752@qq.com`, and `Shanghai, China`.
- Never expose a phone number or street address.
- Provide a link to the public sanitized résumé PDF.

### Transition

- Preserve a short black pause after the particle portrait.
- The résumé panel gently rises and becomes visible rather than switching the whole viewport to white.
- Use a warm gray, not pure white, to reduce contrast shock.
- Transition duration is approximately 400ms with confident natural deceleration.
- Reduced-motion mode removes the rise and retains the final layout.

## Project Discovery

### Section Introduction

- Preserve the black editorial title `Selected projects.` and section index treatment.

### Project Selector Cards

- Place six rounded selector cards immediately beneath the section title.
- Each card contains a controlled crop of the real project cover, project name, sequence number, and concise category.
- At widths of 1180px and above, desktop shows all six cards in one responsive row. Narrower desktop/tablet widths use a horizontal rail with a visible partial next card.
- Mobile cards use a horizontal rail that shows approximately 1.2 cards and supports touch swiping.
- Hover/focus scales the card to approximately `1.03`; the internal image may scale slightly more.
- Use transform and opacity rather than layout-changing width/height animation.
- Duration is approximately 200ms with natural deceleration and no bounce.
- Current/target project state uses a restrained dark-red line or dot.
- Activating a selector smoothly scrolls to the matching project chapter; it does not open the reader directly.

### Editorial Project Chapters

- Follow selector cards with six large vertical chapters in the fixed project order.
- Each chapter includes real project imagery, project name, one grounded value statement, role/contribution, and relevant metadata.
- Chapters prioritize evidence over generic marketing copy.
- The active chapter updates the selector state without stealing focus.

## Full-Screen Project Reader

- Reuse the existing generated responsive page-image pipeline and lazy loading.
- Do not return to browser-native PDF embedding or load a full PDF before first paint.
- Activating a chapter image expands it continuously into the full-screen reader.
- Give every project a stable, shareable URL and preserve browser history/back behavior.
- Returning restores the original project chapter and scroll position.
- Preserve the approved side controls: half-transparent `<` and `>` glyphs with no glass backing.
- Preserve current page / total page count while preventing overlap with project content.
- Support keyboard arrows, pointer input, and mobile swipe.
- Page transitions use approximately 220ms of restrained horizontal movement and opacity, not a page-flip effect.

## Persistent AI Assistant

### Collapsed State

- Default to a fixed particle-orb icon in the lower-right safe area.
- The orb shares the homepage particle language and remains legible over black and light résumé backgrounds.
- Hover/focus produces a small particle convergence; press feedback scales down approximately 3%.
- Do not pulse, glow, or loop continuously.

### Expanded State

- The orb morphs into a dark translucent chat panel using shared-element continuity.
- Desktop target size is approximately 400 × 560px with adaptive viewport limits.
- Mobile expands as a bottom sheet above the keyboard and supports downward swipe to collapse.
- Use a black glass surface, thin gray border, restrained dark-red focus/status treatment, and clear readable typography.
- Preserve all existing messages, source citations, suggested questions, request states, retry behavior, RAG grounding, and limits.

### Scroll and Collision Behavior

- When sustained page scrolling begins, an open panel collapses to the orb in approximately 180ms.
- Message history, draft input, and message scroll position remain intact.
- Approximately 250ms after scrolling stops, the orb returns to its normal visible state but the panel does not reopen automatically.
- The visitor must reactivate the orb to reopen the panel.
- The orb/panel must avoid reader arrows, page counters, mobile safe areas, the on-screen keyboard, and critical contact/project controls.
- Collision resolution moves the assistant upward or inward by the minimum necessary distance; it must not jump between unrelated anchors.

## Contact Ending

- Use a minimal full-width black ending section.
- Include a large editorial serif invitation, one concise collaboration sentence, the two approved emails, and `Shanghai, China`.
- Email actions use `mailto:` links.
- Do not add a contact form, phone number, or detailed address.

## Motion Thesis

- **Focal moment:** the single homepage particle aggregation.
- **Continuity:** résumé panel entrance, selector-to-chapter scroll, chapter-to-reader expansion, and orb-to-chat morph.
- **Feedback:** card hover/focus, reader navigation, assistant press/open/close, and loading/retry states.
- **Budget:** no persistent loops; isolate canvas work; stop expensive work when offscreen/hidden; prefer transforms and opacity; avoid layout-driven animation.
- Use confident natural deceleration such as `cubic-bezier(0.16, 1, 0.3, 1)`. Exit states are faster than entry states. No bounce or elastic easing.

## Component Boundaries

Keep each responsibility isolated:

- `navigation`: persistent responsive navigation and section state.
- `hero`: particle source preparation, sampling, animation, and reduced-motion settled state.
- `resume`: curated content and landscape/mobile layout.
- `project-selector`: quick navigation and active-section synchronization.
- `project-chapters`: evidence-led project introductions.
- `image-reader`: existing lazy page loading, history, controls, and failure recovery.
- `chat`: existing request/data logic plus a separate presentation state machine for orb, expanded, scrolling-collapse, and collision positions.
- `contact`: approved public contact actions.

Presentation changes must not modify provider selection, server prompts, retrieval, rate limiting, knowledge indexes, or deployment secrets.

## Data and State Flow

- Portfolio content continues to come from the typed content source and generated project page manifest.
- Selector activation resolves a project id and scrolls to the matching chapter.
- Intersection observation updates the active selector state.
- Reader activation records the source chapter/scroll position, updates history, opens the existing image reader, and restores state on exit.
- Chat presentation state is independent from chat request/session state. Collapsing never aborts a valid request unless the user explicitly cancels it.
- Scroll detection affects presentation only; it does not clear or restart chat data.

## Error and Edge Handling

- Missing or failed project page: show an inline retry action for that page without closing the reader.
- Project deep link with invalid id/page: fall back to the project index or first valid page and keep a clear status.
- Chat request failure: retain the last question and provide retry using existing safe diagnostics.
- Chat configuration unavailable: keep the portfolio fully usable and show a concise assistant-unavailable state.
- Canvas or motion unsupported: show the settled particle representation or a safe static particle fallback, never the source photo overlay.
- Very small screens: keep navigation readable, avoid horizontal document overflow, and use safe-area insets.
- Keyboard-only and reduced-motion paths must remain complete.

## Accessibility

- Maintain visible focus states for navigation, project cards, reader controls, chat controls, résumé link, and contact links.
- Provide meaningful labels for the particle portrait and assistant state without reading every particle.
- Meet readable contrast on black, warm gray, and translucent surfaces.
- Preserve semantic headings and logical document order.
- Respect `prefers-reduced-motion` and avoid motion-dependent comprehension.
- Keep touch targets at least 44px on mobile.

## Performance

- Lazy-load project chapter and reader images outside the initial viewport.
- Keep the first viewport limited to navigation, headline, particle source, and essential typography.
- Pause canvas animation when hidden or offscreen; after aggregation, render a stable frame unless subtle interaction is active.
- Do not add a motion dependency for effects achievable with CSS, the Web Animations API, or existing runtime code.
- Preserve existing generated 960/1800 responsive image strategy and immutable caching.

## Verification Strategy

- Unit tests for navigation state, project selector mapping, active chapter detection, reader history restoration, chat presentation state, scroll collapse, collision placement, and reduced-motion behavior.
- Existing unit tests for content, reader, chat, retrieval, rate limits, knowledge generation, and production safety must remain green.
- Build and asset-verification commands must pass.
- Browser checks at desktop and representative mobile widths must cover the complete route: homepage → résumé → selector → chapter → reader → AI → contact.
- Keyboard-only, reduced-motion, chat failure, page-image failure, and back-navigation scenarios require explicit checks.
- Visual review happens on a preview deployment before any production deployment.

## Non-Goals

- No white-site redesign.
- No replacement of project PDFs or authored knowledge.
- No new contact form.
- No change to AI provider, API keys, server deployment, rate limits, or retrieval architecture.
- No production deployment until the isolated preview is reviewed and explicitly approved.
