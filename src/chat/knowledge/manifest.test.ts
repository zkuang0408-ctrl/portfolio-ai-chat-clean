// @vitest-environment node

import { expect, test } from "vitest";

import { knowledgeSources } from "./manifest";

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

  const serializedSources = JSON.stringify(knowledgeSources);
  const privateExternalResumeFilename = String.fromCharCode(
    65,
    52,
    32,
    40,
    50,
    41,
    46,
    112,
    100,
    102,
  );

  expect(serializedSources).toContain("赵实旷");
  expect(serializedSources).not.toContain(privateExternalResumeFilename);
  expect(serializedSources).not.toMatch(/(?:phone|qq|address|location|@)/i);
});
