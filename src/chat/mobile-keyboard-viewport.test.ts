import { expect, test } from "vitest";

import {
  isMobileKeyboardActive,
  resolveMobileChatViewport,
  shouldRestoreKeyboardScroll,
} from "./mobile-keyboard-viewport";

test("detects a focused mobile keyboard but ignores browser chrome changes", () => {
  expect(isMobileKeyboardActive({
    mobile: true,
    inputFocused: true,
    layoutHeight: 844,
    visualHeight: 620,
  })).toBe(true);

  expect(isMobileKeyboardActive({
    mobile: true,
    inputFocused: true,
    layoutHeight: 844,
    visualHeight: 770,
  })).toBe(false);

  expect(isMobileKeyboardActive({
    mobile: false,
    inputFocused: true,
    layoutHeight: 844,
    visualHeight: 620,
  })).toBe(false);

  expect(isMobileKeyboardActive({
    mobile: true,
    inputFocused: false,
    layoutHeight: 844,
    visualHeight: 620,
  })).toBe(false);
});

test("resolves the mobile panel inside the visual viewport", () => {
  expect(resolveMobileChatViewport({
    layoutHeight: 844,
    visualHeight: 520,
    visualOffsetTop: 44,
    navigationBottom: 58,
    safeGap: 12,
  })).toEqual({
    top: 70,
    bottomInset: 280,
    availableHeight: 482,
  });
});

test("restores only displacement plausibly caused by keyboard travel", () => {
  expect(shouldRestoreKeyboardScroll({
    anchorY: 0,
    currentY: 96,
    keyboardTravel: 324,
  })).toBe(true);

  expect(shouldRestoreKeyboardScroll({
    anchorY: 0,
    currentY: 500,
    keyboardTravel: 324,
  })).toBe(false);

  expect(shouldRestoreKeyboardScroll({
    anchorY: 120,
    currentY: 120,
    keyboardTravel: 324,
  })).toBe(false);
});
