// @vitest-environment node

import { expect, expectTypeOf, test } from "vitest";

import { profile, projects } from "../../content/portfolio";
import { knowledgeSources } from "./manifest";
import type { KnowledgeChunk, KnowledgeSource } from "./types";

test("keeps the generated-index source and chunk contract exact", () => {
  expectTypeOf<NonNullable<KnowledgeSource["visualPages"]>>().toEqualTypeOf<
    readonly number[]
  >();
  expectTypeOf<KnowledgeChunk["publicHref"]>().toEqualTypeOf<string>();
});

test("publishes only the approved portfolio knowledge sources in display order", () => {
  expect(knowledgeSources.map(({ id }) => id)).toEqual([
    "profile",
    "resume",
    "inkseat",
    "emovue",
    "evolution-fruit",
    "atempo",
    "urosense",
    "first-fly",
  ]);

  expect(knowledgeSources.find(({ id }) => id === "resume")).toMatchObject({
    filePath: "public/documents/zhao-shikuang-resume-public.pdf",
    pageCount: 1,
    publicHref: "/documents/zhao-shikuang-resume-public.pdf",
  });
  expect(knowledgeSources.find(({ id }) => id === "profile")).toMatchObject({
    publicHref: "#about",
  });
  expect(knowledgeSources.find(({ id }) => id === "inkseat")).toMatchObject({
    visualPages: [13],
  });
  expect(knowledgeSources.find(({ id }) => id === "urosense")).toMatchObject({
    visualPages: [17, 18, 19, 24],
  });
  expect(
    knowledgeSources.find(({ id }) => id === "atempo")?.visualPages,
  ).toBeUndefined();
  expect(
    knowledgeSources.find(({ id }) => id === "first-fly")?.visualPages,
  ).toBeUndefined();

  const projectSources = knowledgeSources.filter(
    (source) => source.kind === "project-pdf",
  );
  expect(projectSources).toHaveLength(projects.length);
  for (const project of projects) {
    expect(projectSources.find(({ id }) => id === project.id)).toMatchObject({
      filePath: `public${project.pdf.href}`,
      publicHref: project.pdf.href,
      pageCount: project.pdf.pageCount,
    });
  }

  const serializedSources = JSON.stringify(knowledgeSources);
  const privateExternalResumeFilename = "A4 (2).pdf";

  expect(serializedSources).toContain("赵实旷");
  expect(serializedSources).not.toContain(privateExternalResumeFilename);
  expect(serializedSources).not.toContain(profile.location);
  expect(serializedSources).not.toMatch(/(?:phone|qq|address|location|@)/i);
});
