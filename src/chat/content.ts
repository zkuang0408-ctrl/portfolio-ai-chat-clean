export type ChatLocale = "zh" | "en";

export interface ChatContent {
  readonly assistantLabel: string;
  readonly intro: string;
  readonly recommendationsLabel: string;
  readonly quickStartLabel: string;
  readonly quickStartDescription: string;
  readonly topicLabel: string;
  readonly topicLabels: readonly [string, string];
  readonly showGuideLabel: string;
  readonly hideGuideLabel: string;
  readonly mobileGuidePrompt: string;
  readonly mobileGuideAction: string;
  readonly composerLabel: string;
  readonly recommendations: readonly [string, string, string, string];
  readonly transcriptLabel: string;
  readonly inputLabel: string;
  readonly placeholder: string;
  readonly sendLabel: string;
  readonly sendText: string;
  readonly sourcesLabel: string;
  readonly disclosure: string;
}

export const CHAT_CONTENT = {
  zh: {
    assistantLabel: "ASK SHIKUANG · AI",
    intro: "我是赵实旷的 AI 作品集助手。回答仅依据本网站的简历与作品资料。",
    recommendationsLabel: "推荐了解的问题",
    quickStartLabel: "从这里开始",
    quickStartDescription: "用一分钟了解他的背景、能力与方向。",
    topicLabel: "按主题继续问",
    topicLabels: ["能力与方向", "作品与方法"],
    showGuideLabel: "查看推荐问题",
    hideGuideLabel: "收起推荐问题",
    mobileGuidePrompt: "想先了解哪件作品？",
    mobileGuideAction: "开始提问",
    composerLabel: "继续提问",
    recommendations: [
      "请用一分钟介绍赵实旷",
      "赵实旷的核心能力是什么？",
      "哪个项目最能体现他的系统思考？",
      "赵实旷目前在寻找什么机会？",
    ],
    transcriptLabel: "与赵实旷 AI 作品集助手的对话",
    inputLabel: "输入你想了解的问题",
    placeholder: "继续了解赵实旷……",
    sendLabel: "发送问题",
    sendText: "发送",
    sourcesLabel: "回答依据",
    disclosure: "AI 回答可能存在偏差，请以标注的作品与简历原文为准。",
  },
  en: {
    assistantLabel: "ASK SHIKUANG · AI",
    intro:
      "I’m Shikuang Zhao’s AI portfolio assistant. Answers are grounded only in the résumé and project materials on this site.",
    recommendationsLabel: "Suggested questions",
    quickStartLabel: "Start here",
    quickStartDescription: "A one-minute view of his background, capabilities, and direction.",
    topicLabel: "Explore by topic",
    topicLabels: ["Capabilities & direction", "Work & method"],
    showGuideLabel: "View suggested questions",
    hideGuideLabel: "Hide suggested questions",
    mobileGuidePrompt: "Which project would you like to explore?",
    mobileGuideAction: "Start asking",
    composerLabel: "Continue the conversation",
    recommendations: [
      "Give me a one-minute introduction to Shikuang.",
      "What are Shikuang Zhao’s core capabilities?",
      "Which project best represents his systems thinking?",
      "What opportunities is Shikuang currently open to?",
    ],
    transcriptLabel: "Conversation with Shikuang’s AI portfolio assistant",
    inputLabel: "Ask a question",
    placeholder: "Ask more about Shikuang…",
    sendLabel: "Send question",
    sendText: "Send",
    sourcesLabel: "Evidence sources",
    disclosure:
      "AI answers may be imperfect. Refer to the cited portfolio and résumé sources.",
  },
} as const satisfies Record<ChatLocale, ChatContent>;
