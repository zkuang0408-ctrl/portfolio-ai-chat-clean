import { beforeEach, expect, test, vi } from "vitest";

import {
  CHAT_HISTORY_KEY,
  CHAT_SESSION_ID_KEY,
  appendCompletedTurn,
  getOrCreateSessionId,
  loadChatHistory,
} from "./session";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

test("uses the exact sessionStorage keys and creates an opaque UUID session ID", () => {
  const uuid = vi.fn(() => "123e4567-e89b-42d3-a456-426614174000");

  const id = getOrCreateSessionId(sessionStorage, uuid);

  expect(CHAT_SESSION_ID_KEY).toBe("portfolio-chat-session-id");
  expect(CHAT_HISTORY_KEY).toBe("portfolio-chat-history-v1");
  expect(id).toBe("123e4567-e89b-42d3-a456-426614174000");
  expect(sessionStorage.getItem(CHAT_SESSION_ID_KEY)).toBe(id);
  expect(localStorage.length).toBe(0);
  expect(uuid).toHaveBeenCalledOnce();
});

test("replaces malformed or non-opaque stored session IDs", () => {
  sessionStorage.setItem(CHAT_SESSION_ID_KEY, "<script>alert(1)</script>");

  const id = getOrCreateSessionId(
    sessionStorage,
    () => "550e8400-e29b-41d4-a716-446655440000",
  );

  expect(id).toBe("550e8400-e29b-41d4-a716-446655440000");
  expect(sessionStorage.getItem(CHAT_SESSION_ID_KEY)).toBe(id);
});

test.each([
  "not-json",
  "{}",
  JSON.stringify([{ role: "assistant", content: "wrong order" }]),
  JSON.stringify([{ role: "user", content: "incomplete" }]),
  JSON.stringify([
    { role: "user", content: "" },
    { role: "assistant", content: "empty user" },
  ]),
  JSON.stringify([
    { role: "user", content: "x".repeat(601) },
    { role: "assistant", content: "too long" },
  ]),
])("discards unsafe stored history: %s", (stored) => {
  sessionStorage.setItem(CHAT_HISTORY_KEY, stored);

  expect(loadChatHistory(sessionStorage)).toEqual([]);
  expect(sessionStorage.getItem(CHAT_HISTORY_KEY)).toBeNull();
  expect(localStorage.length).toBe(0);
});

test("keeps only ten complete pairs and caps Unicode content to 600 code points", () => {
  for (let index = 0; index < 11; index += 1) {
    appendCompletedTurn(
      sessionStorage,
      `${index}:${"😀".repeat(700)}`,
      `${index}:${"答".repeat(700)}`,
    );
  }

  const history = loadChatHistory(sessionStorage);
  expect(history).toHaveLength(20);
  expect(history[0]?.content.startsWith("1:")).toBe(true);
  expect(history.at(-1)?.content.startsWith("10:")).toBe(true);
  expect(history.every(({ content }) => Array.from(content).length <= 600)).toBe(
    true,
  );
  expect(history.every(({ role }, index) => role === (index % 2 === 0 ? "user" : "assistant"))).toBe(true);
  expect(localStorage.length).toBe(0);
});

test("does not persist an incomplete turn", () => {
  expect(appendCompletedTurn(sessionStorage, "question", " \u200b ")).toEqual([]);
  expect(sessionStorage.getItem(CHAT_HISTORY_KEY)).toBeNull();
});
