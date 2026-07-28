// @vitest-environment node

import { describe, expect, test } from "vitest";

import { parseAllowedOrigins } from "./security";

describe("parseAllowedOrigins", () => {
  test("parses exact unique HTTPS origins", () => {
    expect(
      parseAllowedOrigins(
        [
          "https://portfolio-ai-chat-clean.pages.dev",
          "https://portfolio.example",
          "https://portfolio-ai-chat-clean.pages.dev",
        ].join(","),
      ),
    ).toEqual([
      "https://portfolio-ai-chat-clean.pages.dev",
      "https://portfolio.example",
    ]);
  });

  test.each([
    undefined,
    "",
    " ",
    "*",
    "http://portfolio.example",
    "https://portfolio.example/path",
    "https://portfolio.example/",
    "https://user@portfolio.example",
    "https://portfolio.example,",
  ])("rejects invalid origin configuration %j", (value) => {
    expect(parseAllowedOrigins(value)).toBeUndefined();
  });
});
