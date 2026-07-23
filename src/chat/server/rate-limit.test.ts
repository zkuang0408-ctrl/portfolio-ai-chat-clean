// @vitest-environment node

import { createHmac } from "node:crypto";

import { describe, expect, test, vi } from "vitest";

import {
  DAY_KEY_TTL_SECONDS,
  InMemoryRateLimitStore,
  UPSTASH_RATE_LIMIT_SCRIPT,
  createUpstashRateLimitStore,
  deriveVisitorKey,
  getShanghaiDayWindow,
} from "./rate-limit";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const TEST_SALT = "rate-limit-test-salt-with-32-bytes";

function visitor(identity: string): string {
  return createHmac("sha256", TEST_SALT).update(identity).digest("hex");
}

function atShanghai(isoLocal: string): number {
  return Date.parse(`${isoLocal}+08:00`);
}

describe("deriveVisitorKey", () => {
  test("uses HMAC-SHA256 with RATE_LIMIT_SALT and never returns the raw IP", async () => {
    const ip = "203.0.113.42";
    const salt = "a-high-entropy-test-salt-32-bytes";

    const key = await deriveVisitorKey(ip, salt);

    expect(key).toBe(createHmac("sha256", salt).update(ip).digest("hex"));
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain(ip);
  });

  test.each(["", "a".repeat(31), `${"界".repeat(10)}a`])(
    "rejects RATE_LIMIT_SALT values shorter than 32 UTF-8 bytes",
    async (salt) => {
      await expect(deriveVisitorKey("203.0.113.42", salt)).rejects.toThrow(
        "RATE_LIMIT_SALT",
      );
    },
  );

  test("accepts a multibyte RATE_LIMIT_SALT at the exact 32-byte boundary", async () => {
    await expect(
      deriveVisitorKey("203.0.113.42", `${"界".repeat(10)}ab`),
    ).resolves.toMatch(
      /^[a-f0-9]{64}$/,
    );
  });
});

describe("getShanghaiDayWindow", () => {
  test.each([
    ["2026-01-15T23:59:59.999", "2026-01-15", "2026-01-16T00:00:00.000"],
    ["2026-07-15T23:59:59.999", "2026-07-15", "2026-07-16T00:00:00.000"],
  ])(
    "uses the same UTC+8 midnight in winter and summer for %s",
    (localNow, expectedDay, nextMidnight) => {
      expect(getShanghaiDayWindow(atShanghai(localNow))).toEqual({
        dayKey: expectedDay,
        resetAt: atShanghai(nextMidnight),
      });
    },
  );
});

