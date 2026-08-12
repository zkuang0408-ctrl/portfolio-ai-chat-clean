import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(
    new RegExp(`^\\s*${escaped}\\s*\\{([\\s\\S]*?)\\}`, "m"),
  )?.[1] ?? "";
}

function blockBodyAt(source: string, openingBrace: number): string {
  let depth = 1;
  for (let index = openingBrace + 1; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }
  return "";
}

function ruleWithin(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = Array.from(
    source.matchAll(
      new RegExp(`^\\s*${escaped}\\s*\\{([\\s\\S]*?)\\}`, "gm"),
    ),
  );
  return matches.at(-1)?.[1] ?? "";
}

function mediaRule(query: string, selector: string): string {
  const token = `@media ${query} {`;
  let cursor = 0;
  let matchedRule = "";
  while (cursor < styles.length) {
    const headerIndex = styles.indexOf(token, cursor);
    if (headerIndex < 0) break;
    const body = blockBodyAt(styles, headerIndex + token.length - 1);
    const candidate = ruleWithin(body, selector);
    if (candidate) matchedRule = candidate;
    cursor = headerIndex + token.length;
  }
  return matchedRule;
}

function rulesContaining(selector: string): string {
  return Array.from(styles.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    .filter((match) => match[1]?.includes(selector))
    .map((match) => match[2])
    .join("\n");
}

test("composes a full-screen centered particle portrait", () => {
  expect(styles).toMatch(/\.hero\s*\{[^}]*min-height:\s*100svh;/s);
  expect(styles).toMatch(
    /\.hero-scene\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*calc\(var\(--nav-height\)\s*\+\s*env\(safe-area-inset-top\)\)\s+0\s+0;/s,
  );
  expect(styles).toMatch(
    /\.portrait-stage\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*width:\s*100%;/s,
  );
  expect(styles).toMatch(
    /\.portrait-canvas\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s,
  );
  expect(styles).toMatch(
    /\.portrait-base,\s*\.portrait-mask\s*\{[^}]*position:\s*absolute;[^}]*visibility:\s*hidden;[^}]*pointer-events:\s*none;/s,
  );
  expect(styles).toMatch(
    /\.hero-copy\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*width:\s*100%;/s,
  );
});

test("places role, headline, and supporting copy in approved desktop regions", () => {
  expect(styles).toMatch(
    /\.hero-copy \.role\s*\{[^}]*position:\s*absolute;[^}]*top:\s*clamp\(52px,\s*8vh,\s*96px\);[^}]*left:\s*clamp\(24px,\s*5vw,\s*88px\);/s,
  );
  expect(styles).toMatch(
    /\.hero-copy \.headline\s*\{[^}]*position:\s*absolute;[^}]*right:\s*clamp\(28px,\s*6vw,\s*110px\);[^}]*bottom:\s*clamp\(64px,\s*10vh,\s*118px\);[^}]*max-width:\s*min\(980px,\s*70vw\);[^}]*text-align:\s*right;/s,
  );
  expect(styles).toMatch(
    /\.hero-supporting\s*\{[^}]*position:\s*absolute;[^}]*right:\s*clamp\(28px,\s*6vw,\s*110px\);[^}]*bottom:\s*clamp\(24px,\s*4vh,\s*48px\);[^}]*max-width:\s*none;[^}]*white-space:\s*nowrap;[^}]*text-align:\s*right;/s,
  );
  expect(styles).toMatch(
    /\.hero-copy \.headline::before\s*\{[^}]*background:[^;}]*gradient/s,
  );
  expect(rule(".hero-copy .headline::before")).not.toMatch(
    /backdrop-filter|border|box-shadow/,
  );
  expect(rule(".hero-copy .headline")).toMatch(/letter-spacing:\s*-0\.04em/);
});

test("uses one compact mobile navigation row without the redundant Ask AI label", () => {
  const mobile = "(max-width: 760px)";

  expect(mediaRule(mobile, ".site-nav")).toMatch(/flex-wrap:\s*nowrap/);
  expect(mediaRule(mobile, ".site-nav nav")).toMatch(/white-space:\s*nowrap/);
  expect(mediaRule(mobile, ".site-nav nav :is(a, button)")).toMatch(
    /min-width:\s*44px;[\s\S]*min-height:\s*44px/,
  );
  expect(mediaRule(mobile, ".site-nav [data-open-chat]")).toMatch(
    /display:\s*none/,
  );
});

