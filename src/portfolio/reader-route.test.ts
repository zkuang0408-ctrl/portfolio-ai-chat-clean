import { expect, test, vi } from "vitest";

import {
  parseReaderLocation,
  readerLocation,
  startReaderRouting,
} from "./reader-route";

test("parses and serializes stable project reader locations", () => {
  expect(parseReaderLocation("#reader/inkseat/08")).toEqual({
    projectId: "inkseat",
    page: 8,
  });
  expect(parseReaderLocation("#reader/not-a-project/03")).toBeUndefined();
  expect(parseReaderLocation("#reader/emovue/00")).toBeUndefined();
  expect(readerLocation({ projectId: "emovue", page: 2 })).toBe(
    "#reader/emovue/02",
  );
});

test("opens a reader with history and restores the chapter scroll on popstate", () => {
  const root = document.createElement("main");
  root.innerHTML = `
    <figure data-project-reader data-project-id="inkseat">
      <button data-open-reader>Open</button>
      <button data-close-reader>Close</button>
    </figure>
  `;
  const viewport = new EventTarget();
  const history = {
    pushState: vi.fn(),
    replaceState: vi.fn(),
    back: vi.fn(),
  };
  const location = { hash: "", pathname: "/", search: "" };
  const setScrollLocked = vi.fn();
  const scrollTo = vi.fn();
  const cleanup = startReaderRouting(root, {
    viewport,
    history,
    location,
    getScrollY: () => 320,
    scrollTo,
    setScrollLocked,
  });

  root.querySelector<HTMLButtonElement>("[data-open-reader]")?.click();

  const reader = root.querySelector<HTMLElement>("[data-project-reader]")!;
  expect(reader.classList).toContain("is-fullscreen");
  expect(history.pushState).toHaveBeenCalledWith(
    expect.objectContaining({ projectId: "inkseat", page: 1, sourceScrollY: 320 }),
    "",
    "#reader/inkseat/01",
  );
  expect(setScrollLocked).toHaveBeenLastCalledWith(true);

  location.hash = "";
  viewport.dispatchEvent(new Event("popstate"));

  expect(reader.classList).not.toContain("is-fullscreen");
  expect(setScrollLocked).toHaveBeenLastCalledWith(false);
  expect(scrollTo).toHaveBeenCalledWith(320);
  cleanup();
});

test("updates the shareable location after the existing reader changes page", () => {
  const root = document.createElement("main");
  root.innerHTML = `
    <figure data-project-reader data-project-id="inkseat">
      <button data-open-reader>Open</button>
      <button data-close-reader>Close</button>
    </figure>
  `;
  const history = {
    pushState: vi.fn(),
    replaceState: vi.fn(),
    back: vi.fn(),
  };
  const cleanup = startReaderRouting(root, {
    viewport: new EventTarget(),
    history,
    location: { hash: "", pathname: "/", search: "" },
    getScrollY: () => 12,
    scrollTo: vi.fn(),
    setScrollLocked: vi.fn(),
  });
  root.querySelector<HTMLButtonElement>("[data-open-reader]")?.click();

  root.querySelector("[data-project-reader]")?.dispatchEvent(
    new CustomEvent("portfolio:reader-page-change", {
      bubbles: true,
      detail: { projectId: "inkseat", page: 7 },
    }),
  );

  expect(history.replaceState).toHaveBeenCalledWith(
    expect.objectContaining({ projectId: "inkseat", page: 7 }),
    "",
    "#reader/inkseat/07",
  );
  cleanup();
});
