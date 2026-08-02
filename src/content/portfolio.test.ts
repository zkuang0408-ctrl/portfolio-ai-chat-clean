import { expect, test } from "vitest";

import { documents, profile, projects } from "./portfolio";

test("publishes the approved six-project selection in evidence-led order", () => {
  expect(projects.map(({ id }) => id)).toEqual([
    "inkseat",
    "emovue",
    "evolution-fruit",
    "atempo",
    "urosense",
    "first-fly",
  ]);
  expect(projects).toHaveLength(6);
  expect(projects.map(({ pdf }) => [pdf.href, pdf.pageCount])).toEqual([
    ["/projects/pdfs/inkseat.pdf", 18],
    ["/projects/pdfs/emovue.pdf", 19],
    ["/projects/pdfs/fruit-evolution.pdf", 25],
    ["/projects/pdfs/atempo.pdf", 20],
    ["/projects/pdfs/urosense.pdf", 25],
    ["/projects/pdfs/first-fly.pdf", 28],
  ]);
  expect(projects.every((project) => project.tags.length >= 3)).toBe(true);
});

test("uses stable document paths for later asset replacement", () => {
  expect(documents.map(({ href }) => href)).toEqual([
    "/documents/zhao-shikuang-portfolio.pdf",
    "/documents/zhao-shikuang-portfolio.pptx",
  ]);
});

test("keeps restricted resume details out of public content", () => {
  const serialized = JSON.stringify({ documents, profile, projects });

  expect(serialized).toContain("zkuang0408@gmail.com");
  expect(serialized).toContain("2643414752@qq.com");
  expect(serialized).toContain("Shanghai, China");
  expect(serialized).not.toMatch(/\+?86|189\d{8}|上海市.+(?:路|号)/);
  expect(profile.resumeHref).toBe("/documents/zhao-shikuang-resume-public.pdf");
  expect(profile.resumeSections.length).toBeGreaterThan(3);
});
