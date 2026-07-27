// @vitest-environment node

import { describe, expect, test } from "vitest";

import {
  parseAllowedOrigins,
  scfRemoteAddress,
} from "./security";

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

describe("scfRemoteAddress", () => {
  test.each(["203.0.113.8", "2001:db8::8"])(
    "accepts SCF address %s",
    (address) => {
      expect(
        scfRemoteAddress(
          new Headers({ "x-scf-remote-addr": address }),
        ),
      ).toBe(address);
    },
  );

  test.each([
    "",
    "203.0.113.8:443",
    "203.0.113.8, 198.51.100.1",
    "not-an-ip",
    "x".repeat(46),
  ])("rejects invalid SCF address %j", (address) => {
    expect(
      scfRemoteAddress(
        new Headers({ "x-scf-remote-addr": address }),
      ),
    ).toBeUndefined();
  });

  test("does not trust x-forwarded-for", () => {
    expect(
      scfRemoteAddress(
        new Headers({ "x-forwarded-for": "203.0.113.8" }),
      ),
    ).toBeUndefined();
  });
});
