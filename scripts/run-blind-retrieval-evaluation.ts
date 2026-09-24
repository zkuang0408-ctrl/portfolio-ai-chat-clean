import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import generatedIndex from "../src/chat/knowledge/generated-index.json";
import type { GeneratedKnowledgeIndex } from "../src/chat/knowledge/types.js";
import { blindEvaluationCases } from "../src/chat/retrieval/blind-evaluation-cases.js";
import { runBlindRetrievalEvaluation } from "../src/chat/retrieval/blind-evaluation-runner.js";
import { createStructuredHybridRetriever } from "../src/chat/retrieval/structured-hybrid.js";

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

const categoryLabels = {
  fact: "事实",
  mechanism: "机制",
  boundary: "能力与边界",
  comparison: "跨项目比较",
  contribution: "个人贡献",
  abstention: "拒答",
} as const;

function expectedCriterion(
  evaluationCase: (typeof blindEvaluationCases)[number],
): string {
  if (evaluationCase.expectNoResults) return "不得返回作品集证据";
  const criteria = [
    ...(evaluationCase.expectedProjectIds?.map((id) => `项目：${id}`) ?? []),
    ...(evaluationCase.requiredAllChunkIds?.map((id) => `必须：${id}`) ?? []),
    ...(evaluationCase.requiredAnyChunkIds?.length
      ? [`至少一个：${evaluationCase.requiredAnyChunkIds.join(" / ")}`]
      : []),
    ...(evaluationCase.minimumDistinctSources
      ? [`至少 ${evaluationCase.minimumDistinctSources} 个来源`]
      : []),
  ];
  return criteria.join("；");
}

function questionBankMarkdown(): string {
  const sections = Object.entries(categoryLabels).map(([category, label]) => {
    const questions = blindEvaluationCases
      .filter((item) => item.category === category)
      .map(
        (item) =>
          `- **${item.id}**：${item.query}\n  - 通过条件：${expectedCriterion(item)}`,
      )
      .join("\n");
    return `## ${label}\n\n${questions}`;
  });

  return `# 作品集 RAG 60 题留出题库

这套题库独立于原有 13 个回归查询，首次运行前已经固定题目和通过条件。它覆盖事实、机制、能力边界、跨项目比较、个人贡献与拒答六类能力。

题库直接列出评分依据，便于复核；后续若依据本次失败样本调优，原题只能作为回归集，不再称为盲测题。

${sections.join("\n\n")}
`;
}

function markdownReport(
  report: Awaited<ReturnType<typeof runBlindRetrievalEvaluation>>,
): string {
  const categoryRows = Object.entries(report.summary.byCategory)
    .map(
      ([category, summary]) =>
        `| ${categoryLabels[category as keyof typeof categoryLabels] ?? category} | ${summary.passed} | ${summary.total} | ${percent(summary.passRate)} |`,
    )
    .join("\n");
  const detailRows = report.results
    .map(
      (result) =>
        `| ${result.id} | ${categoryLabels[result.category]} | ${result.query.replaceAll("|", "\\|")} | ${result.passed ? "通过" : "未通过"} | ${result.retrievedProjectIds.join(", ") || "—"} | ${result.missingChunkIds.join("<br>") || (result.missingAlternativeGroup ? "缺少任一必需证据" : "—")} | ${result.unexpectedResultCount || "—"} |`,
    )
    .join("\n");
  const abstention = report.summary.byCategory.abstention ?? {
    total: 0,
    passed: 0,
    passRate: 0,
  };
  const answerableTotal = report.summary.total - abstention.total;
  const answerablePassed = report.summary.passed - abstention.passed;
  const answerableRate = answerableTotal === 0
    ? 0
    : answerablePassed / answerableTotal;

  return `# 作品集 RAG 新题库检索基线

- 生成时间：${report.generatedAt}
- 题目数：${report.summary.total}
- 检索上限：Top ${report.retrievalLimit}
- 严格通过：${report.summary.passed}/${report.summary.total}
- 严格通过率：${percent(report.summary.passRate)}
- 作品集可回答题证据命中：${answerablePassed}/${answerableTotal}（${percent(answerableRate)}）
- 未知/隐私问题正确拒答：${abstention.passed}/${abstention.total}（${percent(abstention.passRate)}）

这里的“通过”表示检索结果满足预先写定的项目、知识片段、来源多样性或拒答条件。它衡量检索正确性，不等同于最终自然语言回答准确率。

## 分类结果

| 类别 | 通过 | 总数 | 通过率 |
| --- | ---: | ---: | ---: |
${categoryRows}

## 逐题结果

| 题号 | 类别 | 问题 | 结果 | 检索项目 | 缺失证据 | 不应出现的结果数 |
| --- | --- | --- | --- | --- | --- | ---: |
${detailRows}
`;
}

const retriever = createStructuredHybridRetriever(
  generatedIndex as GeneratedKnowledgeIndex,
);
const report = await runBlindRetrievalEvaluation(
  blindEvaluationCases,
  retriever,
);
const date = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
  .format(new Date())
  .replaceAll("-", "");
const outputDirectory = resolve(process.cwd(), "output");
const basePath = resolve(
  outputDirectory,
  `rag-blind-retrieval-baseline-${date}`,
);
const questionBankPath = resolve(
  outputDirectory,
  `rag-question-bank-${date}.md`,
);
const shouldWriteReports = !process.argv.includes("--no-write");

if (shouldWriteReports) {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(`${basePath}.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(`${basePath}.md`, markdownReport(report), "utf8"),
    writeFile(questionBankPath, questionBankMarkdown(), "utf8"),
  ]);
}

console.log(
  JSON.stringify(
    {
      output: shouldWriteReports
        ? [`${basePath}.json`, `${basePath}.md`, questionBankPath]
        : [],
      summary: report.summary,
    },
    null,
    2,
  ),
);