test("locks both mobile hero statements to the approved two lines", () => {
  const mobile = "(max-width: 760px)";

  expect(mediaRule(mobile, ".hero-copy .headline")).toMatch(
    /bottom:\s*calc\(var\(--mobile-guide-bottom\)\s*\+\s*var\(--mobile-guide-height\)\s*\+\s*76px\)[\s\S]*font-size:\s*clamp\(24px,\s*7\.2vw,\s*30px\)/,
  );
  expect(mediaRule(mobile, ".hero-copy .headline span")).toMatch(
    /white-space:\s*nowrap/,
  );
  expect(mediaRule(mobile, ".hero-supporting span")).toMatch(
    /display:\s*block[\s\S]*white-space:\s*nowrap/,
  );
  expect(mediaRule(mobile, ".hero-supporting")).toMatch(
    /font-size:\s*clamp\(11px,\s*3\.2vw,\s*13px\)/,
  );
});

test("keeps both mobile hero statements visible in short landscape", () => {
  const shortLandscape =
    "(max-width: 760px) and (max-height: 680px) and (orientation: landscape)";
  const supporting = mediaRule(shortLandscape, ".hero-supporting");

  expect(mediaRule(shortLandscape, ".portrait-stage")).toMatch(
    /right:\s*48%;[\s\S]*width:\s*auto/,
  );
  expect(mediaRule(shortLandscape, ".hero-copy .headline")).toMatch(
    /right:\s*16px;[\s\S]*left:\s*46%;[\s\S]*font-size:\s*clamp\(24px,\s*4\.3vw,\s*28px\)/,
  );
  expect(supporting).toMatch(/left:\s*46%;[\s\S]*display:\s*block/);
  expect(supporting).not.toMatch(/display:\s*none/);
});

