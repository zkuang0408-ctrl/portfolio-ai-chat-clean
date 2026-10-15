import generatedPages from "../portfolio/generated-project-pages.json";

export interface Capability {
  title: string;
  items: readonly string[];
}

export interface ResumeSection {
  readonly label: string;
  readonly title: string;
  readonly lines: readonly string[];
  readonly summaryLines?: readonly string[];
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
  emails: readonly [string, string];
  location: string;
  resumeHref: string;
  resumeSections: readonly ResumeSection[];
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
  emails: ["zkuang0408@gmail.com", "2643414752@qq.com"],
  location: "Shanghai, China",
  resumeHref: "/documents/zhao-shikuang-resume-public.pdf",
  resumeSections: [
    {
      label: "ABOUT",
      title: "关于我",
      lines: [
        "求职意向：产品经理、产品设计。",
        "工业设计专业27届应届生，关注 AI 应用产品、智能交互与生成式设计。",
        "具备用户研究、场景洞察、产品原型、交互流程和视觉表达能力。",
        "能够将复杂场景转化为可理解、可验证的产品方案。",
        "已部署上线个人网站，并配有基于 RAG 的作品集问答助手。",
      ],
    },
    {
      label: "EDUCATION",
      title: "同济大学设计创意学院",
      lines: [
        "工业设计本科 · 2023.09 — 至今",
        "辅修人工智能 AI+。",
        "相关方向：用户研究、交互设计、产品系统设计、智能硬件、XR 场景构建、设计研究方法、智能机器人、机器学习。",
      ],
    },
    {
      label: "PROJECTS",
      title: "核心项目",
      summaryLines: [
        "AI作品集助手｜2026.08—至今：搭建基于 RAG 的作品集问答助手，支持来源引用、项目检索与回答评测。",
        "INKSeat｜2026.03—2026.06：设计座舱电子纸广告终端与推荐系统，完成商业模型测算；获全国高校数字艺术设计大赛三等奖。",
        "EMOVUE｜2025.01—2025.03：设计情绪感知可穿戴相机及配套 App；获米兰设计周全国决赛一等奖。",
        "果实与演化｜2025.09—2025.11：结合 Coze、气候知识库与参数化建模，探索从 AI 生成到食物实体制作的设计流程。",
      ],
      lines: [
        "AI作品集助手｜基于 RAG 的项目检索与评测（2026.08—至今）：聚合6个作品项目与简历，构建含196条知识的 RAG 问答助手，降低招聘者逐页查找信息的成本。独立设计项目／意图路由、BM25 混合排序与 Top-8 证据重排，支持来源引用和个人贡献边界控制。自建600题六类评测集，可回答题严格证据命中率89.1%（482/541），定位跨项目召回与拒答问题。",
        "INKSeat｜智能座舱电子纸广告终端（2026.03—2026.06）：获全国高校数字艺术设计大赛全国三等奖。面向航班座舱广告场景，分析乘客、航司与广告内容之间的信息匹配问题；设计基于乘客画像、内容素材与播放动作的智能推荐逻辑，形成终端界面与后台系统方案；建立180座单机商业模型，模型测算中性情景年增量收入约35.8万元，识别媒体 CPM 与适航成本为关键变量。",
        "EMOVUE｜情绪感知可穿戴相机（2025.01—2025.03）：获米兰设计周中国高校设计学科师生优秀作品展全国决赛一等奖。围绕旅行与内容创作中的“真实情绪难记录、素材整理成本高”问题，完成用户画像与需求分析；设计基于心率、皮肤电信号触发记录的产品逻辑，并规划 AI 素材归档、情绪轨迹和智能剪辑功能；参与产品定位、造型探索、交互流程、App 功能和展示表达。",
        "果实与演化 / Fruit & Evolution｜AI 辅助参数化食物生成设计（2025.09—2025.11）：基于果实演化逻辑，设计“输入条件—形态生成—参数建模—实体制作”的生成式设计流程；使用 Coze 与自建气候知识库，将气候特征、果实形态和风味关系转化为设计生成规则；输出参数化模型、食物原型与展示方案，验证 AI 辅助设计从概念生成到实体制作的可行性。",
      ],
    },
    {
      label: "PRACTICE",
      title: "实践实习经历",
      summaryLines: [
        "腾讯未来信号空间站｜兴趣研究训练生（2025.10—2026.03）：研究游戏、娱乐与青年文化趋势，通过案例与数据分析提炼用户需求和产品机会。",
        "安踏网球鞋超材料设计｜企校合作设计师（2026.01—2026.08）：将缓震、支撑等需求转化为结构参数，设计 AI 辅助生成与仿真评估流程。",
      ],
      lines: [
        "腾讯未来信号空间站｜兴趣研究训练生（2025.10—2026.03）｜腾讯互娱市场与用户研究部（i-MUR）：围绕游戏、娱乐与青年文化领域进行文化信号研究，持续观察内容趋势、用户兴趣变化与圈层传播现象；通过资料检索、案例拆解与数据对比，提炼趋势判断和产品机会，多次在训练任务中获得满分评价；擅长用数据和文化语境支撑观点，能够从分散信息中归纳用户需求、情绪动因与潜在产品方向。",
        "安踏网球鞋超材料设计｜企校合作设计师（2026.01—2026.08）｜安踏体育用品集团有限公司鞋类事业部：将缓震、支撑与轻量化需求拆解为形变量、应力、质量等指标，并映射至结构形态与孔隙密度参数；设计“需求解析—结构生成—仿真评分—参数更新”的 AI 闭环，以性能评分替代人工经验筛选；规划 AI Agent 联动 Grasshopper 与仿真工具，根据目标差距自动调参，输出满足约束的候选结构。",
      ],
    },
    {
      label: "SKILLS",
      title: "技能专长",
      lines: [
        "产品能力：用户研究、竞品分析、需求拆解、用户流程、功能定义、原型表达。",
        "AI 产品：LLM 场景拆解、Prompt／工作流设计、知识库／RAG 基础、推荐逻辑、AI 输出质量评估。",
        "研究表达：访谈整理、问卷分析、信息架构、视觉叙事、项目汇报。",
        "设计工具：Figma、Rhino、Unity、Photoshop、Office。",
      ],
    },
  ],
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
