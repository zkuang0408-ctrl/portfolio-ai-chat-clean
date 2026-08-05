# Particle AI Assistant Design

## Goal

Transform the existing portfolio assistant from a generic floating chat panel
into a visible homepage guide that collapses into the same monochrome particle
language as the portrait, remains available as a draggable edge-anchored
particle ball, and expands into a structured, conversational AI interface.

## Scope

This change includes the assistant's homepage placement, particle lifecycle,
drag-and-snap behavior, expanded conversation UI, recommendation hierarchy,
and message/loading feedback. It preserves the existing SSE protocol, trusted
source navigation, retrieval behavior, project readers, navigation, portrait,
and all non-chat page sections.

## Homepage Guide

- On the desktop homepage, show the assistant as an already-visible guide card
  in the left information zone, below the role label and clear of the portrait.
- The guide identifies itself as `ASK SHIKUANG · AI`, explains its grounded
  portfolio-only scope, offers one primary quick-start prompt, and exposes the
  grouped secondary prompts.
- The guide remains an HTML panel so its text, focus order, and controls are
  accessible. Its particle appearance is supplied by a dedicated decorative
  Canvas layer, never by hiding the actual controls.
- On narrow viewports, keep the assistant directly discoverable in a compact
  in-hero guide without covering the primary headline or portrait face.

## Recommendation Hierarchy

The initial expanded card uses three information levels:

1. Assistant identity and brief grounding statement.
2. A `从这里开始` primary question: `请用一分钟介绍赵实旷`, with a short
   explanation of what it covers.
3. `按主题继续问` groups with questions under `能力与方向` and `作品与方法`.

The composer has its own `继续提问` label and remains visually separate from
recommendations. Recommendation buttons retain their current behavior: each
sends the selected question through the existing chat controller.

## Particle Lifecycle

### Scroll collapse

- When the user begins to leave the hero, the homepage guide's surface,
  border, and supporting text disintegrate into fine monochrome particles.
- Those particles converge into a single assistant ball; this replaces the
  current immediate close-on-scroll behavior.
- The ball uses the portrait's black/gray/bone-white particle vocabulary,
  with no neon, colored gradient, or photo overlay.
- Once formed, its outer shell remains stable while two internal particle
  layers rotate slowly in opposite directions (20 seconds and 14 seconds per
  revolution). This is a subtle living state, not a loading spinner.
- With `prefers-reduced-motion: reduce`, the guide switches immediately to the
  static ball and all rotation and particle travel stop.

### Expand and collapse

- Clicking the collapsed ball disperses its outer halo and reconstructs the
  card from particles.
- Clicking the close control reverses the effect: the card dissolves toward the
  ball's halo and leaves the ball as the only visible control.
- The expanded card uses a dark, softly rounded editorial container (larger
  top corners, slightly tighter lower corners), with oxide-red orientation
  details and a particle core.

## Edge Anchor, Drag, and Safe Bounds

- The collapsed ball can be pointer-dragged vertically and horizontally.
- On release, it snaps to either the left or right edge, retaining its vertical
  position within safe bounds: clear of the fixed navigation, viewport edges,
  safe-area insets, and the assistant's own radius.
- The ball is always the outermost element at the selected edge so it remains
  easy to grab and is the target for particle collapse.
- Left dock order: `ball → ASK SHIKUANG · AI → expanded panel`.
- Right dock order: `expanded panel ← ASK SHIKUANG · AI ← ball`.
- The label and expanded panel always grow inward. The expanded panel is sized
  and positioned so it never crosses the viewport boundary.
- Opening the conversation does not discard the saved dock side or vertical
  position. Closing returns to the same anchored ball.

## Conversation UI and Submission Feedback

- The header keeps `ASK SHIKUANG · AI`; the particle ball appears immediately
  beside it on the outer-edge side.
- User messages appear as right-aligned, restrained oxide-tinted bubbles.
- AI messages appear as left-aligned, neutral dark bubbles with a light edge.
- When submission starts, append the user message, clear the textarea
  immediately, disable duplicate submission, and append an AI-side particle
  waiting indicator labelled `正在查找作品依据……`.
- The waiting indicator is replaced by the streaming AI answer or the existing
  retry/error treatment. Sources stay attached to the assistant response
  beneath the transcript.
- Existing session history, streamed sentence rendering, retry behavior, and
  source trust validation remain unchanged.

## Accessibility and Input Behavior

- Keep the orb/button semantics, Escape-to-close behavior, keyboard submission,
  visible focus indicators, live transcript announcements, and 44px touch
  targets.
- Dragging is pointer-based and does not remove the ball's keyboard activation.
- A click without meaningful pointer movement opens the card; a drag only moves
  and snaps the ball.
- During an active response, composer and recommendation controls stay disabled
  as today, while the cleared textarea does not retain the sent content.

## Error Handling

- Missing Canvas support falls back to the existing HTML guide and static ball
  shape without blocking chat functionality.
- Invalid stored dock coordinates are clamped to the current safe bounds.
- Resize and orientation changes preserve the selected side and clamp the
  vertical dock position again.
- Existing request failures retain the current error text and retry control;
  particle loading state is removed before the retry UI appears.

## Testing and Verification

Add tests before implementation for:

- initial homepage guide visibility and grouped recommendation markup;
- immediate input clearing on a valid submitted question;
- a temporary assistant loading indicator before streamed answer text;
- left/right transcript message classes and retained history rendering;
- scroll lifecycle state, reduced-motion static fallback, and collapse/expand
  state transitions;
- drag threshold, safe-bound clamping, side snap, resize clamping, and
  left/right label-panel order;
- no duplicate request while busy, existing retry behavior, and trusted source
  navigation regression coverage;
- CSS contracts for inward expansion, particle ball rotation, and mobile safe
  placement.

Run focused Vitest suites, the full suite in a single worker, production build,
one Impeccable detector pass, and desktop/mobile browser checks for guide,
collapse, drag, edge snap, conversation, and reduced-motion behavior.
