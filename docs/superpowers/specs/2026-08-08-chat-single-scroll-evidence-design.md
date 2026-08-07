# AI Assistant Single-Scroll Evidence Design

## Goal

Remove the nested scrollbar from the AI assistant so long answers read as one continuous conversation, and visually attach small source links to the latest assistant answer.

## Approved Scrolling Model

- The assistant panel remains the only vertical scroll container.
- The transcript no longer has its own maximum height or `overflow: auto` behavior.
- User and assistant messages expand naturally to their full content height inside the panel.
- Desktop and mobile use the same single-scroll model.
- Existing panel viewport limits, safe-area positioning, orb motion, panel collapse, and drag/dock behavior remain unchanged.

## Evidence Placement

- The source region lives inside the transcript flow immediately after the latest completed assistant answer.
- When a new question starts, the previous source links are cleared.
- When the new answer's sources arrive, the same source region moves to the end of the transcript so it follows that answer.
- Source navigation behavior and trusted source metadata remain unchanged.
- Reloaded history continues to restore messages only; source links remain ephemeral because they are not stored in session history.

## Visual Treatment

- Source controls become quiet text links rather than bordered cards.
- Source typography is approximately `8px`, with restrained tracking and muted color.
- Links wrap naturally below the answer bubble and remain left-aligned with assistant content.
- The visual label is small, but each source retains a sufficiently large interaction target through invisible block padding rather than a large visible box.
- Assistant and user message typography, bubble colors, and bubble radii remain unchanged.

## Accessibility

- The source container keeps its existing accessible label.
- Each source remains a native button with keyboard focus styling.
- Removing the transcript scrollbar does not remove or reorder messages for assistive technologies.
- Only the panel exposes vertical scrolling, preventing nested keyboard and touch scroll traps.

## Verification

- Controller tests verify that sources are inserted after the latest assistant answer and move after later answers.
- Render and style tests verify that sources are inside the transcript, the transcript does not scroll independently, and source links use the compact presentation.
- Full Vitest, production build, Playwright regression, and desktop/mobile browser checks must pass.
- A new Cloudflare Preview must be verified before any Production change.
