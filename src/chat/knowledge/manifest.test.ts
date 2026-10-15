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

test("publishes the approved portfolio ownership and assistant capability boundaries", () => {
  const profileSource = knowledgeSources.find(({ id }) => id === "profile");

  expect(profileSource?.structuredText).toContain(
    "网站展示的六个项目均为赵实旷参与并完成的作品集项目",
  );
  expect(profileSource?.structuredText).toContain(
    "团队项目不代表赵实旷独立完成",
  );
  expect(profileSource?.structuredText).toContain(
    "具体个人职责仅以本人确认的公开资料为准",
  );
  expect(profileSource?.structuredText).toContain(
    "AI 助手仅回答公开作品集与公开简历中有依据的问题",
  );
  expect(profileSource?.structuredText).toContain(
    "来源链接可跳转到相关作品或页面",
  );
});

test("keeps the assistant's public resume facts aligned with the displayed resume", () => {
  const text = knowledgeSources.find(({ id }) => id === "profile")?.structuredText;
  const resumeText = knowledgeSources.find(({ id }) => id === "resume")?.structuredText;
  for (const section of profile.resumeSections) {
    for (const line of section.lines) {
      expect(text).toContain(line);
      expect(resumeText).toContain(line);
    }
  }
  expect(text).toContain("安踏网球鞋超材料设计");
  expect(text).not.toContain("安徽超材料设计");
  expect(resumeText).toContain("89.1%");
  expect(resumeText).not.toContain("89.19%");
});