test("hides the canvas in controller fallback and error states", () => {
  expect(styles).toMatch(
    /\.portrait-stage--fallback \.portrait-canvas,\s*\.portrait-stage--error \.portrait-canvas,\s*\.portrait-stage\.is-error \.portrait-canvas\s*\{\s*display:\s*none;/,
  );
});

test("never presents the portrait sampling image", () => {
  expect(styles).toMatch(
    /\.portrait-base,\s*\.portrait-mask\s*\{[^}]*visibility:\s*hidden;[^}]*pointer-events:\s*none;/s,
  );
  expect(styles).toMatch(
    /\.portrait-stage--fallback \.portrait-base,\s*\.portrait-stage--error \.portrait-base,\s*\.portrait-stage\.is-error \.portrait-base\s*\{[\s\S]*?opacity:\s*0;/,
  );
  expect(styles).not.toMatch(/opacity:\s*0\.(?:28|32|46)/);
});

test("reveals an accessible status message in error states", () => {
  expect(rule(".portrait-error")).toMatch(/opacity:\s*1/);
  expect(styles).not.toMatch(/portrait-stage[^,{]* \.portrait-error/);
});

test("defines the editorial portfolio section system", () => {
  for (const selector of [
    ".portfolio-content",
    ".portfolio-section",
    ".section-heading",
    ".about-grid",
    ".project-list",
    ".project-card",
    ".project-media",
    ".project-reader",
    ".project-reader-stage",
    ".project-reader-counter",
    ".contact",
  ]) {
    expect(styles, selector).toContain(`${selector} {`);
  }
  expect(styles).not.toMatch(/\.documents\b/);
  expect(styles).toMatch(/a:focus-visible\s*\{[\s\S]*?outline:/);
});

test("uses a clipped 16:9 reader stage and a centered editorial counter", () => {
  expect(rule(".project-reader-stage")).toMatch(/position:\s*relative/);
  expect(rule(".project-reader-stage")).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);
  expect(rule(".project-reader-stage")).toMatch(/overflow:\s*hidden/);
  expect(rule(".project-reader-stage")).toMatch(/touch-action:\s*pan-y/);
  expect(rule(".project-reader-stage")).toMatch(/background:\s*#[0-9a-f]{3,6}/i);
  expect(rule(".project-reader picture")).toMatch(/display:\s*block/);
  expect(rule(".project-reader picture")).toMatch(/width:\s*100%/);
  expect(rule(".project-reader picture")).toMatch(/height:\s*100%/);
  expect(rule(".project-reader [data-page-image]")).toMatch(/display:\s*block/);
  expect(rule(".project-reader [data-page-image]")).toMatch(/width:\s*100%/);
  expect(rule(".project-reader [data-page-image]")).toMatch(/height:\s*100%/);
  expect(rule(".project-reader [data-page-image]")).toMatch(
    /object-fit:\s*contain/,
  );
  expect(rule(".project-reader-counter")).toMatch(/text-align:\s*center/);
  expect(rule(".project-reader-counter")).toMatch(/letter-spacing:/);
  expect(rule(".project-reader-counter")).toMatch(/color:\s*#7d7d7d/);
  expect(styles).not.toMatch(/\.project-media\s+img\s*\{/);
});

test("keeps resting project selectors flat with complete 16:10 covers", () => {
  const media = rule(".project-selector__media");
  const image = rulesContaining(".project-selector__media img");
  const meta = rule(".project-selector__meta");
  const hoverImage = rule(
    ".project-selector:hover .project-selector__media img",
  );
  const focusImage = rule(
    ".project-selector:focus-visible .project-selector__media img",
  );
  const intermediate = mediaRule("(max-width: 1179px)", ".project-selector");
  const mobile = mediaRule("(max-width: 760px)", ".project-selector");

  expect(media).toMatch(/aspect-ratio:\s*16\s*\/\s*10/);
  expect(media).toMatch(/min-width:\s*0/);
  expect(media).toMatch(/padding:\s*6px/);
  expect(image).toMatch(/object-fit:\s*contain/);
  expect(image).toMatch(/object-position:\s*50%\s+50%/);
  expect(meta).toMatch(/min-height:\s*48px/);
  expect(meta).toMatch(/min-width:\s*0/);
  expect(meta).toMatch(/gap:\s*2px/);
  expect(meta).toMatch(/padding:\s*8px\s+14px/);
  expect(intermediate).toMatch(
    /width:\s*clamp\(180px,\s*24vw,\s*240px\)/,
  );
  expect(mobile).toMatch(/width:\s*min\(68vw,\s*260px\)/);
  expect(hoverImage).toMatch(/transform:\s*scale\(1\.04\)/);
  expect(focusImage).not.toMatch(/transform:\s*scale/);
});

test("reveals only the incoming project in the selected direction", () => {
  expect(rule('[data-project-chapter][hidden]')).toMatch(/display:\s*none/);
  expect(rule(".project-chapters .project-card")).toMatch(/padding-top:\s*0/);
  expect(
    rule('[data-project-chapter][data-project-transition="forward"]'),
  ).toMatch(/project-reveal-forward\s+280ms/);
  expect(
    rule('[data-project-chapter][data-project-transition="backward"]'),
  ).toMatch(/project-reveal-backward\s+280ms/);
  expect(styles).toMatch(
    /@keyframes\s+project-reveal-forward[\s\S]*?clip-path:[\s\S]*?translateX\(18px\)/,
  );
  expect(styles).toMatch(
    /@keyframes\s+project-reveal-backward[\s\S]*?clip-path:[\s\S]*?translateX\(-18px\)/,
  );
  expect(styles).toMatch(
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?data-project-transition[\s\S]*?animation:\s*none/,
  );
});

test("draws undecorated V6 edge chevrons with accessible hit targets", () => {
  const chevron = rule(".project-reader-chevron");
  const chevronRules = rulesContaining(".project-reader-chevron");
  const polyline = rule(".project-reader-chevron polyline");
  const svg = rule(".project-reader-chevron svg");

  expect(chevron).toMatch(/background:\s*transparent/);
  expect(chevron).toMatch(/border:\s*(?:0|none)/);
  expect(chevron).toMatch(/min-width:\s*44px/);
  expect(chevron).toMatch(/min-height:\s*44px/);
  expect(chevron).toMatch(/opacity:\s*0?\.58/);
  expect(chevronRules).not.toMatch(
    /backdrop-filter|box-shadow|border-radius/,
  );
  expect(chevronRules.match(/background\s*:[^;]+;/g)).toEqual([
    "background: transparent;",
  ]);
  expect(svg).toMatch(/width:\s*40px/);
  expect(svg).toMatch(/height:\s*66px/);
  expect(polyline).toMatch(/fill:\s*none/);
  expect(polyline).toMatch(/stroke:\s*currentColor/);
  expect(polyline).toMatch(/stroke-width:\s*2(?:px)?/);

  expect(rule(".project-reader-chevron--previous")).toMatch(/left:\s*-4px/);
  expect(rule(".project-reader-chevron--next")).toMatch(/right:\s*-4px/);
});

test("styles reader loading, rendering, ready, error, disabled, hover, and focus states", () => {
  expect(styles).toContain('[data-reader-state="loading"]');
  expect(styles).toContain('[data-reader-state="rendering"]');
  expect(styles).toContain('[data-reader-state="ready"]');
  expect(styles).toContain('[data-reader-state="error"]');
  expect(styles).toMatch(
    /\.project-reader-chevron:hover[\s\S]*?opacity:\s*0?\.[6-9]/,
  );
  expect(styles).toMatch(
    /\.project-reader-chevron:focus-visible[\s\S]*?outline:/,
  );
  expect(styles).toMatch(
    /\.project-reader-chevron:disabled[\s\S]*?pointer-events:\s*none/,
  );
  expect(styles).toMatch(
    /\[data-reader-error\]:not\(\[hidden\]\)[\s\S]*?display:\s*flex/,
  );
  expect(rule(".project-reader [data-page-image]")).toMatch(
    /transition:\s*opacity/,
  );
});

test("scales mobile reader glyphs to the page while preserving touch targets", () => {
  const mobile = "(max-width: 760px)";

  expect(mediaRule(mobile, ".project-reader-stage")).toMatch(
    /container-type:\s*inline-size/,
  );
  expect(mediaRule(mobile, ".project-reader-chevron")).toMatch(
    /width:\s*44px[\s\S]*min-width:\s*44px[\s\S]*height:\s*44px[\s\S]*min-height:\s*44px/,
  );
  expect(mediaRule(mobile, ".project-reader-chevron svg")).toMatch(
    /width:\s*clamp\(14px,\s*3\.1vw,\s*22px\)[\s\S]*width:\s*clamp\(14px,\s*3\.1cqw,\s*22px\)[\s\S]*height:\s*auto[\s\S]*aspect-ratio:\s*40\s*\/\s*66/,
  );
  expect(mediaRule(mobile, ".project-reader-chevron--previous")).toMatch(
    /left:\s*max\(clamp\(4px,\s*1\.5vw,\s*10px\),\s*env\(safe-area-inset-left\)\)[\s\S]*left:\s*max\(clamp\(4px,\s*1\.5cqw,\s*10px\),\s*env\(safe-area-inset-left\)\)/,
  );
  expect(mediaRule(mobile, ".project-reader-chevron--next")).toMatch(
    /right:\s*max\(clamp\(4px,\s*1\.5vw,\s*10px\),\s*env\(safe-area-inset-right\)\)[\s\S]*right:\s*max\(clamp\(4px,\s*1\.5cqw,\s*10px\),\s*env\(safe-area-inset-right\)\)/,
  );
  expect(
    mediaRule(
      mobile,
      ".project-reader.is-fullscreen .project-reader-chevron--previous",
    ),
  ).toMatch(
    /left:\s*clamp\(4px,\s*1\.5vw,\s*10px\)[\s\S]*left:\s*clamp\(4px,\s*1\.5cqw,\s*10px\)/,
  );
  expect(
    mediaRule(
      mobile,
      ".project-reader.is-fullscreen .project-reader-chevron--next",
    ),
  ).toMatch(
    /right:\s*clamp\(4px,\s*1\.5vw,\s*10px\)[\s\S]*right:\s*clamp\(4px,\s*1\.5cqw,\s*10px\)/,
  );
  expect(rule(".project-reader-chevron svg")).toMatch(
    /width:\s*40px[\s\S]*height:\s*66px/,
  );
});

test("stacks portfolio content at the mobile breakpoint", () => {
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.project-card\s*\{[\s\S]*?grid-template-columns:\s*1fr;/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.about-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr;/,
  );
});

test("enables smooth anchors only when motion is acceptable", () => {
  expect(styles).toMatch(
    /@media\s*\(prefers-reduced-motion:\s*no-preference\)[\s\S]*?html\s*\{\s*scroll-behavior:\s*smooth;/,
  );
});

test("removes reader fades when reduced motion is requested", () => {
  expect(styles).toMatch(
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.project-reader \[data-page-image\]\s*\{[\s\S]*?transition:\s*none;/,
  );
});

test("gives the active navigation section a quiet persistent state", () => {
  expect(rule('.site-nav nav a[aria-current="location"]')).toMatch(
    /color:\s*var\(--text\)/,
  );
  expect(rule('.site-nav nav a[aria-current="location"]')).toMatch(
    /text-decoration|border-bottom|background/,
  );
});

test("keeps the assistant fixed above safe areas as a compact persistent control", () => {
  const heroChat = rule(".hero-chat");

  expect(heroChat).toMatch(/position:\s*fixed/);
  expect(heroChat).toMatch(/z-index:\s*180/);
  expect(heroChat).toMatch(/right:\s*max\(/);
  expect(heroChat).toMatch(/bottom:\s*max\(/);
  expect(heroChat).toMatch(/border:\s*0/);
  expect(heroChat).toMatch(/background:\s*transparent/);
  expect(rule(".chat-orb")).toMatch(/border-radius:\s*50%/);
  expect(rule(".chat-orb")).toMatch(/min-width:\s*52px/);
  expect(rule(".chat-panel")).toMatch(/width:\s*min\(400px/);
  expect(rule(".chat-panel")).toMatch(/max-height:\s*min\(560px/);
  expect(styles).toContain('[data-chat-presentation="collapsed"]');
  expect(styles).toContain('[data-chat-presentation="expanded"]');
});

test("treats the assistant as a visible hero guide that docks inward as a particle core", () => {
  expect(rule('.hero-chat[data-chat-presentation="guide"]')).toMatch(/left:/);
  expect(rule(".chat-particle-canvas")).toMatch(/pointer-events:\s*none/);
  expect(rule('.hero-chat[data-chat-dock="left"] .chat-panel')).toMatch(/left:/);
  expect(rule('.hero-chat[data-chat-dock="right"] .chat-panel')).toMatch(/right:/);
  expect(rule(".chat-panel")).toMatch(/border-radius:\s*30px\s+30px\s+22px\s+22px/);
  expect(rule(".chat-message--user")).toMatch(/align-self:\s*flex-end/);
  expect(rule(".chat-message--assistant")).toMatch(/align-self:\s*flex-start/);
  expect(rule(".chat-loading-dot")).toMatch(/animation:/);
});

test("gives the collapsed assistant enough canvas room for a dense particle sphere", () => {
  expect(rule('.hero-chat[data-chat-presentation="collapsed"],\n.hero-chat[data-chat-presentation="expanding"],\n.hero-chat[data-chat-presentation="expanded"]')).toMatch(/width:\s*76px/);
  expect(rule('.hero-chat[data-chat-presentation="collapsed"] .chat-orb')).toMatch(/width:\s*76px/);
  expect(rule('.hero-chat[data-chat-presentation="collapsed"] .chat-orb')).toMatch(/border:\s*0/);
  expect(rule('.hero-chat[data-chat-presentation="collapsed"] .chat-orb')).toMatch(/backdrop-filter:\s*none/);
  expect(rule(".chat-particle-canvas")).toMatch(/mix-blend-mode:\s*difference/);
  expect(rule('.hero-chat[data-chat-presentation="collapsed"]::before')).toMatch(/background:\s*#050505/);
});

test("uses the assistant panel as the only chat scroll container", () => {
  expect(rule(".chat-scroll-region")).toMatch(/overflow-y:\s*auto/);
  expect(rulesContaining(".chat-transcript")).not.toMatch(/max-height\s*:|overflow\s*:/);
});

test("renders evidence as tiny links beneath the assistant answer", () => {
  expect(rule(".chat-sources")).toMatch(/align-self:\s*flex-start/);
  expect(rule(".chat-sources")).toMatch(/max-width:\s*86%/);
  expect(rule(".chat-sources :is(button, a)")).toMatch(/font-size:\s*8px/);
  expect(rule(".chat-sources :is(button, a)")).toMatch(/border:\s*0/);
  expect(rule(".chat-sources :is(button, a)::before")).toMatch(/inset:\s*-8px/);
});

test("hides an evidence region until the transcript has an answer", () => {
  expect(rule(".chat-transcript:not(:has(.chat-message))")).toMatch(/display:\s*none/);
  expect(rule(".chat-sources:empty")).toMatch(/display:\s*none/);
});

test("uses readable high-contrast colors and sizes for critical chat UI", () => {
  expect(rule(".chat-label")).toMatch(/color:\s*#bd5b52/i);
  expect(rule(".chat-label")).toMatch(/font-size:\s*10px/);
  expect(rule(".chat-send")).toMatch(/color:\s*#bd5b52/i);
  expect(rule(".chat-send")).toMatch(/font-size:\s*11px/);
  expect(rule(".chat-input::placeholder")).toMatch(/color:\s*#7a7a7a/i);
  expect(rule(".chat-status")).toMatch(/color:\s*#7a7a7a/i);
  expect(rule(".chat-status")).toMatch(/font-size:\s*10px/);
  expect(rule(".chat-sources :is(button, a)")).toMatch(/font-size:\s*8px/);
  expect(rule(".chat-accent")).toMatch(/background:\s*#bd5b52/i);
  expect(rule(".chat-scroll-region")).toMatch(
    /scrollbar-color:\s*#606060\s+transparent/i,
  );
});

test("uses quiet underlined recommendations with accessible pointer targets", () => {
  const recommendations = rule(".chat-recommendation");

  expect(recommendations).toMatch(/min-height:\s*44px/);
  expect(recommendations).toMatch(/border:\s*0/);
  expect(recommendations).toMatch(/border-bottom:\s*1px\s+solid/);
  expect(recommendations).toMatch(/background:\s*transparent/);
  expect(recommendations).not.toMatch(/border-radius|box-shadow/);
});

test("uses a compact rounded guide that yields to the transcript", () => {
  expect(rule(".chat-guide-toggle")).toMatch(/min-height:\s*44px/);
  expect(rule(".chat-guide-toggle")).toMatch(/font-size:\s*9px/);
  expect(
    rule(".chat-section-label,\n.chat-topic__title,\n.chat-composer-label"),
  ).toMatch(/font-size:\s*8px/);
  expect(rule(".chat-primary-description")).toMatch(/font-size:\s*10px/);
  expect(rule(".chat-recommendation--primary")).toMatch(
    /border-radius:\s*10px/,
  );
  expect(mediaRule("(prefers-reduced-motion: reduce)", ".chat-loading-dot")).toMatch(
    /animation:\s*none/,
  );
});

test("uses a short bottom mobile guide and keeps the full panel readable", () => {
  const mobile = "(max-width: 760px)";
  const guide = mediaRule(
    mobile,
    '.hero-chat[data-chat-presentation="guide"]',
  );

  expect(rule(".chat-mobile-guide-action")).toMatch(/display:\s*none/);
  const mobileRoot = mediaRule(mobile, ":root");
  expect(mobileRoot).toMatch(
    /--mobile-guide-bottom:\s*max\(12px,\s*env\(safe-area-inset-bottom\)\)/,
  );
  expect(mobileRoot).toMatch(
    /--mobile-guide-height:\s*clamp\(76px,\s*10\.5svh,\s*88px\)/,
  );
  expect(guide).toMatch(/bottom:\s*var\(--mobile-guide-bottom\)/);
  expect(guide).toMatch(/height:\s*var\(--mobile-guide-height\)/);
  expect(
    mediaRule(
      mobile,
      '.hero-chat[data-chat-presentation="guide"] .chat-orb',
    ),
  ).toMatch(/display:\s*none/);
  expect(mediaRule(mobile, ".chat-mobile-guide-action")).toMatch(
    /position:\s*absolute[\s\S]*inset:\s*0[\s\S]*min-height:\s*44px/,
  );
  for (const selector of [
    ".chat-collapse",
    ".chat-guide-toggle",
    ".chat-guidance",
    ".chat-transcript",
    ".chat-composer",
    ".chat-status",
  ]) {
    expect(
      mediaRule(
        mobile,
        `.hero-chat[data-chat-presentation="guide"] ${selector}`,
      ),
      selector,
    ).toMatch(/display:\s*none/);
  }
  expect(
    mediaRule(
      mobile,
      '.hero-chat[data-chat-presentation="expanded"] .chat-panel',
    ),
  ).toMatch(/max-height:\s*var\(--chat-visual-height,[\s\S]*min\(70dvh/);
  expect(
    mediaRule(
      mobile,
      '.hero-chat[data-chat-presentation="expanded"] .chat-transcript',
    ),
  ).toMatch(/display:\s*flex[\s\S]*min-height:\s*1px/);
});

test("keeps the mobile guide keyboard focus visible inside its clipped frame", () => {
  const focus = mediaRule(
    "(max-width: 760px)",
    ".chat-mobile-guide-action:focus-visible",
  );

  expect(focus).toMatch(/outline:\s*1px\s+solid\s+#c8685f/);
  expect(focus).toMatch(/outline-offset:\s*-4px/);
});

test("tracks the expanded mobile sheet inside the visual keyboard viewport", () => {
  const panel = mediaRule(
    "(max-width: 760px)",
    '.hero-chat[data-chat-presentation="expanded"] .chat-panel',
  );

  expect(panel).toMatch(/top:\s*var\(--chat-visual-top,\s*auto\)/);
  expect(panel).toMatch(/bottom:\s*max\([\s\S]*var\(--chat-visual-bottom,\s*0px\)/);
  expect(panel).toMatch(/max-height:\s*var\(--chat-visual-height,/);
});

test("replaces mobile blue tap highlighting with restrained press enlargement", () => {
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)\s+and\s+\(pointer:\s*coarse\)[\s\S]*?-webkit-tap-highlight-color:\s*transparent/,
  );
  expect(styles).toMatch(/--tap-scale:\s*1/);
  expect(styles).toMatch(/scale:\s*var\(--tap-scale\)/);
  expect(styles).toMatch(/transition:\s*scale\s+190ms\s+var\(--ease-out\)/);
  expect(styles).toMatch(/:active:not\(:disabled\)[\s\S]*?--tap-scale:\s*1\.02/);
  expect(styles).toMatch(/:where\(a, button, \[role="button"\]\):not\(\.chat-orb\)/);
});

test("keeps press feedback still under reduced motion", () => {
  expect(styles).toMatch(
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?:where\(a, button, \[role="button"\]\):not\(\.chat-orb\)[\s\S]*?scale:\s*1[\s\S]*?transition:\s*none/,
  );
});

test("uses a transparent 56px mobile particle orb while preserving desktop geometry", () => {
  const mobile = "(max-width: 760px)";
  const mobileRoot = mediaRule(
    mobile,
    '.hero-chat[data-chat-presentation="collapsed"],\n.hero-chat[data-chat-presentation="expanding"],\n.hero-chat[data-chat-presentation="expanded"]',
  );
  const mobileOrb = mediaRule(
    mobile,
    '.hero-chat[data-chat-presentation="collapsed"] .chat-orb',
  );

  expect(mobileRoot).toMatch(/width:\s*56px/);
  expect(mobileRoot).toMatch(/var\(--chat-dock-x,\s*44px\)\s*-\s*28px/);
  expect(mobileOrb).toMatch(
    /width:\s*56px[\s\S]*height:\s*56px[\s\S]*background:\s*transparent/,
  );
  expect(mobileOrb).toMatch(/border:\s*0/);
  expect(mobileOrb).toMatch(/box-shadow:\s*none/);
  expect(mobileOrb).toMatch(/backdrop-filter:\s*none/);
  expect(
    mediaRule(
      mobile,
      '.hero-chat[data-chat-presentation="collapsed"]::before',
    ),
  ).toMatch(/content:\s*none/);
  expect(
    mediaRule(
      mobile,
      '.hero-chat[data-chat-particles="fallback"] .chat-orb::after',
    ),
  ).toMatch(/content:\s*"AI"[\s\S]*mix-blend-mode:\s*difference/);
  expect(rule(".chat-particle-canvas")).toMatch(
    /mix-blend-mode:\s*difference/,
  );
  expect(
    rule('.hero-chat[data-chat-presentation="collapsed"] .chat-orb'),
  ).toMatch(/width:\s*76px/);
  expect(
    rule('.hero-chat[data-chat-presentation="collapsed"]::before'),
  ).toMatch(/background:\s*#050505/);
});

test("uses a safe-area-aware bottom sheet on mobile without changing the fixed navigation", () => {
  const expandedRoot = mediaRule(
    "(max-width: 760px)",
    '.hero-chat[data-chat-presentation="expanded"]',
  );
  expect(expandedRoot).toMatch(/transform:\s*none/);
  expect(expandedRoot).toMatch(/will-change:\s*auto/);
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.chat-panel\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.chat-panel\s*\{[\s\S]*?border-radius:\s*24px\s+24px\s+0\s+0/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.chat-panel\s*\{[\s\S]*?max-height:\s*min\(78dvh/,
  );
  expect(styles).toContain("--chat-viewport-inset");
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.hero-chat\[data-chat-presentation="expanded"\] \.chat-panel\s*\{[\s\S]*?bottom:\s*max\(\s*76px/,
  );
});

test("replaces the header dot with the same non-interactive particle canvas", () => {
  expect(rule(".chat-ball-anchor")).toMatch(/background:\s*transparent/);
  expect(rule(".chat-ball-anchor")).toMatch(/box-shadow:\s*none/);
  expect(rule(".chat-ball-anchor::after")).toMatch(/display:\s*none/);
  expect(rule(".chat-header-particle-canvas")).toMatch(/pointer-events:\s*none/);
  expect(styles).toContain(".chat-header-particle-canvas");
});

test("shows a transparent text fallback when assistant header particles are unavailable", () => {
  const fallback = rule(
    '.hero-chat[data-chat-particles="fallback"] .chat-ball-anchor::after,\n.hero-chat[data-chat-header-particles="fallback"] .chat-ball-anchor::after',
  );

  expect(fallback).toMatch(/position:\s*absolute/);
  expect(fallback).toMatch(/inset:\s*0/);
  expect(fallback).toMatch(/display:\s*grid/);
  expect(fallback).toMatch(/place-items:\s*center/);
  expect(fallback).toMatch(/content:\s*"AI"/);
  expect(fallback).toMatch(/font-size:\s*10px/);
  expect(fallback).toMatch(/letter-spacing:\s*0\.12em/);
  expect(fallback).toMatch(/background:\s*transparent/);
  expect(fallback).toMatch(/border:\s*0/);
  expect(fallback).toMatch(/box-shadow:\s*none/);
  expect(fallback).toMatch(/mix-blend-mode:\s*difference/);
});

test("lifts the desktop panel and collapses it cleanly toward the docked particle ball", () => {
  expect(styles).toMatch(
    /@media\s*\(min-width:\s*761px\)[\s\S]*?data-chat-presentation="expanded"[\s\S]*?translateY\(calc\(-50% - 72px\)\)/,
  );
  const collapsing = rule('.hero-chat[data-chat-presentation="collapsing"] .chat-panel');
  expect(collapsing).toMatch(/filter:\s*none/);
  expect(collapsing).toMatch(/transition:[\s\S]*opacity[\s\S]*transform/);
  expect(collapsing).toMatch(/opacity 220ms var\(--ease-out\)/);
  expect(collapsing).not.toMatch(/ease-in/);
  expect(collapsing).not.toMatch(/clip-path/);
});

test("uses a simple scale transition without panel particles or blur", () => {
  expect(rule(".chat-panel-particle-canvas")).toBe("");
  const collapsing = rule('.hero-chat[data-chat-presentation="collapsing"] .chat-panel');
  expect(collapsing).toMatch(/transition:[\s\S]*transform/);
  expect(collapsing).toMatch(/filter:\s*none/);
  expect(collapsing).not.toMatch(/filter:\s*blur/);
  expect(collapsing).not.toMatch(/clip-path/);
  expect(styles).toMatch(
    /data-chat-presentation="collapsing"\]\[data-chat-dock="left"\] \.chat-panel\s*\{[\s\S]*?scale\(0\.12\)/,
  );
});

test("mirrors the collapse transform while the desktop panel expands from the ball", () => {
  const expanding = rule('.hero-chat[data-chat-presentation="expanding"] .chat-panel');
  expect(expanding).toMatch(/opacity:\s*0/);
  expect(expanding).toMatch(/visibility:\s*visible/);
  expect(expanding).toMatch(/pointer-events:\s*none/);
  expect(rule('.hero-chat[data-chat-presentation="expanding"] .chat-orb')).toMatch(
    /pointer-events:\s*none/,
  );
  expect(rulesContaining('.hero-chat[data-chat-presentation="expanded"] .chat-orb')).toMatch(
    /width:\s*76px/,
  );
  expect(styles).toMatch(
    /data-chat-presentation="expanding"\]\[data-chat-dock="left"\] \.chat-panel\s*\{[\s\S]*?translate\(-28px,\s*-50%\) scale\(0\.12\)/,
  );
  expect(styles).toMatch(
    /data-chat-presentation="expanding"\]\[data-chat-dock="right"\] \.chat-panel\s*\{[\s\S]*?translate\(28px,\s*-50%\) scale\(0\.12\)/,
  );
  expect(rule('.hero-chat[data-chat-presentation="expanded"] .chat-panel')).toMatch(
    /transform 380ms var\(--ease-out\)/,
  );
});

test("removes positional easing while the particle ball is under direct pointer control", () => {
  expect(rule('.hero-chat[data-chat-dragging="true"]')).toMatch(/transition:\s*none/);
  expect(rule('.hero-chat[data-chat-dragging="true"] .chat-orb')).toMatch(
    /cursor:\s*grabbing/,
  );
});

test("moves the docked assistant with a compositor transform instead of layout properties", () => {
  const docked = rule(
    '.hero-chat[data-chat-presentation="collapsed"],\n.hero-chat[data-chat-presentation="expanding"],\n.hero-chat[data-chat-presentation="expanded"]',
  );
  const collapsing = rule('.hero-chat[data-chat-presentation="collapsing"]');
  for (const state of [docked, collapsing]) {
    expect(state).toMatch(/top:\s*0/);
    expect(state).toMatch(/left:\s*0/);
    expect(state).toMatch(/transform:\s*translate3d\(/);
    expect(state).toMatch(/transition:\s*transform/);
    expect(state).not.toMatch(/transition:[\s\S]*(?:top|left)/);
  }
});

test("places the desktop guide in the upper-left safe zone with room below for page identity", () => {
  expect(styles).toMatch(
    /@media\s*\(min-width:\s*761px\)[\s\S]*?\.hero-chat\[data-chat-presentation="guide"\]\s*\{[\s\S]*?top:\s*clamp\(96px,\s*13vh,\s*152px\)/,
  );
  expect(styles).toMatch(
    /@media\s*\(min-width:\s*761px\)[\s\S]*?\.hero-chat\[data-chat-presentation="guide"\] \.chat-panel\s*\{[\s\S]*?max-height:\s*min\(560px/,
  );
});

test("keeps hero copy to two English lines and one Chinese line on desktop", () => {
  expect(rule(".hero-copy .headline")).toMatch(/max-width:\s*min\(980px,\s*70vw\)/);
  expect(rule(".hero-copy .headline span")).toMatch(/white-space:\s*nowrap/);
  expect(rule(".hero-supporting")).toMatch(/white-space:\s*nowrap/);
});

test("reserves a 108px desktop gutter for the floating assistant without changing mobile spacing", () => {
  expect(styles).toMatch(
    /@media\s*\(min-width:\s*761px\)[\s\S]*?\.portfolio-section\s*\{[\s\S]*?padding-inline:\s*max\(clamp\(24px,\s*5\.2vw,\s*92px\),\s*108px\)/,
  );
  expect(styles).toMatch(
    /@media\s*\(min-width:\s*761px\)[\s\S]*?\.resume-panel\s*\{[\s\S]*?width:\s*min\(calc\(100% - 216px\),\s*1540px\)/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.portfolio-section\s*\{[\s\S]*?padding:\s*92px\s+22px/,
  );
});

test("removes assistant cursor and crossfade motion when requested", () => {
  expect(styles).toMatch(
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.chat-transcript,[\s\S]*?\.chat-status\s*\{[\s\S]*?transition:\s*none;/,
  );
  expect(styles).toMatch(
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.chat-cursor\s*\{[\s\S]*?animation:\s*none;/,
  );
});
