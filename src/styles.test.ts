import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? "";
}

function rulesContaining(selector: string): string {
  return Array.from(styles.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    .filter((match) => match[1]?.includes(selector))
    .map((match) => match[2])
    .join("\n");
}

test("uses the visible viewport height at the mobile breakpoint", () => {
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.hero\s*\{\s*min-height:\s*100svh;/,
  );
  expect(styles).not.toMatch(/min-height:\s*760px/);
});

test("compresses the hero composition for short mobile viewports", () => {
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)\s*and\s*\(max-height:\s*680px\)/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)\s*and\s*\(max-height:\s*680px\)[\s\S]*?\.identity\s*\{\s*top:\s*12px;/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)\s*and\s*\(max-height:\s*680px\)[\s\S]*?\.portrait-stage\s*\{[\s\S]*?top:\s*80px;[\s\S]*?bottom:\s*18px;/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)\s*and\s*\(max-height:\s*680px\)[\s\S]*?\.headline-wrap\s*\{[\s\S]*?bottom:\s*18px;/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)\s*and\s*\(max-height:\s*680px\)[\s\S]*?\.headline\s*\{\s*font-size:\s*clamp\(38px,\s*12vw,\s*52px\);/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)\s*and\s*\(max-height:\s*680px\)[\s\S]*?\.headline-wrap small\s*\{\s*margin-top:\s*8px;/,
  );
});

test("hides the canvas in controller fallback and error states", () => {
  expect(styles).toMatch(
    /\.portrait-stage--fallback \.portrait-canvas,\s*\.portrait-stage--error \.portrait-canvas,\s*\.portrait-stage\.is-error \.portrait-canvas\s*\{\s*display:\s*none;/,
  );
});

test("never presents the portrait sampling image", () => {
  expect(styles).toMatch(
    /\.portrait-base\s*\{[\s\S]*?opacity:\s*0;/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.portrait-base\s*\{\s*opacity:\s*0;/,
  );
  expect(styles).toMatch(
    /\.portrait-stage--fallback \.portrait-base,\s*\.portrait-stage--error \.portrait-base,\s*\.portrait-stage\.is-error \.portrait-base\s*\{[\s\S]*?opacity:\s*0;/,
  );
  expect(styles).not.toMatch(/opacity:\s*0\.(?:28|32|46)/);
});

test("reveals an accessible status message in error states", () => {
  expect(styles).toMatch(
    /\.portrait-stage--fallback \.portrait-error,\s*\.portrait-stage--error \.portrait-error,\s*\.portrait-stage\.is-error \.portrait-error\s*\{\s*opacity:\s*1;/,
  );
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
    ".documents",
    ".contact",
  ]) {
    expect(styles, selector).toContain(`${selector} {`);
  }
  expect(styles).toMatch(/a:focus-visible\s*\{[\s\S]*?outline:/);
});

test("uses a clipped 16:9 reader stage and a centered editorial counter", () => {
  expect(rule(".project-reader-stage")).toMatch(/position:\s*relative/);
  expect(rule(".project-reader-stage")).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);
  expect(rule(".project-reader-stage")).toMatch(/overflow:\s*hidden/);
  expect(rule(".project-reader-stage")).toMatch(/touch-action:\s*pan-y/);
  expect(rule(".project-reader-stage")).toMatch(/background:\s*#[0-9a-f]{3,6}/i);
  expect(rule(".project-reader canvas")).toMatch(/display:\s*block/);
  expect(rule(".project-reader canvas")).toMatch(/width:\s*100%/);
  expect(rule(".project-reader canvas")).toMatch(/height:\s*100%/);
  expect(rule(".project-reader canvas")).toMatch(/object-fit:\s*contain/);
  expect(rule(".project-reader-counter")).toMatch(/text-align:\s*center/);
  expect(rule(".project-reader-counter")).toMatch(/letter-spacing:/);
  expect(rule(".project-reader-counter")).toMatch(/color:\s*#7d7d7d/);
  expect(styles).not.toMatch(/\.project-media\s+img\s*\{/);
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
  expect(rule(".project-reader canvas")).toMatch(/transition:\s*opacity/);
});

test("keeps mobile reader geometry compact without shrinking the hit target", () => {
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.project-reader-chevron svg\s*\{[\s\S]*?width:\s*36px;[\s\S]*?height:\s*60px;/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.project-reader-chevron--previous\s*\{[\s\S]*?left:\s*-6px;/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.project-reader-chevron--next\s*\{[\s\S]*?right:\s*-6px;/,
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
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.project-reader canvas\s*\{[\s\S]*?transition:\s*none;/,
  );
});

test("positions the frameless assistant at the approved desktop coordinates", () => {
  const heroChat = rule(".hero-chat");

  expect(heroChat).toMatch(/position:\s*absolute/);
  expect(heroChat).toMatch(/z-index:\s*3/);
  expect(heroChat).toMatch(/top:\s*39%/);
  expect(heroChat).toMatch(/left:\s*6\.5%/);
  expect(heroChat).toMatch(/width:\s*min\(330px,\s*24vw\)/);
  expect(heroChat).toMatch(/border:\s*0/);
  expect(heroChat).toMatch(/border-radius:\s*0/);
  expect(heroChat).toMatch(/background:\s*transparent/);
  expect(heroChat).toMatch(/box-shadow:\s*none/);
});

test("uses quiet underlined recommendations with accessible pointer targets", () => {
  const recommendations = rule(".chat-recommendation");

  expect(recommendations).toMatch(/min-height:\s*44px/);
  expect(recommendations).toMatch(/border:\s*0/);
  expect(recommendations).toMatch(/border-bottom:\s*1px\s+solid/);
  expect(recommendations).toMatch(/background:\s*transparent/);
  expect(recommendations).not.toMatch(/border-radius|box-shadow/);
});

test("moves the assistant into normal flow at the mobile breakpoint", () => {
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.hero-chat\s*\{[\s\S]*?position:\s*relative;[\s\S]*?top:\s*auto;[\s\S]*?left:\s*auto;[\s\S]*?width:\s*100%;/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.hero\s*\{[\s\S]*?padding-bottom:/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.hero-scene\s*\{[\s\S]*?position:\s*relative;[\s\S]*?height:\s*100svh;/,
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
