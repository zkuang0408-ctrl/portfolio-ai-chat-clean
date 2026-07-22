// @vitest-environment node

import { describe, expect, test, vi } from "vitest";

import type { KnowledgeChunk } from "../knowledge/types";
import type { Retriever } from "../retrieval/retriever";
import type { ChatProvider, ProviderEvent } from "./chat-types";
import { DeepSeekProviderError } from "./deepseek-provider";
import type { RateLimitStore } from "./rate-limit";
import {
  handleChat,
  type ChatHandlerDependencies,
  type ChatMetric,
} from "./chat-handler";

const encoder = new TextEncoder();
const fixedNow = 1_786_000_000_000;

function chunk(sourceId: string, page: number): KnowledgeChunk {
  return {
    id: `${sourceId}:p${page}:c0`,
    sourceId,
    projectId: sourceId,
    page,
    title: sourceId === "inkseat" ? "INKSeat" : "EMOVUE",
    text: `Evidence for ${sourceId} page ${page}`,
    terms: [sourceId],
    aliases: [sourceId],
    tags: ["design"],
    citationLabel: `${sourceId.toUpperCase()} · P.${String(page).padStart(2, "0")}`,
    publicHref: `/documents/${sourceId}.pdf#page=${page}`,
  };
}

function request(
  body: unknown = {
    message: "Tell me about INKSeat",
    history: [],
    sessionId: "session_123",
    locale: "en",
  },
  init: RequestInit = {},
): Request {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  if (!headers.has("origin")) headers.set("origin", "https://portfolio.test");
  return new Request("https://portfolio.test/api/chat", {
    method: "POST",
    ...init,
    headers,
    body: init.body ?? JSON.stringify(body),
  });
}

type ParsedEvent = { event: string; data: unknown };

async function readEvents(response: Response): Promise<ParsedEvent[]> {
  const text = await response.text();
  return text
    .split(/\r?\n\r?\n/)
    .filter(Boolean)
    .map((block) => {
      let event = "message";
      const data: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("event: ")) event = line.slice(7);
        if (line.startsWith("data: ")) data.push(line.slice(6));
      }
      return { event, data: JSON.parse(data.join("\n")) };
    });
}

async function settlesWithin<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("operation stayed blocked on metrics")), 100),
    ),
  ]);
}

function providerFromAttempts(
  attempts: readonly (readonly ProviderEvent[] | Error)[],
): ChatProvider & { calls: number } {
  return {
    calls: 0,
    async *stream() {
      const attempt = attempts[this.calls++];
      if (attempt instanceof Error) throw attempt;
      if (!attempt) throw new Error("unexpected provider call");
      for (const event of attempt) yield event;
    },
  };
}

function dependencies(options: {
  results?: readonly KnowledgeChunk[];
  provider?: ChatProvider;
  rateResult?: { allowed: boolean; resetAt: number };
  metrics?: ChatMetric[];
} = {}): ChatHandlerDependencies {
  const retriever: Retriever = {
    search: vi.fn(async () =>
      (options.results ?? [chunk("inkseat", 8)]).map((item, index) => ({
        chunk: item,
        score: 20 - index,
      })),
    ),
  };
  const rateLimit: RateLimitStore = {
    consume: vi.fn(async () => options.rateResult ?? { allowed: true, resetAt: fixedNow + 3_000 }),
  };
  return {
    retriever,
    provider:
      options.provider ??
      providerFromAttempts([[
        { type: "delta", text: "Grounded answer [[S1]]" },
        { type: "usage", inputTokens: 12, outputTokens: 4 },
        { type: "done" },
      ]]),
    rateLimit,
    rateLimitSalt: "a-safe-test-salt-that-is-at-least-32-bytes-long",
    profileFacts: ["赵实旷是同济大学工业设计学生。"],
    ipAddress: () => "203.0.113.8",
    clock: () => fixedNow,
    requestId: () => "request_12345678",
    metrics: {
      record(metric) {
        options.metrics?.push(metric);
      },
    },
  };
}

