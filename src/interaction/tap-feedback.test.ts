import { beforeEach, expect, test } from "vitest";

import { startTapFeedback } from "./tap-feedback";

function pointerEvent(type: string, pointerId = 1): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

test("marks an enabled interactive control only for the duration of a press", () => {
  const button = document.createElement("button");
  document.body.append(button);
  const stop = startTapFeedback(document);

  button.dispatchEvent(pointerEvent("pointerdown", 7));
  expect(button.dataset.tapPressed).toBe("true");

  button.dispatchEvent(pointerEvent("pointerup", 7));
  expect(button.dataset.tapPressed).toBeUndefined();
  stop();
});

test("ignores the draggable orb and disabled controls", () => {
  const orb = document.createElement("button");
  orb.className = "chat-orb";
  const disabled = document.createElement("button");
  disabled.disabled = true;
  document.body.append(orb, disabled);
  const stop = startTapFeedback(document);

  orb.dispatchEvent(pointerEvent("pointerdown"));
  disabled.dispatchEvent(pointerEvent("pointerdown"));

  expect(orb.dataset.tapPressed).toBeUndefined();
  expect(disabled.dataset.tapPressed).toBeUndefined();
  stop();
});

test("clears a press on cancellation, page scroll, and cleanup", () => {
  const button = document.createElement("button");
  document.body.append(button);
  const stop = startTapFeedback(document);

  button.dispatchEvent(pointerEvent("pointerdown", 2));
  button.dispatchEvent(pointerEvent("pointercancel", 2));
  expect(button.dataset.tapPressed).toBeUndefined();

  button.dispatchEvent(pointerEvent("pointerdown", 3));
  window.dispatchEvent(new Event("scroll"));
  expect(button.dataset.tapPressed).toBeUndefined();

  button.dispatchEvent(pointerEvent("pointerdown", 4));
  stop();
  expect(button.dataset.tapPressed).toBeUndefined();
  button.dispatchEvent(pointerEvent("pointerdown", 5));
  expect(button.dataset.tapPressed).toBeUndefined();
});
