# AI Assistant Guide Progressive Disclosure Design

## Goal

Prioritize the conversation after the visitor sends a question while keeping the introductory guide and suggested questions easy to recover. Simplify the loading state and reduce the visual weight of instructional content without changing the established black editorial assistant, particle orb, panel motion, or chat backend.

## Approved Interaction

- The initial open state continues to show the assistant introduction, quick-start question, supporting description, and topic suggestions.
- The first submitted question automatically collapses the introduction and recommendation guide before the user message and loading state are rendered.
- The collapsed guide becomes one slim, in-flow control labeled `查看推荐问题` in Chinese and `View suggested questions` in English.
- Activating that control expands the original guide in place. Its accessible name and `aria-expanded` state reflect whether the guide is open.
- Any later question submission collapses the guide again.
- The guide and its collapsed control remain in normal document flow, so neither can cover the transcript, sources, composer, or status message.
- Existing chat history, retry behavior, source navigation, input clearing, panel collapse, particle-orb movement, and scroll behavior remain unchanged.

## Visual Treatment

- Add an approximately `10px` radius to the primary quick-start question while preserving the existing dark-red tint and restrained border.
- Reduce the guide-only visual scale by one step: smaller labels and explanatory text, tighter vertical rhythm, and slightly denser topic spacing.
- Preserve accessible pointer targets even when the visible typography becomes smaller.
- Do not reduce transcript, source, composer, input, or status legibility.
- The collapsed guide control is a quiet hairline row above the transcript, visually subordinate to messages and consistent with the site’s sparse editorial treatment.

## Loading State

- The assistant-side loading message contains only `正在查找作品依据` in Chinese or `Finding portfolio evidence` in English.
- Three animated dots follow the text and provide the only loading ornament.
- Remove the existing leading dot cluster and avoid duplicating the loading phrase in the persistent status area while a request is in progress.
- Reduced-motion mode keeps the three dots visible but static.

## Accessibility

- The guide toggle is a native button with `aria-expanded` and `aria-controls`.
- Collapsing the guide does not remove the recommendations from the DOM; it hides the controlled region from visual and keyboard interaction.
- Loading text remains present in the live transcript region so screen readers receive the same progress cue.
- Existing keyboard focus styles and minimum interaction targets remain intact.

## Verification

- Unit tests cover initial guide visibility, automatic collapse on first and later submissions, manual re-expansion, localized toggle copy, and the simplified loading message.
- CSS-level structure confirms the primary recommendation radius and compact guide state without changing message typography.
- Full Vitest, production build, and browser checks cover desktop and mobile chat states, including reduced motion.
- A fresh Cloudflare Preview deployment is required before Production changes.