describe("InMemoryRateLimitStore", () => {
  test("allows the first request and returns the cooldown reset time", async () => {
    const store = new InMemoryRateLimitStore();
    const now = atShanghai("2026-07-15T12:00:00.000");

    await expect(
      store.consume({ visitorKey: visitor("a"), now, requestId: "request-1" }),
    ).resolves.toEqual({ allowed: true, resetAt: now + 3 * SECOND });
  });

  test("blocks only requests strictly inside the three-second cooldown", async () => {
    const store = new InMemoryRateLimitStore();
    const now = atShanghai("2026-07-15T12:00:00.000");
    await store.consume({ visitorKey: visitor("a"), now, requestId: "request-1" });

    await expect(
      store.consume({
        visitorKey: visitor("a"),
        now: now + 2_999,
        requestId: "request-2",
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: "cooldown",
      resetAt: now + 3 * SECOND,
    });

    await expect(
      store.consume({
        visitorKey: visitor("a"),
        now: now + 3 * SECOND,
        requestId: "request-3",
      }),
    ).resolves.toMatchObject({ allowed: true });
  });

  test("blocks the seventh request in a rolling minute and releases after the boundary", async () => {
    const store = new InMemoryRateLimitStore();
    const start = atShanghai("2026-07-15T12:00:00.000");

    for (let index = 0; index < 6; index += 1) {
      await expect(
        store.consume({
          visitorKey: visitor("a"),
          now: start + index * 3 * SECOND,
          requestId: `request-${index}`,
        }),
      ).resolves.toMatchObject({ allowed: true });
    }

    await expect(
      store.consume({
        visitorKey: visitor("a"),
        now: start + 18 * SECOND,
        requestId: "request-6",
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: "minute",
      resetAt: start + MINUTE + 1,
    });

    await expect(
      store.consume({
        visitorKey: visitor("a"),
        now: start + MINUTE,
        requestId: "request-at-boundary",
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "minute" });

    await expect(
      store.consume({
        visitorKey: visitor("a"),
        now: start + MINUTE + 1,
        requestId: "request-after-boundary",
      }),
    ).resolves.toMatchObject({ allowed: true });
  });

  test("blocks the thirty-first visitor request until Shanghai midnight", async () => {
    const store = new InMemoryRateLimitStore();
    const start = atShanghai("2026-07-15T00:10:00.000");

    for (let index = 0; index < 30; index += 1) {
      await expect(
        store.consume({
          visitorKey: visitor("a"),
          now: start + index * (MINUTE + 1),
          requestId: `request-${index}`,
        }),
      ).resolves.toMatchObject({ allowed: true });
    }

    const attemptAt = start + 30 * (MINUTE + 1);
    await expect(
      store.consume({
        visitorKey: visitor("a"),
        now: attemptAt,
        requestId: "request-30",
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: "visitor_day",
      resetAt: atShanghai("2026-07-16T00:00:00.000"),
    });
  });

  test("blocks the 301st site request without charging a rejected visitor", async () => {
    const store = new InMemoryRateLimitStore();
    const now = atShanghai("2026-07-15T12:00:00.000");

    for (let index = 0; index < 300; index += 1) {
      await store.consume({
        visitorKey: visitor(String(index)),
        now,
        requestId: `request-${index}`,
      });
    }

    await expect(
      store.consume({ visitorKey: visitor("300"), now, requestId: "request-300" }),
    ).resolves.toEqual({
      allowed: false,
      reason: "site_day",
      resetAt: atShanghai("2026-07-16T00:00:00.000"),
    });

    await expect(
      store.consume({
        visitorKey: visitor("300"),
        now: atShanghai("2026-07-16T00:00:00.000"),
        requestId: "request-next-day",
      }),
    ).resolves.toMatchObject({ allowed: true });
  });

  test("resets visitor and site buckets exactly at Shanghai midnight", async () => {
    const store = new InMemoryRateLimitStore();
    const beforeMidnight = atShanghai("2026-07-15T23:59:56.000");
    const midnight = atShanghai("2026-07-16T00:00:00.000");

    await store.consume({
      visitorKey: visitor("a"),
      now: beforeMidnight,
      requestId: "request-before-midnight",
    });

    await expect(
      store.consume({
        visitorKey: visitor("a"),
        now: midnight,
        requestId: "request-at-midnight",
      }),
    ).resolves.toMatchObject({ allowed: true });
  });

  test("a repeated request ID cannot bypass the rolling-minute quota", async () => {
    const store = new InMemoryRateLimitStore();
    const start = atShanghai("2026-07-15T12:00:00.000");
    await store.consume({
      visitorKey: visitor("a"),
      now: start,
      requestId: "same-request",
    });

    await expect(
      store.consume({
        visitorKey: visitor("a"),
        now: start + 3 * SECOND,
        requestId: "same-request",
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: "minute",
      resetAt: start + MINUTE + 1,
    });
  });

  test("serializes simultaneous consumes so no more than six are allowed", async () => {
    const store = new InMemoryRateLimitStore({ cooldownMs: 0 });
    const now = atShanghai("2026-07-15T12:00:00.000");
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.consume({
          visitorKey: visitor("a"),
          now,
          requestId: `concurrent-${index}`,
        }),
      ),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(6);
    expect(
      results.filter((result) => result.reason === "minute"),
    ).toHaveLength(14);
  });

  test.each([
    "",
    "contains space",
    "control\ncharacter",
    "非ASCII",
    "a".repeat(129),
  ])("rejects unsafe request IDs without mutating state: %j", async (requestId) => {
    const store = new InMemoryRateLimitStore();

    await expect(
      store.consume({
        visitorKey: visitor("a"),
        now: atShanghai("2026-07-15T12:00:00.000"),
        requestId,
      }),
    ).rejects.toThrow("requestId");

    expect(store.getStateSizeSnapshot()).toEqual({
      cooldowns: 0,
      minuteVisitors: 0,
      minuteEntries: 0,
      visitorDayBuckets: 0,
      siteDayBuckets: 0,
    });
  });

  test("accepts a 128-character printable ASCII request ID", async () => {
    const store = new InMemoryRateLimitStore();

    await expect(
      store.consume({
        visitorKey: visitor("a"),
        now: atShanghai("2026-07-15T12:00:00.000"),
        requestId: "a".repeat(128),
      }),
    ).resolves.toMatchObject({ allowed: true });
  });

  test("sweeps expired state for many distinct visitors on a bounded cadence", async () => {
    const store = new InMemoryRateLimitStore();
    const start = atShanghai("2026-07-15T00:00:00.000");

    for (let index = 0; index < 300; index += 1) {
      await store.consume({
        visitorKey: visitor(`old-${index}`),
        now: start,
        requestId: `old-${index}`,
      });
    }
    expect(store.getStateSizeSnapshot()).toEqual({
      cooldowns: 300,
      minuteVisitors: 300,
      minuteEntries: 300,
      visitorDayBuckets: 300,
      siteDayBuckets: 1,
    });

    await store.consume({
      visitorKey: visitor("new"),
      now: start + DAY_KEY_TTL_SECONDS * SECOND + 1,
      requestId: "new-request",
    });

    expect(store.getStateSizeSnapshot()).toEqual({
      cooldowns: 1,
      minuteVisitors: 1,
      minuteEntries: 1,
      visitorDayBuckets: 1,
      siteDayBuckets: 1,
    });
  });

  test("refreshes in-memory day retention only after an allowed write", async () => {
    const store = new InMemoryRateLimitStore();
    const start = atShanghai("2026-07-15T00:00:00.000");
    await store.consume({
      visitorKey: visitor("retained"),
      now: start,
      requestId: "first",
    });
    await store.consume({
      visitorKey: visitor("retained"),
      now: start + MINUTE + 1,
      requestId: "refresh",
    });

    await store.consume({
      visitorKey: visitor("trigger-before-refreshed-expiry"),
      now: start + DAY_KEY_TTL_SECONDS * SECOND + 1,
      requestId: "trigger-before",
    });
    expect(store.getStateSizeSnapshot().visitorDayBuckets).toBe(2);

    await store.consume({
      visitorKey: visitor("trigger-after-refreshed-expiry"),
      now: start + DAY_KEY_TTL_SECONDS * SECOND + MINUTE + 2,
      requestId: "trigger-after",
    });
    expect(store.getStateSizeSnapshot().visitorDayBuckets).toBe(2);
  });
});

describe("createUpstashRateLimitStore", () => {
  test("constructs Redis with analytics disabled", () => {
    const evalRedis = { eval: vi.fn() };
    const factory = vi.fn(() => evalRedis);

    createUpstashRateLimitStore({
      url: "https://example.upstash.io",
      token: "secret-token",
      redisFactory: factory,
    });

    expect(factory).toHaveBeenCalledWith({
      url: "https://example.upstash.io",
      token: "secret-token",
      analytics: false,
      enableTelemetry: false,
    });
  });

  test("passes four anonymized keys and all policy values to one atomic Lua eval", async () => {
    const rawIp = "203.0.113.42";
    const visitorKey = await deriveVisitorKey(rawIp, TEST_SALT);
    const now = atShanghai("2026-07-15T12:00:00.000");
    const resetAt = atShanghai("2026-07-16T00:00:00.000");
    const evalMock = vi.fn().mockResolvedValue([1, "", now + 3 * SECOND]);
    const store = createUpstashRateLimitStore({
      url: "unused",
      token: "unused",
      prefix: "portfolio-test",
      redisFactory: () => ({ eval: evalMock }),
    });

    await expect(
      store.consume({ visitorKey, now, requestId: "request-123" }),
    ).resolves.toEqual({ allowed: true, resetAt: now + 3 * SECOND });

    expect(evalMock).toHaveBeenCalledTimes(1);
    const [script, keys, args] = evalMock.mock.calls[0] as [
      string,
      string[],
      string[],
    ];
    expect(script).toBe(UPSTASH_RATE_LIMIT_SCRIPT);
    expect(keys).toEqual([
      `portfolio-test:cooldown:${visitorKey}`,
      `portfolio-test:minute:${visitorKey}`,
      `portfolio-test:visitor-day:2026-07-15:${visitorKey}`,
      "portfolio-test:site-day:2026-07-15",
    ]);
    expect(keys.join(" ")).not.toContain(rawIp);
    expect(args).toEqual([
      String(now),
      "request-123",
      "3000",
      "60000",
      "6",
      "30",
      "300",
      String(resetAt),
      String(DAY_KEY_TTL_SECONDS),
    ]);
  });

  test("passes explicit policy overrides to the atomic Lua eval", async () => {
    const now = atShanghai("2026-07-15T12:00:00.000");
    const resetAt = atShanghai("2026-07-16T00:00:00.000");
    const evalMock = vi.fn().mockResolvedValue([1, "", now + 7 * SECOND]);
    const store = createUpstashRateLimitStore({
      url: "unused",
      token: "unused",
      cooldownMs: 7_000,
      minuteLimit: 4,
      visitorDayLimit: 20,
      siteDayLimit: 200,
      redisFactory: () => ({ eval: evalMock }),
    });

    await store.consume({
      visitorKey: visitor("override"),
      now,
      requestId: "override-request",
    });

    const args = evalMock.mock.calls[0]?.[2] as string[];
    expect(args).toEqual([
      String(now),
      "override-request",
      "7000",
      "60000",
      "4",
      "20",
      "200",
      String(resetAt),
      String(DAY_KEY_TTL_SECONDS),
    ]);
  });

  test("maps Lua rejections to the public result contract", async () => {
    const resetAt = atShanghai("2026-07-16T00:00:00.000");
    const evalMock = vi.fn().mockResolvedValue([0, "site_day", resetAt]);
    const store = createUpstashRateLimitStore({
      url: "unused",
      token: "unused",
      redisFactory: () => ({ eval: evalMock }),
    });

    await expect(
      store.consume({ visitorKey: visitor("a"), now: 1, requestId: "request" }),
    ).resolves.toEqual({
      allowed: false,
      reason: "site_day",
      resetAt,
    });
  });

  test.each([true, false, 2, -1, "true", null])(
    "rejects malformed Lua allowed flag %j",
    async (allowedFlag) => {
      const evalMock = vi
        .fn()
        .mockResolvedValue([allowedFlag, "", atShanghai("2026-07-16T00:00:00.000")]);
      const store = createUpstashRateLimitStore({
        url: "unused",
        token: "unused",
        redisFactory: () => ({ eval: evalMock }),
      });

      await expect(
        store.consume({
          visitorKey: visitor("a"),
          now: 1,
          requestId: "request",
        }),
      ).rejects.toThrow("invalid rate-limit response");
    },
  );

  test.each([
    { rawResult: [1, ""] },
    { rawResult: [1, "", true] },
    { rawResult: [0, "unknown", 123] },
    { rawResult: [0, "cooldown", 1.5] },
  ])("rejects malformed Lua result $rawResult", async ({ rawResult }) => {
    const store = createUpstashRateLimitStore({
      url: "unused",
      token: "unused",
      redisFactory: () => ({
        eval: vi.fn().mockResolvedValue(rawResult),
      }),
    });

    await expect(
      store.consume({
        visitorKey: visitor("a"),
        now: 1,
        requestId: "request",
      }),
    ).rejects.toThrow("invalid rate-limit response");
  });

  test.each([
    [1, true],
    ["1", true],
    [0, false],
    ["0", false],
  ] as const)("accepts the exact Lua flag %j", async (allowedFlag, allowed) => {
    const resetAt = atShanghai("2026-07-16T00:00:00.000");
    const evalMock = vi
      .fn()
      .mockResolvedValue([
        allowedFlag,
        allowed ? "" : "site_day",
        String(resetAt),
      ]);
    const store = createUpstashRateLimitStore({
      url: "unused",
      token: "unused",
      redisFactory: () => ({ eval: evalMock }),
    });

    await expect(
      store.consume({
        visitorKey: visitor("a"),
        now: 1,
        requestId: "request",
      }),
    ).resolves.toMatchObject({ allowed });
  });

  test("propagates Redis failures instead of allowing the request", async () => {
    const upstreamError = new Error("redis unavailable");
    const store = createUpstashRateLimitStore({
      url: "unused",
      token: "unused",
      redisFactory: () => ({
        eval: vi.fn().mockRejectedValue(upstreamError),
      }),
    });

    await expect(
      store.consume({
        visitorKey: visitor("a"),
        now: 1,
        requestId: "request",
      }),
    ).rejects.toBe(upstreamError);
  });

  test("Lua checks limits before mutating and sets the required TTLs only on allow", () => {
    const script = UPSTASH_RATE_LIMIT_SCRIPT;
    const mutationStart = script.indexOf("redis.call('PSETEX'");

    expect(script).toContain("redis.call('GET', KEYS[1])");
    expect(script).toContain("redis.call('ZREMRANGEBYSCORE'");
    expect(script).toContain("redis.call('ZCARD', KEYS[2])");
    expect(script).toContain("redis.call('ZSCORE', KEYS[2], requestId)");
    expect(script).toContain("redis.call('GET', KEYS[3])");
    expect(script).toContain("redis.call('GET', KEYS[4])");
    expect(mutationStart).toBeGreaterThan(script.indexOf("siteCount >= siteLimit"));
    expect(script).toContain("redis.call('ZADD', KEYS[2], now, requestId)");
    expect(script).toContain("redis.call('PEXPIRE', KEYS[2]");
    expect(script).toContain("redis.call('EXPIRE', KEYS[3], dayTtl)");
    expect(script).toContain("redis.call('EXPIRE', KEYS[4], dayTtl)");
  });
});
