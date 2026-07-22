export const CHAT_SESSION_ID_KEY = "portfolio-chat-session-id";
export const CHAT_HISTORY_KEY = "portfolio-chat-history-v1";

const MAX_HISTORY_PAIRS = 10;
const MAX_MESSAGE_CODE_POINTS = 600;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export type ClientChatRole = "user" | "assistant";

export interface ClientChatMessage {
  readonly role: ClientChatRole;
  readonly content: string;
}

export interface ChatStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type UuidFactory = () => string;

function hasVisibleContent(value: string): boolean {
  return value.replace(/[\s\p{Cf}]/gu, "").length > 0;
}

function capCodePoints(value: string): string {
  return Array.from(value).slice(0, MAX_MESSAGE_CODE_POINTS).join("");
}

function removeBestEffort(storage: ChatStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Storage can be unavailable in privacy modes; memory-only use is safe.
  }
}

function readBestEffort(storage: ChatStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeBestEffort(storage: ChatStorage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // A failed write leaves the current in-memory turn usable.
  }
}

export function createSafeSessionStorage(
  getBacking: () => ChatStorage,
): ChatStorage {
  const memory = new Map<string, string>();
  let backing: ChatStorage | undefined;
  try {
    backing = getBacking();
  } catch {
    backing = undefined;
  }

  const disableBacking = () => {
    backing = undefined;
  };

  return {
    getItem(key) {
      if (memory.has(key)) return memory.get(key) ?? null;
      if (!backing) return null;
      try {
        const value = backing.getItem(key);
        if (value !== null) memory.set(key, value);
        return value;
      } catch {
        disableBacking();
        return null;
      }
    },
    setItem(key, value) {
      memory.set(key, value);
      if (!backing) return;
      try {
        backing.setItem(key, value);
      } catch {
        disableBacking();
      }
    },
    removeItem(key) {
      memory.delete(key);
      if (!backing) return;
      try {
        backing.removeItem(key);
      } catch {
        disableBacking();
      }
    },
  };
}

function isMessage(value: unknown, index: number): value is ClientChatMessage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const role = index % 2 === 0 ? "user" : "assistant";
  return keys.length === 2 &&
    keys.includes("role") &&
    keys.includes("content") &&
    record.role === role &&
    typeof record.content === "string" &&
    hasVisibleContent(record.content) &&
    Array.from(record.content).length <= MAX_MESSAGE_CODE_POINTS;
}

export function getOrCreateSessionId(
  storage: ChatStorage,
  createUuid: UuidFactory = () => crypto.randomUUID(),
): string {
  const stored = readBestEffort(storage, CHAT_SESSION_ID_KEY);
  if (stored !== null && SESSION_ID_PATTERN.test(stored)) return stored;

  const created = createUuid();
  if (!SESSION_ID_PATTERN.test(created)) {
    throw new Error("Unable to create a valid chat session ID.");
  }
  writeBestEffort(storage, CHAT_SESSION_ID_KEY, created);
  return created;
}

export function loadChatHistory(storage: ChatStorage): readonly ClientChatMessage[] {
  const stored = readBestEffort(storage, CHAT_HISTORY_KEY);
  if (stored === null) return [];

  try {
    const parsed: unknown = JSON.parse(stored);
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      parsed.length > MAX_HISTORY_PAIRS * 2 ||
      parsed.length % 2 !== 0 ||
      !parsed.every(isMessage)
    ) {
      removeBestEffort(storage, CHAT_HISTORY_KEY);
      return [];
    }
    return parsed.map(({ role, content }) => ({ role, content }));
  } catch {
    removeBestEffort(storage, CHAT_HISTORY_KEY);
    return [];
  }
}

export function appendCompletedTurn(
  storage: ChatStorage,
  userContent: string,
  assistantContent: string,
): readonly ClientChatMessage[] {
  const user = capCodePoints(userContent);
  const assistant = capCodePoints(assistantContent);
  const current = loadChatHistory(storage);
  if (!hasVisibleContent(user) || !hasVisibleContent(assistant)) return current;

  const next = [
    ...current,
    { role: "user" as const, content: user },
    { role: "assistant" as const, content: assistant },
  ].slice(-(MAX_HISTORY_PAIRS * 2));
  writeBestEffort(storage, CHAT_HISTORY_KEY, JSON.stringify(next));
  return next;
}
