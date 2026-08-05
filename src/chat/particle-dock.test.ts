import { expect, test } from "vitest";

import { clampDockY, resolveDockPosition } from "./particle-dock";

const metrics = { edge: 16, top: 72, bottom: 24, radius: 28 };
const viewport = { width: 1200, height: 800 };

test("snaps a dragged ball to its nearest safe edge and clamps its vertical centre", () => {
  expect(resolveDockPosition({ x: 1100, y: 900 }, viewport, metrics)).toEqual({
    side: "right",
    x: 1156,
    y: 748,
  });
  expect(resolveDockPosition({ x: 40, y: 10 }, viewport, metrics)).toEqual({
    side: "left",
    x: 44,
    y: 100,
  });
});

test("keeps a stored side at the midpoint and reclamps its y coordinate after resize", () => {
  expect(resolveDockPosition({ x: 600, y: 360 }, viewport, metrics, "right").side).toBe(
    "right",
  );
  expect(clampDockY(500, { width: 390, height: 300 }, metrics)).toBe(248);
  expect(clampDockY(Number.NaN, viewport, metrics)).toBe(100);
});
