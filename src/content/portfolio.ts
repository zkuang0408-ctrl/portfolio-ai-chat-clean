import generatedPages from "../portfolio/generated-project-pages.json";

export interface Capability {
  title: string;
  items: readonly string[];
}

export interface Profile {
  name: string;
  discipline: string;
  introduction: string;
  education: {
    school: string;
    program: string;
    period: string;
  };
  capabilities: readonly Capability[];
  email: string;
  location: string;
}

export interface ProjectPageAsset {
  readonly page: number;
  readonly mobile: string;
  readonly desktop: string;
}

export interface ProjectPdf {
  href: string;
  pageCount: number;
  title: string;
  pages: readonly ProjectPageAsset[];
}

export interface Project {
  id: string;
  number: string;
  title: string;
  type: string;
  summary: string;
  role: string;
  tags: readonly string[];
  pdf: ProjectPdf;
}

export interface DocumentLink {
  label: string;
  format: "PDF" | "PPTX";
  href: string;
  filename: string;
}

function pagesFor(projectId: string): readonly ProjectPageAsset[] {
  const entry = generatedPages.projects.find(({ id }) => id === projectId);
  if (!entry) {
    throw new Error(`Missing generated pages for ${projectId}`);
  }
  return entry.pages;
}

export const profile: Profile = {
  name: "赵实旷",
  discipline: "Industrial Design · AI+",
  introduction:
    "同济大学工业设计学生，关注 AI 应用、智能交互与生成式设计。我从用户研究和场景洞察出发，把复杂情境转译为可解释、可测试的产品与体验。",
  education: {
    school: "同济大学设计创意学院",
    program: "工业设计本科 · 辅修人工智能 AI+",
    period: "2023 — Present",
  },
  capabilities: [
    {
      title: "Research & Strategy",
      items: ["用户研究", "竞品与场景分析", "需求与产品定义"],
    },
    {
      title: "Product & Interaction",
      items: ["产品系统", "交互流程", "原型与视觉表达"],
    },
    {
      title: "AI & Generative Design",
      items: ["LLM 场景拆解", "Prompt / Workflow", "RAG 与输出质量"],
    },
  ],
  email: "zkuang0408@gmail.com",
  location: "Shanghai, China",
};

export const projects: readonly Project[] = [
  {
    id: "inkseat",
    number: "01",
    title: "INKSeat",
    type: "Smart Cabin · Explainable Recommendation",
    summary:
      "面向航班座舱，设计会解释推荐理由的电子纸广告终端与内容推送系统。",
    role: "系统分析、信息架构、推荐逻辑、终端与界面表达",
    tags: ["AI Product", "E-paper", "UI/UX"],
    pdf: {
      href: "/projects/pdfs/inkseat.pdf",
      pageCount: 18,
      title: "INKSeat complete project PDF",
      pages: pagesFor("inkseat"),
    },
  },
  {
    id: "emovue",
    number: "02",
    title: "EMOVUE",
    type: "Wearable Camera · Emotion Sensing",
    summary:
      "通过心率与皮肤电信号捕捉情绪波动瞬间，让记录与 AI 剪辑更自然地发生。",
    role: "产品定位、造型探索、交互流程、应用界面与包装",
    tags: ["Wearable", "AI Editing", "Product Visual"],
    pdf: {
      href: "/projects/pdfs/emovue.pdf",
      pageCount: 19,
      title: "EMOVUE complete project PDF",
      pages: pagesFor("emovue"),
    },
  },
  {
    id: "evolution-fruit",
    number: "03",
    title: "Fruit & Evolution",
    type: "Parametric Food · Generative Form",
    summary:
      "从果实演化逻辑出发，用参数化模型生成新的食物形态，并完成实体制作。",
    role: "概念建构、参数化模型、视觉生成、制作展示",
    tags: ["Parametric", "Food Design", "Physical Prototype"],
    pdf: {
      href: "/projects/pdfs/fruit-evolution.pdf",
      pageCount: 25,
      title: "Fruit & Evolution complete project PDF",
      pages: pagesFor("evolution-fruit"),
    },
  },
  {
    id: "atempo",
    number: "04",
    title: "Atempo / Breath Mirror",
    type: "Breathing Guidance · Intelligent Interaction",
    summary:
      "通过呼吸相位同步，让引导系统先理解用户节律，再生成可持续跟随的反馈。",
    role: "研究整理、交互流程、智能闭环、界面展示",
    tags: ["Interaction", "Generative Guidance", "Prototype"],
    pdf: {
      href: "/projects/pdfs/atempo.pdf",
      pageCount: 20,
      title: "Atempo / Breath Mirror complete project PDF",
      pages: pagesFor("atempo"),
    },
  },
  {
    id: "urosense",
    number: "05",
    title: "UroSense",
    type: "Medical Context · Smart Product",
    summary:
      "以低侵入附件进入既有病房设施，降低患者主动测量负担并改善护理数据连续性。",
    role: "场景调研、问题定义、产品方案、结构表达",
    tags: ["Healthcare", "Smart Hardware", "Human Factors"],
    pdf: {
      href: "/projects/pdfs/urosense.pdf",
      pageCount: 25,
      title: "UroSense complete project PDF",
      pages: pagesFor("urosense"),
    },
  },
  {
    id: "first-fly",
    number: "06",
    title: "First Fly",
    type: "Future Mobility · Experience Concept",
    summary:
      "面向 2035 短途空中出行，从身体尺度重新想象飞行座舱与体验装置。",
    role: "趋势研究、概念叙事、形态方案、整体渲染",
    tags: ["Future Mobility", "Cabin Experience", "Concept"],
    pdf: {
      href: "/projects/pdfs/first-fly.pdf",
      pageCount: 28,
      title: "First Fly complete project PDF",
      pages: pagesFor("first-fly"),
    },
  },
];

export const documents: readonly DocumentLink[] = [
  {
    label: "Portfolio · Complete Selection",
    format: "PDF",
    href: "/documents/zhao-shikuang-portfolio.pdf",
    filename: "Zhao-Shikuang-Portfolio.pdf",
  },
  {
    label: "Portfolio · Editable Deck",
    format: "PPTX",
    href: "/documents/zhao-shikuang-portfolio.pptx",
    filename: "Zhao-Shikuang-Portfolio.pptx",
  },
];
