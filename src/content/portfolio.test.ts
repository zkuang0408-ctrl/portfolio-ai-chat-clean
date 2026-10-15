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

test("matches the October 2026 resume instead of stale education and practice copy", () => {
  const text = profile.resumeSections.flatMap(({ title, lines }) => [title, ...lines]).join("\n");

  expect(text).toContain("27届应届生");
  expect(text).toContain("求职意向：产品经理、产品设计");
  expect(text).not.toContain("大三");
  expect(text).not.toContain("安徽超材料设计");
  expect(text).toContain("安踏网球鞋超材料设计");
  expect(text).toContain("企校合作设计师");
  expect(text).toContain("2026.01—2026.08");
  expect(text).toContain("腾讯互娱市场与用户研究部（i-MUR）");
  expect(text).toContain("2025.10—2026.03");
  expect(text).toContain("AI作品集助手");
  expect(text).toContain("482/541");
  expect(text).toContain("89.1%");
  expect(text).toContain("180座单机商业模型");
  expect(text).toContain("35.8万元");
  expect(text).toContain("全国三等奖");
  expect(text).toContain("全国决赛一等奖");
  expect(text).toContain("Grasshopper");
});
