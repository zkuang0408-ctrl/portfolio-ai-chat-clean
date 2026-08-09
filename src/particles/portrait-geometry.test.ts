import { describe, expect, it } from "vitest";

import {
  DESKTOP_PORTRAIT_SCALE_MULTIPLIER,
  originalFrameFor,
  originalFrameNormalizedX,
  PORTRAIT_GEOMETRY,
} from "./portrait-geometry";

describe("extended portrait geometry", () => {
  it("defines the extended portrait dimensions and protected band", () => {
    expect(PORTRAIT_GEOMETRY).toEqual({
      width: 1_350,
      height: 1_425,
      originalWidth: 1_104,
      originalHeight: 1_425,
      originalOffsetX: 123,
      protectedMinX: 220,
      protectedMaxX: 900,
    });
  });

  it("maps an extended frame coordinate back into the original frame", () => {
    expect(originalFrameFor(1_350, 1_425)).toEqual({
      left: 123,
      width: 1_104,
    });
    expect(originalFrameNormalizedX(123, 1_350, 1_425)).toBe(0);
    expect(originalFrameNormalizedX(675, 1_350, 1_425)).toBe(0.5);
    expect(originalFrameNormalizedX(1_227, 1_350, 1_425)).toBe(1);
    expect(originalFrameNormalizedX(60, 1_350, 1_425)).toBeLessThan(0);
  });

  it("uses the desktop portrait scale multiplier", () => {
    expect(DESKTOP_PORTRAIT_SCALE_MULTIPLIER).toBe(0.97);
  });
});
