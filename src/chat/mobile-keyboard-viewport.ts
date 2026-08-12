export const MOBILE_KEYBOARD_MIN_REDUCTION = 120;

export interface KeyboardViewportInput {
  readonly mobile: boolean;
  readonly inputFocused: boolean;
  readonly layoutHeight: number;
  readonly visualHeight: number;
}

export interface MobileChatViewportInput {
  readonly layoutHeight: number;
  readonly visualHeight: number;
  readonly visualOffsetTop: number;
  readonly navigationBottom: number;
  readonly safeGap: number;
}

export interface MobileChatViewport {
  readonly top: number;
  readonly bottomInset: number;
  readonly availableHeight: number;
}

export interface KeyboardScrollInput {
  readonly anchorY: number;
  readonly currentY: number;
  readonly keyboardTravel: number;
}

export function isMobileKeyboardActive(input: KeyboardViewportInput): boolean {
  return input.mobile
    && input.inputFocused
    && input.layoutHeight - input.visualHeight >= MOBILE_KEYBOARD_MIN_REDUCTION;
}

export function resolveMobileChatViewport(input: MobileChatViewportInput): MobileChatViewport {
  const top = Math.max(
    input.navigationBottom + input.safeGap,
    input.visualOffsetTop + input.safeGap,
  );
  const visualBottom = input.visualOffsetTop + input.visualHeight;
  return {
    top,
    bottomInset: Math.max(0, input.layoutHeight - visualBottom),
    availableHeight: Math.max(1, visualBottom - top - input.safeGap),
  };
}

export function shouldRestoreKeyboardScroll(input: KeyboardScrollInput): boolean {
  const displacement = Math.abs(input.currentY - input.anchorY);
  return displacement > 0 && displacement <= input.keyboardTravel + 48;
}
