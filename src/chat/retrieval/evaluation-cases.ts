export interface RetrievalEvaluationCase {
  readonly name: string;
  readonly query: string;
  readonly locale: "zh" | "en";
  readonly requiredChunkIds?: readonly string[];
  readonly requiredSourceIds?: readonly string[];
  readonly forbiddenPrimaryChunkIds?: readonly string[];
  readonly minimumDistinctSources?: number;
  readonly expectNoResults?: boolean;
}

export const portfolioRetrievalEvaluationCases: readonly RetrievalEvaluationCase[] = [
  {
    name: "INKSeat Chinese overview",
    query: "inkseat是什么作品",
    locale: "zh",
    requiredChunkIds: ["inkseat:claim:inkseat.overview"],
    forbiddenPrimaryChunkIds: ["inkseat:p14:c0", "inkseat:p18:c0"],
  },
  {
    name: "INKSeat architecture",
    query: "INKSeat的系统架构是什么",
    locale: "zh",
    requiredChunkIds: ["inkseat:claim:inkseat.architecture"],
  },
  {
    name: "INKSeat problem",
    query: "INKSeat解决了什么问题",
    locale: "zh",
    requiredChunkIds: ["inkseat:claim:inkseat.problem"],
  },
  {
    name: "EMOVUE emotion capture",
    query: "EMOVUE如何自动捕捉情绪瞬间",
    locale: "zh",
    requiredChunkIds: ["emovue:claim:emovue.technical-prototype"],
  },
  {
    name: "Fruit and Evolution generation",
    query: "Fruit & Evolution如何生成果实形态",
    locale: "zh",
    requiredChunkIds: [
      "evolution-fruit:claim:evolution-fruit.algorithm",
      "evolution-fruit:claim:evolution-fruit.parametric-model",
    ],
  },
  {
    name: "Atempo breath feedback",
    query: "Atempo如何把呼吸转化为反馈",
    locale: "zh",
    requiredChunkIds: ["atempo:claim:atempo.data-translation"],
  },
  {
    name: "UroSense measurement flow",
    query: "UroSense如何完成尿量测量",
    locale: "zh",
    requiredChunkIds: ["urosense:claim:urosense.measurement-flow"],
  },
  {
    name: "First Fly English overview",
    query: "What is First Fly?",
    locale: "en",
    requiredChunkIds: ["first-fly:claim:first-fly.overview"],
  },
  {
    name: "cross-project systems thinking",
    query: "哪个项目最能体现系统思考？",
    locale: "zh",
    minimumDistinctSources: 2,
  },
  {
    name: "unrelated private scheduling",
    query: "赵实旷周末几点有空？",
    locale: "zh",
    expectNoResults: true,
  },
] as const;