describe("handleChat", () => {
  test("streams start, visible deltas, verified sources, then done", async () => {
    const response = await handleChat(request(), dependencies());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await readEvents(response)).toEqual([
      { event: "start", data: { locale: "en" } },
      { event: "delta", data: { text: "Grounded answer " } },
      {
        event: "sources",
        data: {
          sources: [expect.objectContaining({ sourceId: "inkseat", projectId: "inkseat", page: 8 })],
        },
      },
      { event: "done", data: { inputTokens: 12, outputTokens: 4 } },
    ]);
  });

  test.each([
    ["zh", "暂时没有找到足够的作品集资料"],
    ["en", "I could not find enough portfolio evidence"],
  ] as const)("returns a localized %s no-result stream without calling the model", async (locale, copy) => {
    const provider = providerFromAttempts([]);
    const deps = dependencies({ results: [], provider });
    const response = await handleChat(
      request({ message: "unrelated", history: [], sessionId: "session_123", locale }),
      deps,
    );

    const events = await readEvents(response);
    expect(provider.calls).toBe(0);
    expect(events.map(({ event }) => event)).toEqual(["start", "delta", "sources", "done"]);
    expect(events[1]?.data).toEqual({ text: expect.stringContaining(copy) });
    expect(events[2]?.data).toEqual({ sources: [] });
  });

  test("filters unconsulted markers and exposes only cited consulted sources", async () => {
    const provider = providerFromAttempts([[
      { type: "delta", text: "One [[S1]] unknown [[S8]] malformed [[BAD]]" },
      { type: "done" },
    ]]);
    const response = await handleChat(request(), dependencies({ provider }));
    const events = await readEvents(response);

    expect(events[1]).toEqual({ event: "delta", data: { text: "One  unknown  malformed " } });
    expect(events[2]).toEqual({
      event: "sources",
      data: { sources: [expect.objectContaining({ id: "S1", sourceId: "inkseat" })] },
    });
    expect(JSON.stringify(events)).not.toContain("S8");
    expect(JSON.stringify(events)).not.toContain("BAD");
  });

  test("falls back to the top two ranked consulted sources when no valid marker appears", async () => {
    const provider = providerFromAttempts([[
      { type: "delta", text: "A grounded summary without markers." },
      { type: "done" },
    ]]);
    const response = await handleChat(
      request(),
      dependencies({ results: [chunk("inkseat", 8), chunk("emovue", 3), chunk("inkseat", 9)], provider }),
    );
    const events = await readEvents(response);
    const sources = (events.find(({ event }) => event === "sources")?.data as { sources: { sourceId: string }[] }).sources;

    expect(sources.map(({ sourceId }) => sourceId)).toEqual(["inkseat", "emovue"]);
  });

  test("rate-limits before retrieval and provider work", async () => {
    const provider = providerFromAttempts([]);
    const deps = dependencies({
      provider,
      rateResult: { allowed: false, resetAt: fixedNow + 3_000 },
    });
    const response = await handleChat(request(), deps);

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: { code: "rate_limited", message: expect.any(String), retryable: true },
    });
    expect(deps.retriever.search).not.toHaveBeenCalled();
    expect(provider.calls).toBe(0);
  });

  test("retries exactly once when an attempt fails before any visible delta", async () => {
    const provider = providerFromAttempts([
      new Error("private first failure"),
      [{ type: "delta", text: "Recovered [[S1]]" }, { type: "done" }],
    ]);
    const response = await handleChat(request(), dependencies({ provider }));
    const events = await readEvents(response);

    expect(provider.calls).toBe(2);
    expect(events.map(({ event }) => event)).toEqual(["start", "delta", "sources", "done"]);
    expect(events[1]).toEqual({ event: "delta", data: { text: "Recovered " } });
  });

  test("discards citation state from a failed marker-only attempt before retrying", async () => {
    const provider: ChatProvider & { calls: number } = {
      calls: 0,
      async *stream() {
        this.calls += 1;
        if (this.calls === 1) {
          yield { type: "delta", text: "[[S1]]" };
          throw new Error("failed before visible output");
        }
        yield { type: "delta", text: "Recovered [[S2]]" };
        yield { type: "done" };
      },
    };
    const response = await handleChat(
      request(),
      dependencies({ results: [chunk("inkseat", 8), chunk("emovue", 3)], provider }),
    );
    const events = await readEvents(response);
    const sources = (events.at(-2)?.data as { sources: { id: string }[] }).sources;

    expect(provider.calls).toBe(2);
    expect(sources.map(({ id }) => id)).toEqual(["S2"]);
  });

  test("does not retry after visible output and isolates the provider failure", async () => {
    const provider: ChatProvider & { calls: number } = {
      calls: 0,
      async *stream() {
        this.calls += 1;
        yield { type: "delta", text: "Partial private-safe text" };
        throw new Error("SECRET upstream response body");
      },
    };
    const response = await handleChat(request(), dependencies({ provider }));
    const text = await response.text();

    expect(provider.calls).toBe(1);
    expect(text).toContain("event: delta");
    expect(text).toContain("event: error");
    expect(text).toContain("upstream_unavailable");
    expect(text).not.toContain("SECRET");
  });

  test.each([
    ["authentication", new DeepSeekProviderError("authentication", false)],
    ["balance", new DeepSeekProviderError("balance", false)],
    ["malformed", new DeepSeekProviderError("malformed_response", false)],
  ] as const)("does not retry an explicit non-retryable %s failure", async (_name, failure) => {
    const provider = providerFromAttempts([failure, [
      { type: "delta", text: "must not run" },
      { type: "done" },
    ]]);
    const response = await handleChat(request(), dependencies({ provider }));
    const events = await readEvents(response);

    expect(provider.calls).toBe(1);
    expect(events.map(({ event }) => event)).toEqual(["start", "error"]);
  });

  test("retries an explicit retryable provider failure before visible output", async () => {
    const provider = providerFromAttempts([
      new DeepSeekProviderError("network", true),
      [{ type: "delta", text: "Recovered [[S1]]" }, { type: "done" }],
    ]);
    const response = await handleChat(request(), dependencies({ provider }));

    expect((await readEvents(response)).at(-1)?.event).toBe("done");
    expect(provider.calls).toBe(2);
  });

  test("retries done-only, marker-only, and whitespace-only attempts without leaking them", async () => {
    const attempts: readonly (readonly ProviderEvent[])[] = [
      [{ type: "done" }],
      [{ type: "delta", text: "[[S1]]" }, { type: "done" }],
      [{ type: "delta", text: "  \n" }, { type: "done" }],
    ];
    for (const first of attempts) {
      const provider = providerFromAttempts([
        first,
        [{ type: "delta", text: "Meaningful [[S1]]" }, { type: "done" }],
      ]);
      const response = await handleChat(request(), dependencies({ provider }));
      const events = await readEvents(response);
      expect(provider.calls).toBe(2);
      expect(events.filter(({ event }) => event === "delta")).toEqual([
        { event: "delta", data: { text: "Meaningful " } },
      ]);
      expect(events.at(-1)?.event).toBe("done");
    }
  });

  test("emits a sanitized failure after two marker-only attempts", async () => {
    const provider = providerFromAttempts([
      [{ type: "delta", text: "[[S1]]" }, { type: "done" }],
      [{ type: "delta", text: "[[S1]]" }, { type: "done" }],
    ]);
    const response = await handleChat(request(), dependencies({ provider }));
    const events = await readEvents(response);

    expect(provider.calls).toBe(2);
    expect(events.map(({ event }) => event)).toEqual(["start", "error"]);
  });

  test("treats the first provider done event as terminal and closes the iterator", async () => {
    let afterDoneRan = false;
    let finalized = false;
    const provider: ChatProvider = {
      async *stream() {
        try {
          yield { type: "delta", text: "Answer [[S1]]" };
          yield { type: "done" };
          afterDoneRan = true;
          yield { type: "delta", text: "must be ignored" };
        } finally {
          finalized = true;
        }
      },
    };
    const response = await handleChat(request(), dependencies({ provider }));
    const text = await response.text();

    expect(afterDoneRan).toBe(false);
    expect(finalized).toBe(true);
    expect(text).not.toContain("must be ignored");
  });

  test("aborts upstream work when the response body is cancelled mid-stream", async () => {
    let providerSignal: AbortSignal | undefined;
    let providerStarted!: () => void;
    const started = new Promise<void>((resolve) => { providerStarted = resolve; });
    let providerFinalized = false;
    const provider: ChatProvider = {
      async *stream(_input, signal) {
        providerSignal = signal;
        providerStarted();
        try {
          yield { type: "delta", text: "Partial answer" };
          await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
          if (!signal.aborted) yield { type: "delta", text: "continued work" };
        } finally {
          providerFinalized = true;
        }
      },
    };
    const response = await handleChat(request(), dependencies({ provider }));
    const reader = response.body!.getReader();
    await reader.read();
    await started;
    await reader.cancel();
    await Promise.resolve();

    expect(providerSignal?.aborted).toBe(true);
    expect(providerFinalized).toBe(true);
  });

  test("aborts the provider when the response is cancelled at provider start", async () => {
    let providerSignal: AbortSignal | undefined;
    let providerStarted!: () => void;
    const started = new Promise<void>((resolve) => { providerStarted = resolve; });
    let workAfterAbort = false;
    const provider: ChatProvider = {
      async *stream(_input, signal) {
        providerSignal = signal;
        providerStarted();
        await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
        if (!signal.aborted) workAfterAbort = true;
      },
    };
    const response = await handleChat(request(), dependencies({ provider }));
    const reader = response.body!.getReader();
    await reader.read();
    await started;
    await reader.cancel();

    expect(providerSignal?.aborted).toBe(true);
    expect(workAfterAbort).toBe(false);
  });

  test("returns stable failures for method, origin, content type, JSON, and actual byte size", async () => {
    const cases: readonly [Request, number, string][] = [
      [new Request("https://portfolio.test/api/chat", { method: "GET" }), 405, "method_not_allowed"],
      [request(undefined, { headers: { origin: "https://evil.test", "content-type": "application/json" } }), 403, "cross_origin_request"],
      [request(undefined, { headers: { origin: "https://portfolio.test", "content-type": "text/plain" } }), 415, "unsupported_content_type"],
      [request(undefined, { body: "{" }), 400, "invalid_body"],
      [request(undefined, { body: "x".repeat(32 * 1024 + 1) }), 413, "body_too_large"],
    ];

    for (const [input, status, code] of cases) {
      const response = await handleChat(input, dependencies());
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({
        error: expect.objectContaining({ code, retryable: expect.any(Boolean) }),
      });
    }
  });

  test.each([
    ["method", { method: "PUT", headers: {} }, "method_not_allowed"],
    ["origin", { method: "POST", headers: { origin: "https://evil.test", "content-type": "application/json" } }, "cross_origin_request"],
    ["content type", { method: "POST", headers: { origin: "https://portfolio.test", "content-type": "text/plain" } }, "unsupported_content_type"],
  ] as const)("cancels the request upload on early %s rejection", async (_name, init, code) => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(encoder.encode("{}")); },
      cancel() { cancelled = true; },
    });
    const input = new Request("https://portfolio.test/api/chat", {
      ...init,
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const response = await handleChat(input, dependencies());

    expect((await response.json() as { error: { code: string } }).error.code).toBe(code);
    expect(cancelled).toBe(true);
  });

  test("cancels an oversized streaming upload and preserves the public error if cancellation fails", async () => {
    let cancelCalls = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(20_000));
        controller.enqueue(new Uint8Array(20_000));
      },
      cancel() {
        cancelCalls += 1;
        throw new Error("private cleanup failure");
      },
    });
    const input = new Request("https://portfolio.test/api/chat", {
      method: "POST",
      headers: { origin: "https://portfolio.test", "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const response = await handleChat(input, dependencies());

    expect(response.status).toBe(413);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("body_too_large");
    expect(cancelCalls).toBe(1);
  });

  test("validates declared size and schema before rate limiting", async () => {
    const deps = dependencies();
    const oversized = request(undefined, { headers: { "content-length": String(32 * 1024 + 1) } });
    const invalidSchema = request({ message: "hello", history: [], sessionId: "bad", locale: "en" });

    expect((await handleChat(oversized, deps)).status).toBe(413);
    expect((await handleChat(invalidSchema, deps)).status).toBe(400);
    expect(deps.rateLimit.consume).not.toHaveBeenCalled();
  });

  test("records aggregate-only metrics without request, identity, or evidence fields", async () => {
    const metrics: ChatMetric[] = [];
    const response = await handleChat(request(), dependencies({ metrics }));
    await response.text();

    expect(metrics).toHaveLength(1);
    expect(Object.keys(metrics[0]!).sort()).toEqual([
      "inputTokens",
      "latencyMs",
      "outputTokens",
      "retrievalCount",
      "status",
    ]);
    expect(metrics[0]).toEqual({
      status: "success",
      latencyMs: 0,
      inputTokens: 12,
      outputTokens: 4,
      retrievalCount: 1,
    });
    const serialized = JSON.stringify(metrics);
    expect(serialized).not.toContain("Tell me");
    expect(serialized).not.toContain("203.0.113.8");
    expect(serialized).not.toContain("session_123");
    expect(serialized).not.toContain("Evidence");
    expect(serialized).not.toContain("request_12345678");
  });

  test("does not let a failing metrics sink break a successful assistant stream", async () => {
    const deps = dependencies();
    deps.metrics = { record: () => { throw new Error("metrics down"); } };
    const response = await handleChat(request(), deps);

    expect((await readEvents(response)).at(-1)?.event).toBe("done");
  });

  test.each(["success", "no_result", "rejected", "rate_limited"] as const)(
    "never blocks a %s response on a pending metrics sink",
    async (outcome) => {
      const deps = dependencies({
        ...(outcome === "no_result" ? { results: [] } : {}),
        ...(outcome === "rate_limited"
          ? { rateResult: { allowed: false, resetAt: fixedNow + 3_000 } }
          : {}),
      });
      deps.metrics = { record: () => new Promise<void>(() => {}) };
      const response = await settlesWithin(
        handleChat(
          outcome === "rejected"
            ? new Request("https://portfolio.test/api/chat", { method: "GET" })
            : request(),
          deps,
        ),
      );
      await settlesWithin(response.text());
    },
  );

  test("measures UTF-8 bytes rather than JavaScript code units", async () => {
    const body = JSON.stringify({
      message: "😀".repeat(600),
      history: [],
      sessionId: "session_123",
      locale: "en",
    });
    expect(body.length).toBeLessThan(encoder.encode(body).byteLength);
    const response = await handleChat(request(undefined, { body }), dependencies({ results: [] }));
    expect(response.status).toBe(200);
  });
});
