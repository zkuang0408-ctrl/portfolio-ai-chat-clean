import { createHmac } from "node:crypto";

import { Redis } from "@upstash/redis";

export type RateLimitReason =
  | "cooldown"
  | "minute"
  | "visitor_day"
  | "site_day";

export interface RateLimitResult {
  allowed: boolean;
  reason?: RateLimitReason;
  resetAt: number;
}

export interface RateLimitStore {
  consume(input: {
    visitorKey: string;
    now: number;
    requestId: string;
  }): Promise<RateLimitResult>;
}

const DEFAULT_COOLDOWN_MS = 3_000;
const DEFAULT_MINUTE_WINDOW_MS = 60_000;
const DEFAULT_MINUTE_LIMIT = 6;
const DEFAULT_VISITOR_DAY_LIMIT = 30;
const DEFAULT_SITE_DAY_LIMIT = 300;
const SHANGHAI_UTC_OFFSET_MS = 8 * 60 * 60 * 1_000;
const VISITOR_KEY_PATTERN = /^[a-f0-9]{64}$/;
const REQUEST_ID_PATTERN = /^[!-~]{1,128}$/;
const MINIMUM_SALT_BYTES = 32;
const GLOBAL_SWEEP_INTERVAL_MS = 60_000;

export const DAY_KEY_TTL_SECONDS = 48 * 60 * 60;

interface RateLimitPolicy {
  readonly cooldownMs: number;
  readonly minuteWindowMs: number;
  readonly minuteLimit: number;
  readonly visitorDayLimit: number;
  readonly siteDayLimit: number;
}

const DEFAULT_POLICY: RateLimitPolicy = {
  cooldownMs: DEFAULT_COOLDOWN_MS,
  minuteWindowMs: DEFAULT_MINUTE_WINDOW_MS,
  minuteLimit: DEFAULT_MINUTE_LIMIT,
  visitorDayLimit: DEFAULT_VISITOR_DAY_LIMIT,
  siteDayLimit: DEFAULT_SITE_DAY_LIMIT,
};

export function deriveVisitorKey(ip: string, rateLimitSalt: string): string {
  if (ip.length === 0) {
    throw new Error("visitor IP is required");
  }
  if (Buffer.byteLength(rateLimitSalt, "utf8") < MINIMUM_SALT_BYTES) {
    throw new Error("RATE_LIMIT_SALT must contain at least 32 UTF-8 bytes");
  }

  return createHmac("sha256", rateLimitSalt).update(ip).digest("hex");
}

export function getShanghaiDayWindow(now: number): {
  dayKey: string;
  resetAt: number;
} {
  assertTimestamp(now);
  const shanghaiClock = new Date(now + SHANGHAI_UTC_OFFSET_MS);
  const year = shanghaiClock.getUTCFullYear();
  const month = shanghaiClock.getUTCMonth();
  const day = shanghaiClock.getUTCDate();
  const dayKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const resetAt =
    Date.UTC(year, month, day + 1) - SHANGHAI_UTC_OFFSET_MS;

  return { dayKey, resetAt };
}

function assertTimestamp(now: number): void {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error("rate-limit timestamp must be a non-negative integer");
  }
}

function assertConsumeInput(input: {
  visitorKey: string;
  now: number;
  requestId: string;
}): void {
  if (!VISITOR_KEY_PATTERN.test(input.visitorKey)) {
    throw new Error("visitorKey must be an HMAC-SHA256 digest");
  }
  assertTimestamp(input.now);
  if (!REQUEST_ID_PATTERN.test(input.requestId)) {
    throw new Error("requestId must be 1..128 printable ASCII characters");
  }
}

