# Portfolio Content and Particle Integration Design

## Goal

Turn the current single-screen identity experiment into a deployable one-page portfolio while preserving the approved particle-only portrait. The page must introduce Zhao Shikuang, present selected work from the audited workspace portfolio, expose a safe contact path, and make later image/PDF/PPT replacements data-driven.

## Evidence and design translation

| Evidence | Meaning | Design action | Validation |
|---|---|---|---|
| The approved reference is black, editorial, high-contrast, and portrait-led. | The homepage should feel like an identity statement rather than a conventional card grid. | Keep the black/white/red visual language, serif display headline, large negative space, and asymmetric editorial layout. | Desktop and mobile screenshots retain the same visual identity. |
| The user rejected a visible photograph beneath the particles. | Recognition must come entirely from particle density, tone, alpha, and placement. | Keep the photo only as an invisible sampling source; the Canvas is the only visible portrait layer in every state. | Computed opacity remains zero in normal, mobile, fallback, and error states. |
| The resume emphasizes industrial design, AI applications, interaction, and generative design. | The selected work should show both objects and systems. | Lead with Atempo, INKSeat, EMOVUE, UroSense, Fruit & Evolution, and First Fly. | The six projects cover interaction, AI systems, physical products, generative design, medical context, and future experience. |
| The workspace already contains audited project decks and preview images. | Existing work should be reused rather than recreated. | Use selected project-intro preview PNGs and the existing portfolio master files as the current content source. | Every card image and document link resolves in the production build. |
| The user will replace images, PDFs, and PPTs later. | Content maintenance must not depend on editing section markup. | Store project metadata and document URLs in one typed content module; render sections from data. | Replacing a record or asset path updates the page without structural changes. |
| The resume contains phone, QQ mail, Gmail, and a full address. | A public site needs a conservative privacy boundary. | Show only `zkuang0408@gmail.com` and `Shanghai`; do not publish phone, QQ mail, or street address. | Automated tests reject restricted personal data in rendered markup and shipped documents. |

## Information architecture

The site remains a single-page experience with real anchor navigation:

1. **Hero** - particle-only portrait, identity, positioning statement, and navigation.
2. **About** - concise Chinese/English profile, Tongji education, and three capability groups.
3. **Selected Projects** - six editorial project entries driven by a typed data array.
4. **Documents** - links to the current master portfolio PDF and PPTX, with stable filenames for later replacement.
5. **Contact** - Gmail link, Shanghai location, and a short collaboration statement.

Navigation links target `#about`, `#projects`, and `#contact`. The page uses smooth scrolling only when reduced motion is not requested.

## Selected projects

The first public version uses six projects in this order:

1. **Atempo / Breath Mirror** - breathing-guidance interaction and adaptive intelligent loop.
2. **INKSeat** - smart-cabin e-paper advertising terminal and explainable recommendation system.
3. **EMOVUE** - emotion-sensing wearable camera and AI editing workflow.
4. **UroSense** - medical-context urine measurement attachment and human-factors design.
5. **Fruit & Evolution / 果实与演化** - parametric food design and physical prototyping.
6. **First Fly** - future flight experience, body-scale reasoning, and concept storytelling.

Each project entry contains a number, title, type, one-line outcome, role, tags, image, and accessible alt text. Cards are not false links. They become links only when a real case-study destination is added later.

## Visual system

- Keep the current near-black background, warm-white text, muted gray, and dark red accent.
- Hero occupies the first viewport; later sections use a restrained editorial grid rather than rounded UI cards.
- Project images appear in wide frames with grayscale treatment at rest and recover modest color/contrast on hover-capable devices.
- Typography keeps the sans-serif information layer and italic serif display layer.
- Section numbers continue the existing identity language: `02 / ABOUT`, `03 / SELECTED WORK`, `04 / CONTACT`.
- Mobile stacks content in a single column, keeps type readable, and avoids horizontal overflow.

## Particle-only portrait

All requirements from `2026-07-15-particle-only-portrait-design.md` remain in force:

- 14,000 desktop and 7,000 mobile particles.
- 2,200ms one-time aggregation, then a stable final frame.
- Reduced motion renders the stable frame immediately.
- 65/25/8/2 micro/medium/large/splash distribution and protected facial regions.
- The source image remains decoded and sampled but is always visually hidden.
- Canvas, sampling, or decode failure leaves a black stage and an accessible status message; no photographic fallback is permitted.

## Content and asset architecture

- `src/content/portfolio.ts` owns typed profile, project, and document data.
- `src/portfolio/render-portfolio.ts` renders About, Projects, Documents, and Contact sections.
- `src/hero/render-hero.ts` renders only the hero and real anchor navigation.
- `src/main.ts` composes the hero and portfolio sections, then starts the particle controller.
- `public/projects/` contains stable web image filenames.
- `public/documents/` contains stable master portfolio filenames.

The current asset mapping uses audited master-deck intro pages:

- Atempo: `slide-11.png`
- INKSeat: `slide-14.png`
- EMOVUE: `slide-17.png`
- UroSense: `slide-05.png`
- Fruit & Evolution: `slide-26.png`
- First Fly: `slide-21.png`

## Accessibility and privacy

- Anchor links have visible focus states and descriptive labels.
- Decorative project numbering is hidden from assistive technology where appropriate.
- Project images have meaningful alt text.
- Source portrait image uses empty alt text and `aria-hidden="true"`.
- Contact uses a direct `mailto:` link.
- Phone number, QQ email, and full address from the resume are not published.

## Error handling

- Portrait failures use the existing controlled error class and accessible status text while preserving the black stage.
- A missing project image displays its alt text without breaking layout.
- Document links use stable local assets so they do not depend on external services.
- No case-study control is rendered unless its destination exists.

## Testing and acceptance

Automated unit tests must cover:

1. source portrait image is marked decorative and navigation uses real anchors;
2. restricted personal data is absent;
3. all six projects and stable document paths come from the content module;
4. rendered sections include headings, tags, roles, accessible image alt text, and Gmail contact;
5. base image CSS opacity is zero in normal, mobile, fallback, and error selectors;
6. existing particle sampling, distribution, entrance, resize, and reduced-motion tests remain green.

Playwright must verify:

1. the Canvas is substantial and stable after aggregation;
2. the base image has computed opacity `0` on desktop and mobile;
3. About, Projects, document links, and Contact are reachable through navigation;
4. all local images and downloadable documents return successful responses;
5. no horizontal overflow or browser/runtime/request errors occur;
6. the required 1440x900, 1920x1080, 390x844, and 430x932 screenshots show no photographic underlay and have readable portfolio sections.

## Deployment

After tests, build, and screenshot inspection pass, deploy to the existing Vercel project and preserve `https://portfolioweb-two-rho.vercel.app`. Do not bind a custom domain or modify GitHub state.

## Design lock

- **Direction:** particle-only editorial portfolio.
- **Must keep:** black/white/red palette, recognizable particle portrait, one-time aggregation, data-driven content, six-project selection, safe public contact.
- **Must avoid:** visible photo underlay, evenly sized particles, generic rounded dashboard cards, false project links, publishing phone/QQ/full address.
- **Creative assumption:** English display copy is retained for the international editorial tone, while supporting descriptions remain concise and bilingual where useful.
