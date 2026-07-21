import { expect, test } from "vitest";

import {
  boundPage,
  pageBoundary,
  pageCounter,
  swipeDirection,
} from "./pdf-reader-state";

test("bounds page numbers to the available range", () => {
  expect(boundPage(0, 18)).toBe(1);
  expect(boundPage(19, 18)).toBe(18);
  expect(boundPage(7, 18)).toBe(7);
});

test("formats current and total page numbers with two digits", () => {
  expect(pageCounter(1, 18)).toEqual({ current: "01", total: "18" });
  expect(pageCounter(7, 9)).toEqual({ current: "07", total: "09" });
});

test("reports whether navigation is available at page boundaries", () => {
  expect(pageBoundary(1, 18)).toEqual({
    canGoPrevious: false,
    canGoNext: true,
  });
  expect(pageBoundary(18, 18)).toEqual({
    canGoPrevious: true,
    canGoNext: false,
  });
});

test("maps dominant horizontal swipes to page directions", () => {
  expect(swipeDirection({ deltaX: -80, deltaY: 12 })).toBe("next");
  expect(swipeDirection({ deltaX: 80, deltaY: 12 })).toBe("previous");
  expect(swipeDirection({ deltaX: 20, deltaY: 65 })).toBeNull();
});
