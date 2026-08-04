import { expect, test, vi } from "vitest";

import {
  ACTIVATE_PROJECT_EVENT,
  dispatchProjectActivation,
  readProjectActivation,
} from "./project-activation";

test("dispatches a realm-safe project activation detail", () => {
  const root = document.createElement("main");
  const listener = vi.fn();
  root.addEventListener(ACTIVATE_PROJECT_EVENT, listener);

  dispatchProjectActivation(root, "emovue");

  expect(listener).toHaveBeenCalledOnce();
  expect(readProjectActivation(listener.mock.calls[0]?.[0] as Event)).toEqual({
    projectId: "emovue",
  });
});

test.each([
  undefined,
  null,
  {},
  { projectId: "" },
  { projectId: 3 },
  ["inkseat"],
])("rejects malformed project activation detail %j", (detail) => {
  const event = new CustomEvent(ACTIVATE_PROJECT_EVENT, { detail });

  expect(readProjectActivation(event)).toBeUndefined();
});
