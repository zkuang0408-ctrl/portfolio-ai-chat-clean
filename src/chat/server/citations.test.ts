// @vitest-environment node

import { describe, expect, test } from "vitest";

import { createCitationParser } from "./citations";

describe("createCitationParser", () => {
  test("holds a split marker, strips markers, and collects allowed IDs", () => {
    const parser = createCitationParser(new Set(["S1", "S2"]));

    expect(parser.push("Answer [[S")).toBe("Answer ");
    expect(parser.push("1]] end [[BAD]]")).toBe(" end ");
    expect(parser.finish()).toEqual({ text: "", sourceIds: ["S1"] });
  });

  test("handles a valid marker split at every character boundary", () => {
    const input = "Before [[S2]] after";
    for (let split = 0; split <= input.length; split += 1) {
      const parser = createCitationParser(new Set(["S2"]));
      const visible = parser.push(input.slice(0, split)) + parser.push(input.slice(split));
      const finished = parser.finish();

      expect(visible + finished.text).toBe("Before  after");
      expect(finished.sourceIds).toEqual(["S2"]);
    }
  });

  test("deduplicates valid IDs in first-seen order", () => {
    const parser = createCitationParser(new Set(["S1", "S2"]));
    const visible = parser.push("A [[S2]] B [[S1]] C [[S2]]");

    expect(visible).toBe("A  B  C ");
    expect(parser.finish().sourceIds).toEqual(["S2", "S1"]);
  });

  test("strips malformed and disallowed complete markers without citing them", () => {
    const parser = createCitationParser(new Set(["S1", "S9", "BAD"]));

    expect(parser.push("A [[BAD]] B [[S9]] C [[S1 extra]] D [[S1]]")).toBe(
      "A  B  C  D ",
    );
    expect(parser.finish().sourceIds).toEqual(["S1"]);
  });

  test("preserves ordinary brackets and flushes an unfinished marker as text", () => {
    const parser = createCitationParser(new Set(["S1"]));

    expect(parser.push("array[0] [")).toBe("array[0] ");
    expect(parser.push("[S")).toBe("");
    expect(parser.finish()).toEqual({ text: "[[S", sourceIds: [] });
  });
});
