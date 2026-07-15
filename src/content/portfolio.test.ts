import { expect, test } from "vitest";

import { documents, profile, projects } from "./portfolio";

test("publishes the approved six-project selection in evidence-led order", () => {
  expect(projects.map(({ id }) => id)).toEqual([
    "atempo",
    "inkseat",
    "emovue",
    "urosense",
    "evolution-fruit",
    "first-fly",
  ]);
  expect(projects).toHaveLength(6);
  expect(
    projects.every((project) => project.imageAlt && project.tags.length >= 3),
  ).toBe(true);
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
  expect(serialized).not.toContain("18099592958");
  expect(serialized).not.toContain("2643414752@qq.com");
  expect(serialized).not.toContain("彰武路102号");
});
