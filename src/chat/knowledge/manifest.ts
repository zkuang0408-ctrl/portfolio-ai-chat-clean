import { profile, projects } from "../../content/portfolio";

import type { KnowledgeSource } from "./types";

const profileStructuredText = [
  `姓名：${profile.name}`,
  `方向：${profile.discipline}`,
  `简介：${profile.introduction}`,
  `教育：${profile.education.school}，${profile.education.program}，${profile.education.period}`,
  `能力：${profile.capabilities
    .map(({ title, items }) => `${title}（${items.join("、")}）`)
    .join("；")}`,
  "作品归属：网站展示的六个项目均为赵实旷参与并完成的作品集项目；团队项目不代表赵实旷独立完成；具体个人职责仅以本人确认的公开资料为准。",
  "AI 助手能力：AI 助手仅回答公开作品集与公开简历中有依据的问题，来源链接可跳转到相关作品或页面；不访问私密、实时或外部个人信息。",
  ...profile.resumeSections.map(
    ({ title, lines }) => `公开简历（2026-10-15 核对）：${title}\n${lines.join("\n")}`,
  ),
].join("\n");

const projectAliases: Readonly<Record<string, readonly string[]>> = {
  inkseat: ["INKSeat", "智能座舱", "电子纸广告终端", "Explainable Recommendation"],
  emovue: ["EMOVUE", "可穿戴相机", "情绪感知", "Wearable Camera"],
  "evolution-fruit": [
    "Fruit & Evolution",
    "果实演化",
    "参数化食物",
    "Generative Form",
  ],
  atempo: ["Atempo", "Breath Mirror", "呼吸引导", "智能交互"],
  urosense: ["UroSense", "医疗场景", "智慧产品", "Smart Product"],
  "first-fly": ["First Fly", "未来出行", "飞行座舱", "Future Mobility"],
};

const projectVisualPages: Readonly<Record<string, readonly number[]>> = {
  inkseat: [13],
  urosense: [17, 18, 19, 24],
};

const projectSources: readonly KnowledgeSource[] = projects.map((project) => ({
  id: project.id,
  kind: "project-pdf",
  title: project.title,
  aliases: projectAliases[project.id] ?? [project.title, project.type],
  tags: project.tags,
  filePath: `public${project.pdf.href}`,
  publicHref: project.pdf.href,
  projectId: project.id,
  pageCount: project.pdf.pageCount,
  ...(projectVisualPages[project.id]
    ? { visualPages: projectVisualPages[project.id] }
    : {}),
}));

export const knowledgeSources: readonly KnowledgeSource[] = [
  {
    id: "profile",
    kind: "profile",
    title: `${profile.name} · ${profile.discipline}`,
    aliases: [
      profile.name,
      "Zhao Shikuang",
      "赵实旷",
      "Industrial Design",
      "AI+",
      "作品集项目",
      "portfolio projects",
      "AI 作品集助手",
      "portfolio assistant",
    ],
    tags: ["工业设计", "AI 应用", "智能交互", "生成式设计"],
    structuredText: profileStructuredText,
    publicHref: "#about",
  },
  {
    id: "resume",
    kind: "resume",
    title: `${profile.name} · Resume`,
    aliases: [profile.name, "Zhao Shikuang", "简历", "Resume"],
    tags: ["工业设计", "AI+", "公开简历"],
    structuredText: profile.resumeSections
      .map(({ title, lines }) => `${title}\n${lines.join("\n")}`)
      .join("\n"),
    filePath: "public/documents/zhao-shikuang-resume-public.pdf",
    publicHref: "/documents/zhao-shikuang-resume-public.pdf",
    pageCount: 1,
  },
  ...projectSources,
];
