---
name: Zhao Shikuang Portfolio
description: A black editorial portfolio where a particle portrait leads into grounded project evidence.
colors:
  ink: "#050505"
  ink-soft: "#0b0b0c"
  paper: "#e9e5de"
  paper-ink: "#171719"
  text: "#f2f0eb"
  muted: "#96969d"
  oxide-red: "#8f322b"
  oxide-red-light: "#c8675e"
  supporting: "#a6a4a0"
  line: "rgb(255 255 255 / 0.14)"
typography:
  display:
    fontFamily: "Georgia, Times New Roman, serif"
    fontSize: "clamp(43px, 6.8vw, 108px)"
    fontWeight: 400
    lineHeight: 0.89
    letterSpacing: "-0.04em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, Helvetica, Arial, sans-serif"
    fontSize: "clamp(11px, 1.15vw, 17px)"
    fontWeight: 400
    lineHeight: 1.8
  headline:
    fontFamily: "Georgia, Times New Roman, serif"
    fontSize: "clamp(32px, 5vw, 82px)"
    fontWeight: 400
    lineHeight: 0.98
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, Helvetica, Arial, sans-serif"
    fontSize: "clamp(18px, 2vw, 30px)"
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, Helvetica, Arial, sans-serif"
    fontSize: "clamp(8px, 0.9vw, 12px)"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "0.16em"
rounded:
  card: "24px"
  panel: "28px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "48px"
  section: "clamp(92px, 12vh, 160px)"
components:
  project-card:
    backgroundColor: "{colors.ink-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
  assistant-panel:
    backgroundColor: "{colors.ink-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
---

# Design System: Zhao Shikuang Portfolio

## Overview

**Creative North Star: “The Particle Editorial.”**

The portfolio behaves like a dark exhibition catalogue that has become interactive. The opening portrait is not a photograph laid under an effect: light and shadow are rebuilt from irregular particles, expressing the move from physical objects to intelligent systems. Interfaces remain restrained so the work, résumé, and evidence carry the experience.

**Key characteristics:** black editorial fields; dimensional monochrome imagery; bone-white italic display type; sparse oxide-red signals; Apple-like motion restraint; complete project evidence rather than decorative thumbnails.

## Colors

The palette is nearly monochrome, with warm paper reserved for the résumé and oxide red used as a rare navigational signal.

- **Exhibition Black** (`#050505`): page ground and full-screen reader.
- **Soft Black** (`#0b0b0c`): subtle component separation.
- **Bone Paper** (`#e9e5de`): display text and résumé surface.
- **Paper Ink** (`#171719`): résumé typography.
- **Quiet Gray** (`#96969d`): secondary copy and metadata.
- **Oxide Red** (`#8f322b`): active navigation, labels, and deliberate emphasis only.

**The Rare Signal Rule.** Red marks orientation or action; it never becomes decoration or a large background field.

## Typography

Georgia supplies the large editorial voice; the system sans stack carries navigation, body copy, controls, and dense project facts.

- **Display:** regular italic/outlined serif, `clamp(43px, 6.8vw, 108px)`, line-height `0.89`, tracking `-0.04em`.
- **Body:** system sans, typically `11–17px`, line-height `1.7–1.8`, with short readable measures.
- **Label:** system sans, `8–10px`, uppercase, tracked `0.12–0.18em`.

**The Contrast Rule.** Serif is reserved for identity, chapter statements, and major contact invitations; functional UI stays sans-serif.

## Layout

Navigation is fixed at 64px desktop and 58px compact mobile, including safe-area insets. The first viewport uses an Ashley-style editorial path: role at upper left, a centered head-and-shoulders particle monument filling the usable screen, then the headline and supporting copy at lower right. The interface recedes around that path. Sections use generous vertical rhythm and alternate between black fields and one warm résumé object. Project cards form a six-column rail on wide screens and a horizontal snap rail below 1180px. At 760px, the résumé stacks, project chapters become single-column, and the AI panel becomes a bottom sheet. Short landscape phones preserve the centered portrait while placing the headline in a narrow right-side corridor above the fixed assistant orb.

## Elevation & Depth

Most surfaces are flat and separated by tone or hairlines. Depth appears only where interaction needs hierarchy: the warm résumé panel, hovered project selectors, the persistent AI panel, and the full-screen reader. Shadows are wide and low-contrast; the particle portrait creates depth through luminance, density, and parallax rather than glow.

## Shapes

Editorial content uses square fields and thin rules. Interactive objects use restrained 24–28px radii: project selectors, résumé panel, AI assistant, and its circular orb. Full-screen project imagery remains rectangular so the work is not visually softened.

## Components

### Navigation

Fixed translucent black bar with a quiet hairline. Links provide 44px touch targets; the active section receives a one-pixel oxide-red underline. Mobile keeps the same visible information architecture rather than replacing it with a menu.

### Particle Portrait

Canvas-only output after loading; neither the source portrait nor its same-size subject mask ever appears as a visible overlay. The centered crop shows only the head, shoulders, and clothing. Fine particles dominate with occasional larger points, while the face keeps dense micro-detail. Entrance aggregation happens once, then motion settles; reduced-motion renders the final state directly. Typography must not cover the face: the lower-right headline may cross only the lower clothing field, with roughly 10–15% overlap, supported by a local black fade rather than a panel.

The source luminance is interpreted as a tonal negative: dark hair, eyes, facial shadow, and garment folds create the brightest and densest light particles, while source highlights remain open. The alpha mask, silhouette, geometry, and grayscale-on-black palette remain unchanged.

### Project Selectors and Reader

Selectors contain real first-page imagery, metadata, and modest `1.03` hover scale. Opening a project enters a history-aware full-screen reader with translucent edge chevrons, page count, keyboard and touch navigation, and original-PDF access.

### AI Assistant

A 56px fixed orb survives the full page. Expanded desktop presentation is a dark 400px panel; mobile becomes a safe-area-aware bottom sheet. Scrolling collapses it, content and draft state remain mounted, and motion uses the shared ease-out curve.

## Do's and Don'ts

- Do let real project pages and the particle portrait provide visual richness.
- Do preserve complete source documents, citations, keyboard paths, and reduced motion.
- Do keep red scarce and functional.
- Do use warm paper only as a deliberate résumé interruption inside the black world.
- Don't expose the portrait photo behind the particle canvas.
- Don't add generic gradient cards, neon glow, glass tiles, or dashboard chrome.
- Don't hide the main mobile navigation or let floating UI cover page controls.
- Don't replace project evidence with summaries when full pages are available.