function withPolicy(
  overrides: Partial<RateLimitPolicy> = {},
): RateLimitPolicy {
  const policy = { ...DEFAULT_POLICY, ...overrides };
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${name} must be a non-negative integer`);
    }
  }
  if (
    policy.minuteWindowMs === 0 ||
    policy.minuteLimit === 0 ||
    policy.visitorDayLimit === 0 ||
    policy.siteDayLimit === 0
  ) {
    throw new Error("rate-limit windows and limits must be positive");
  }
  return policy;
}

export interface InMemoryRateLimitStoreOptions {
  readonly cooldownMs?: number;
  readonly minuteWindowMs?: number;
  readonly minuteLimit?: number;
  readonly visitorDayLimit?: number;
  readonly siteDayLimit?: number;
}

interface ExpiringCounter {
  readonly count: number;
  readonly expiresAt: number;
}

export interface InMemoryRateLimitStateSizeSnapshot {
  readonly cooldowns: number;
  readonly minuteVisitors: number;
  readonly minuteEntries: number;
  readonly visitorDayBuckets: number;
  readonly siteDayBuckets: number;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  readonly #policy: RateLimitPolicy;
  readonly #cooldowns = new Map<string, number>();
  readonly #minutes = new Map<string, Map<string, number>>();
  readonly #visitorDays = new Map<string, ExpiringCounter>();
  readonly #siteDays = new Map<string, ExpiringCounter>();
  #nextGlobalSweepAt = 0;

  constructor(options: InMemoryRateLimitStoreOptions = {}) {
    this.#policy = withPolicy(options);
  }

  getStateSizeSnapshot(): InMemoryRateLimitStateSizeSnapshot {
    let minuteEntries = 0;
    for (const entries of this.#minutes.values()) {
      minuteEntries += entries.size;
    }
    return {
      cooldowns: this.#cooldowns.size,
      minuteVisitors: this.#minutes.size,
      minuteEntries,
      visitorDayBuckets: this.#visitorDays.size,
      siteDayBuckets: this.#siteDays.size,
    };
  }

  async consume(input: {
    visitorKey: string;
    now: number;
    requestId: string;
  }): Promise<RateLimitResult> {
    assertConsumeInput(input);
    const { visitorKey, now, requestId } = input;
    this.#sweepExpiredOnCadence(now);
    const { dayKey, resetAt: dayResetAt } = getShanghaiDayWindow(now);

    const cooldownResetAt = this.#cooldowns.get(visitorKey);
    if (cooldownResetAt !== undefined && now < cooldownResetAt) {
      return { allowed: false, reason: "cooldown", resetAt: cooldownResetAt };
    }
    if (cooldownResetAt !== undefined) {
      this.#cooldowns.delete(visitorKey);
    }

    const minuteEntries = this.#minutes.get(visitorKey) ?? new Map();
    const minuteCutoff = now - this.#policy.minuteWindowMs;
    for (const [entryRequestId, timestamp] of minuteEntries) {
      if (timestamp < minuteCutoff) {
        minuteEntries.delete(entryRequestId);
      }
    }
    if (minuteEntries.size === 0) {
      this.#minutes.delete(visitorKey);
    }

    const duplicateTimestamp = minuteEntries.get(requestId);
    if (duplicateTimestamp !== undefined) {
      return {
        allowed: false,
        reason: "minute",
        resetAt: duplicateTimestamp + this.#policy.minuteWindowMs + 1,
      };
    }

    if (minuteEntries.size >= this.#policy.minuteLimit) {
      const oldestTimestamp = Math.min(...minuteEntries.values());
      return {
        allowed: false,
        reason: "minute",
        resetAt: oldestTimestamp + this.#policy.minuteWindowMs + 1,
      };
    }

    const visitorDayKey = `${dayKey}:${visitorKey}`;
    const visitorDayEntry = this.#visitorDays.get(visitorDayKey);
    const visitorDayCount = visitorDayEntry?.count ?? 0;
    if (visitorDayCount >= this.#policy.visitorDayLimit) {
      return { allowed: false, reason: "visitor_day", resetAt: dayResetAt };
    }

    const siteDayEntry = this.#siteDays.get(dayKey);
    const siteDayCount = siteDayEntry?.count ?? 0;
    if (siteDayCount >= this.#policy.siteDayLimit) {
      return { allowed: false, reason: "site_day", resetAt: dayResetAt };
    }

    const nextCooldownResetAt = now + this.#policy.cooldownMs;
    this.#cooldowns.set(visitorKey, nextCooldownResetAt);
    minuteEntries.set(requestId, now);
    this.#minutes.set(visitorKey, minuteEntries);
    const dayExpiresAt = now + DAY_KEY_TTL_SECONDS * 1_000;
    this.#visitorDays.set(visitorDayKey, {
      count: visitorDayCount + 1,
      expiresAt: dayExpiresAt,
    });
    this.#siteDays.set(dayKey, {
      count: siteDayCount + 1,
      expiresAt: dayExpiresAt,
    });

    return { allowed: true, resetAt: nextCooldownResetAt };
  }

  /**
   * Global cleanup is intentionally amortized to at most once per minute. The
   * current visitor is still pruned on every consume, while this bounded cadence
   * prevents inactive visitors and 48-hour day buckets from accumulating.
   */
  #sweepExpiredOnCadence(now: number): void {
    if (now < this.#nextGlobalSweepAt) {
      return;
    }
    this.#nextGlobalSweepAt = now + GLOBAL_SWEEP_INTERVAL_MS;

    for (const [visitorKey, resetAt] of this.#cooldowns) {
      if (resetAt <= now) {
        this.#cooldowns.delete(visitorKey);
      }
    }

    const minuteCutoff = now - this.#policy.minuteWindowMs;
    for (const [visitorKey, entries] of this.#minutes) {
      for (const [requestId, timestamp] of entries) {
        if (timestamp < minuteCutoff) {
          entries.delete(requestId);
        }
      }
      if (entries.size === 0) {
        this.#minutes.delete(visitorKey);
      }
    }

    for (const [key, entry] of this.#visitorDays) {
      if (entry.expiresAt <= now) {
        this.#visitorDays.delete(key);
      }
    }
    for (const [key, entry] of this.#siteDays) {
      if (entry.expiresAt <= now) {
        this.#siteDays.delete(key);
      }
    }
  }
}

export const UPSTASH_RATE_LIMIT_SCRIPT = String.raw`
local now = tonumber(ARGV[1])
local requestId = ARGV[2]
local cooldownMs = tonumber(ARGV[3])
local minuteWindowMs = tonumber(ARGV[4])
local minuteLimit = tonumber(ARGV[5])
local visitorDayLimit = tonumber(ARGV[6])
local siteLimit = tonumber(ARGV[7])
local dayResetAt = tonumber(ARGV[8])
local dayTtl = tonumber(ARGV[9])

local cooldownResetAt = tonumber(redis.call('GET', KEYS[1]))
if cooldownResetAt and cooldownResetAt > now then
  return { 0, 'cooldown', cooldownResetAt }
end

local minuteCutoff = now - minuteWindowMs
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', '(' .. minuteCutoff)

local duplicateScore = redis.call('ZSCORE', KEYS[2], requestId)
if duplicateScore then
  return { 0, 'minute', tonumber(duplicateScore) + minuteWindowMs + 1 }
end

local minuteCount = tonumber(redis.call('ZCARD', KEYS[2]))
if minuteCount >= minuteLimit then
  local oldest = redis.call('ZRANGE', KEYS[2], 0, 0, 'WITHSCORES')
  return { 0, 'minute', tonumber(oldest[2]) + minuteWindowMs + 1 }
end

local visitorDayCount = tonumber(redis.call('GET', KEYS[3]) or '0')
if visitorDayCount >= visitorDayLimit then
  return { 0, 'visitor_day', dayResetAt }
end

local siteCount = tonumber(redis.call('GET', KEYS[4]) or '0')
if siteCount >= siteLimit then
  return { 0, 'site_day', dayResetAt }
end

local cooldownReset = now + cooldownMs
redis.call('PSETEX', KEYS[1], cooldownMs, tostring(cooldownReset))
redis.call('ZADD', KEYS[2], now, requestId)
redis.call('PEXPIRE', KEYS[2], minuteWindowMs + 1)
redis.call('INCR', KEYS[3])
redis.call('EXPIRE', KEYS[3], dayTtl)
redis.call('INCR', KEYS[4])
redis.call('EXPIRE', KEYS[4], dayTtl)

return { 1, '', cooldownReset }
`.trim();

export interface RedisEvalSurface {
  eval<TData = unknown>(
    script: string,
    keys: string[],
    args: string[],
  ): Promise<TData>;
}

export interface UpstashRedisFactoryOptions {
  readonly url: string;
  readonly token: string;
  readonly analytics: false;
  readonly enableTelemetry: false;
}

export interface CreateUpstashRateLimitStoreOptions {
  readonly url: string;
  readonly token: string;
  readonly prefix?: string;
  readonly redisFactory?: (
    options: UpstashRedisFactoryOptions,
  ) => RedisEvalSurface;
}

class UpstashRateLimitStore implements RateLimitStore {
  readonly #redis: RedisEvalSurface;
  readonly #prefix: string;
  readonly #policy: RateLimitPolicy;

  constructor(
    redis: RedisEvalSurface,
    prefix = "portfolio-chat",
    policy: Partial<RateLimitPolicy> = {},
  ) {
    this.#redis = redis;
    this.#prefix = prefix;
    this.#policy = withPolicy(policy);
  }

  async consume(input: {
    visitorKey: string;
    now: number;
    requestId: string;
  }): Promise<RateLimitResult> {
    assertConsumeInput(input);
    const { visitorKey, now, requestId } = input;
    const { dayKey, resetAt } = getShanghaiDayWindow(now);
    const keys = [
      `${this.#prefix}:cooldown:${visitorKey}`,
      `${this.#prefix}:minute:${visitorKey}`,
      `${this.#prefix}:visitor-day:${dayKey}:${visitorKey}`,
      `${this.#prefix}:site-day:${dayKey}`,
    ];
    const args = [
      String(now),
      requestId,
      String(this.#policy.cooldownMs),
      String(this.#policy.minuteWindowMs),
      String(this.#policy.minuteLimit),
      String(this.#policy.visitorDayLimit),
      String(this.#policy.siteDayLimit),
      String(resetAt),
      String(DAY_KEY_TTL_SECONDS),
    ];

    const rawResult = await this.#redis.eval<unknown>(
      UPSTASH_RATE_LIMIT_SCRIPT,
      keys,
      args,
    );
    return parseLuaResult(rawResult);
  }
}

function parseLuaResult(rawResult: unknown): RateLimitResult {
  if (!Array.isArray(rawResult) || rawResult.length !== 3) {
    throw new Error("invalid rate-limit response");
  }
  const rawAllowed = rawResult[0];
  if (
    rawAllowed !== 0 &&
    rawAllowed !== "0" &&
    rawAllowed !== 1 &&
    rawAllowed !== "1"
  ) {
    throw new Error("invalid rate-limit response");
  }
  const allowed = rawAllowed === 1 || rawAllowed === "1";
  const reason = rawResult[1];
  const rawResetAt = rawResult[2];
  if (typeof rawResetAt !== "number" && typeof rawResetAt !== "string") {
    throw new Error("invalid rate-limit response");
  }
  const resetAt = Number(rawResetAt);
  if (!Number.isSafeInteger(resetAt) || resetAt < 0) {
    throw new Error("invalid rate-limit response");
  }
  if (allowed) {
    return { allowed: true, resetAt };
  }
  if (!isRateLimitReason(reason)) {
    throw new Error("invalid rate-limit response");
  }
  return { allowed: false, reason, resetAt };
}

function isRateLimitReason(value: unknown): value is RateLimitReason {
  return (
    value === "cooldown" ||
    value === "minute" ||
    value === "visitor_day" ||
    value === "site_day"
  );
}

export function createUpstashRateLimitStore(
  options: CreateUpstashRateLimitStoreOptions,
): RateLimitStore {
  const redisOptions: UpstashRedisFactoryOptions = {
    url: options.url,
    token: options.token,
    analytics: false,
    enableTelemetry: false,
  };
  const factory =
    options.redisFactory ??
    ((config: UpstashRedisFactoryOptions) => new Redis(config));
  return new UpstashRateLimitStore(
    factory(redisOptions),
    options.prefix ?? "portfolio-chat",
  );
}
