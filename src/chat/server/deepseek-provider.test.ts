// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest";

import type { ProviderEvent, ProviderInput } from "./chat-types";
import {
  DeepSeekProvider,
  DeepSeekProviderError,
  MAX_OUTPUT_CODE_POINTS,
  MAX_SSE_EVENT_CHARS,
  MAX_SSE_LINE_CHARS,
  MAX_SSE_STREAM_BYTES,
  TENCENT_TOKENHUB_BASE_URL,
} from "./deepseek-provider";

const TEST_TOKEN = "unit-test-bearer-token";
const TEST_GATEWAY_TOKEN = "cloudflare-gateway-unit-test-token";
const TEST_GATEWAY_BASE_URL =
  "https://gateway.ai.cloudflare.com/v1/ce389bbbfa541a3a82e81e65eff6a1eb/default/deepseek";
const TEST_TOKENHUB_MODEL = "deepseek-v4-flash-202605";

const input: ProviderInput = {
  system: "Use only supplied evidence.",
  messages: [
    { role: "user", content: "What did Zhao design?" },
    { role: "assistant", content: "Which project?" },
    { role: "user", content: "INKSeat" },
  ],
  userId: "d5d874f2d51a8f1f",
};

async function collect(
  provider: DeepSeekProvider,
  signal: AbortSignal = new AbortController().signal,
): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = [];
  for await (const event of provider.stream(input, signal)) {
    events.push(event);
  }
  return events;
}

function byteStream(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function textStream(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return byteStream(chunks.map((chunk) => encoder.encode(chunk)));
}

function okResponse(...chunks: string[]): Response {
  return new Response(textStream(...chunks), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function responseWithCancel(options: {
  readonly text?: string;
  readonly status?: number;
  readonly contentType?: string;
  readonly close?: boolean;
} = {}): { readonly response: Response; readonly cancel: ReturnType<typeof vi.fn> } {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (options.text !== undefined) {
        controller.enqueue(new TextEncoder().encode(options.text));
      }
      if (options.close ?? true) {
        controller.close();
      }
    },
    cancel,
  });
  const headers = new Headers();
  if (options.contentType !== undefined) {
    headers.set("content-type", options.contentType);
  }
  return {
    response: new Response(body, {
      status: options.status ?? 200,
      headers,
    }),
    cancel,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("DeepSeekProvider request", () => {
  test("sends the exact grounded streaming request with safe configuration", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      okResponse("data: [DONE]\n\n"),
    );
    const provider = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      model: "deepseek-v4-flash-preview",
      fetch: fetchMock,
    });

    await expect(collect(provider)).resolves.toEqual([{ type: "done" }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${TEST_TOKEN}`,
    );
    expect(new Headers(init?.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(new Headers(init?.headers).has("cf-aig-authorization")).toBe(false);
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "deepseek-v4-flash-preview",
      messages: [
        { role: "system", content: input.system },
        ...input.messages,
      ],
      thinking: { type: "disabled" },
      temperature: 0.2,
      max_tokens: 700,
      stream: true,
      stream_options: { include_usage: true },
      user_id: input.userId,
    });
  });

  test("sends the exact Tencent TokenHub streaming request", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      okResponse("data: [DONE]\n\n"),
    );
    const provider = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      baseUrl: TENCENT_TOKENHUB_BASE_URL,
      model: TEST_TOKENHUB_MODEL,
      gatewayToken: TEST_GATEWAY_TOKEN,
      fetch: fetchMock,
    });

    await expect(collect(provider)).resolves.toEqual([{ type: "done" }]);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://tokenhub.tencentmaas.com/v1/chat/completions");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${TEST_TOKEN}`,
    );
    expect(new Headers(init?.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(new Headers(init?.headers).has("cf-aig-authorization")).toBe(false);
    expect(JSON.parse(String(init?.body))).toEqual({
      model: TEST_TOKENHUB_MODEL,
      messages: [
        { role: "system", content: input.system },
        ...input.messages,
      ],
      thinking: { type: "disabled" },
      temperature: 0.2,
      max_tokens: 700,
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  test.each([
    ["omitted model", undefined],
    ["mismatched safe model", "deepseek-v4-flash"],
  ])("rejects TokenHub with %s", (_name, model) => {
    expect(
      () =>
        new DeepSeekProvider({
          apiKey: TEST_TOKEN,
          baseUrl: TENCENT_TOKENHUB_BASE_URL,
          ...(model === undefined ? {} : { model }),
        }),
    ).toThrow("DeepSeek provider configuration is invalid");
  });

  test("defaults to the approved flash model", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      okResponse("data: [DONE]\n\n"),
    );
    const provider = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      fetch: fetchMock,
    });

    await collect(provider);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      model: string;
    };
    expect(body.model).toBe("deepseek-v4-flash");
  });

  test("sends separate DeepSeek and Cloudflare credentials through the approved gateway", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      okResponse("data: [DONE]\n\n"),
    );
    const provider = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      gatewayToken: `  ${TEST_GATEWAY_TOKEN}  `,
      fetch: fetchMock,
      baseUrl: TEST_GATEWAY_BASE_URL,
    });

    await collect(provider);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(url).toBe(`${TEST_GATEWAY_BASE_URL}/chat/completions`);
    expect(headers.get("authorization")).toBe(`Bearer ${TEST_TOKEN}`);
    expect(headers.get("cf-aig-authorization")).toBe(
      `Bearer ${TEST_GATEWAY_TOKEN}`,
    );
  });

  test("never sends the Cloudflare credential to the direct DeepSeek endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      okResponse("data: [DONE]\n\n"),
    );
    const provider = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      gatewayToken: TEST_GATEWAY_TOKEN,
      fetch: fetchMock,
    });

    await collect(provider);

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${TEST_TOKEN}`);
    expect(headers.has("cf-aig-authorization")).toBe(false);
  });

  test("rejects a Cloudflare gateway endpoint without its gateway credential", () => {
    expect(
      () =>
        new DeepSeekProvider({
          apiKey: TEST_TOKEN,
          baseUrl: TEST_GATEWAY_BASE_URL,
        }),
    ).toThrow("DeepSeek provider configuration is invalid");
  });

  test.each([
    " ",
    "x".repeat(4_097),
    "contains space",
    "line\nbreak",
    "非ASCII",
  ])("rejects an unsafe Cloudflare gateway credential", (gatewayToken) => {
    expect(
      () =>
        new DeepSeekProvider({
          apiKey: TEST_TOKEN,
          gatewayToken,
          baseUrl: TEST_GATEWAY_BASE_URL,
        }),
    ).toThrow("DeepSeek provider configuration is invalid");
  });

  test("rejects an unapproved provider base URL", () => {
    expect(
      () =>
        new DeepSeekProvider({
          apiKey: TEST_TOKEN,
          baseUrl: "https://proxy.example.com/private-token",
        }),
    ).toThrow("DeepSeek provider configuration is invalid");
  });

  test.each([
    "https://tokenhub.tencentmaas.com",
    "https://tokenhub.tencentmaas.com/v1/",
    "http://tokenhub.tencentmaas.com/v1",
    "https://evil.tokenhub.tencentmaas.com/v1",
    "https://tokenhub.tencentmaas.com:443/v1",
    "https://tokenhub.tencentmaas.com/v1?target=evil",
    "https://tokenhub.tencentmaas.com/v1#fragment",
    "https://user@tokenhub.tencentmaas.com/v1",
  ])("rejects a non-canonical Tencent TokenHub endpoint %s", (baseUrl) => {
    expect(
      () =>
        new DeepSeekProvider({
          apiKey: TEST_TOKEN,
          baseUrl,
        }),
    ).toThrow("DeepSeek provider configuration is invalid");
  });

  test("trims bounded configuration and opaque user IDs before sending", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      okResponse("data: [DONE]\n\n"),
    );
    const provider = new DeepSeekProvider({
      apiKey: `  ${TEST_TOKEN}  `,
      model: "  deepseek-v4-flash-preview  ",
      fetch: fetchMock,
    });
    const paddedInput = { ...input, userId: `  ${input.userId}  ` };
    const events: ProviderEvent[] = [];

    for await (const event of provider.stream(
      paddedInput,
      new AbortController().signal,
    )) {
      events.push(event);
    }

    expect(events).toEqual([{ type: "done" }]);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${TEST_TOKEN}`,
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "deepseek-v4-flash-preview",
      user_id: input.userId,
    });
  });

  test.each([
    { apiKey: " ", model: "deepseek-v4-flash" },
    { apiKey: "x".repeat(4_097), model: "deepseek-v4-flash" },
    { apiKey: "contains space", model: "deepseek-v4-flash" },
    { apiKey: "line\nbreak", model: "deepseek-v4-flash" },
    { apiKey: "非ASCII", model: "deepseek-v4-flash" },
    { apiKey: TEST_TOKEN, model: " " },
    { apiKey: TEST_TOKEN, model: "x".repeat(129) },
  ])("rejects unsafe or unbounded configuration", (config) => {
    expect(() => new DeepSeekProvider(config)).toThrow(
      "DeepSeek provider configuration is invalid",
    );
  });

  test.each([
    { timeoutMs: 0 },
    { timeoutMs: 120_001 },
    { maxTokens: 0 },
    { maxTokens: 4_097 },
  ])("rejects unsafe numeric configuration $timeoutMs $maxTokens", (config) => {
    expect(
      () => new DeepSeekProvider({ apiKey: TEST_TOKEN, ...config }),
    ).toThrow("DeepSeek provider configuration is invalid");
  });

  test.each(["short", "contains space 123", "非ASCII-opaque-id", "x".repeat(129)])(
    "rejects unsafe opaque user ID %j without calling fetch",
    async (userId) => {
      const fetchMock = vi.fn<typeof fetch>();
      const provider = new DeepSeekProvider({
        apiKey: TEST_TOKEN,
        fetch: fetchMock,
      });
      const unsafeInput = { ...input, userId };
      const events: ProviderEvent[] = [];

      let caught: unknown;
      try {
        for await (const event of provider.stream(
          unsafeInput,
          new AbortController().signal,
        )) {
          events.push(event);
        }
      } catch (error) {
        caught = error;
      }

      expect(caught).toMatchObject({ category: "malformed_response" });
      expect(String(caught)).not.toContain(userId);
      expect(events).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

describe("DeepSeekProvider SSE parsing", () => {
  test("decodes multibyte deltas across arbitrary byte and SSE chunk boundaries", async () => {
    const encoded = new TextEncoder().encode(
      ': keepalive\r\nevent: message\r\nid: ignored\r\ndata: {"choices":[{"delta":{"content":"你好"}}]}\r\n\r\n' +
        'retry: 1000\ndata: {"choices":[{"delta":{"content":"，世界"}}]}\n\n' +
        "data: [DONE]\n\n",
    );
    const chunks = [
      encoded.slice(0, 9),
      encoded.slice(9, 67),
      encoded.slice(67, 68),
      encoded.slice(68, 104),
      encoded.slice(104, 117),
      encoded.slice(117),
    ];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(byteStream(chunks), {
          status: 200,
          headers: { "content-type": "Text/Event-Stream; Charset=UTF-8" },
        }),
      );
    const provider = new DeepSeekProvider({ apiKey: TEST_TOKEN, fetch: fetchMock });

    await expect(collect(provider)).resolves.toEqual([
      { type: "delta", text: "你好" },
      { type: "delta", text: "，世界" },
      { type: "done" },
    ]);
  });

  test("ignores blank and irrelevant events and emits token usage", async () => {
    const provider = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        okResponse(
          "\n: ping\n\nevent: metadata\nid: 7\n\n",
          'data: {"choices":[],"usage":{"prompt_tokens":120,"completion_tokens":34,"prompt_cache_hit_tokens":80}}\n\n',
          "data: [DONE]\n\n",
        ),
      ),
    });

    await expect(collect(provider)).resolves.toEqual([
      {
        type: "usage",
        inputTokens: 120,
        outputTokens: 34,
        cacheHitTokens: 80,
      },
      { type: "done" },
    ]);
  });

  test("supports multi-line SSE data payloads", async () => {
    const provider = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        okResponse(
          'data: {"choices":[{"delta":\n',
          'data: {"content":"split"}}]}\n\n',
          "data: [DONE]\n\n",
        ),
      ),
    });

    await expect(collect(provider)).resolves.toEqual([
      { type: "delta", text: "split" },
      { type: "done" },
    ]);
  });

  test("supports CR-only framing split next to CRLF and LF boundaries", async () => {
    const provider = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        okResponse(
          'data: {"choices":[{"delta":{"content":"A"}}]}\r',
          '\rdata: {"choices":[{"delta":{"content":"B"}}]}\r\n\r',
          '\ndata: [DONE]\n\n',
        ),
      ),
    });

    await expect(collect(provider)).resolves.toEqual([
      { type: "delta", text: "A" },
      { type: "delta", text: "B" },
      { type: "done" },
    ]);
  });

  test("dispatches a CR-only event without waiting for the following chunk", async () => {
    vi.useFakeTimers();
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"ready"}}]}\r\r',
          ),
        );
      },
    });
    const provider = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    });
    const iterator = provider
      .stream(input, new AbortController().signal)
      [Symbol.asyncIterator]();
    let settled = false;
    const first = iterator.next().then((result) => {
      settled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(0);
    const settledBeforeAnotherChunk = settled;
    streamController.close();

    await expect(first).resolves.toEqual({
      done: false,
      value: { type: "delta", text: "ready" },
    });
    await iterator.return?.();
    expect(settledBeforeAnotherChunk).toBe(true);
  });

  test("emits at most one usage event and uses the last provider total", async () => {
    const provider = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        okResponse(
          'data: {"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\n',
          'data: {"usage":{"prompt_tokens":12,"completion_tokens":4,"prompt_cache_hit_tokens":8}}\n\n',
          "data: [DONE]\n\n",
        ),
      ),
    });

    await expect(collect(provider)).resolves.toEqual([
      {
        type: "usage",
        inputTokens: 12,
        outputTokens: 4,
        cacheHitTokens: 8,
      },
      { type: "done" },
    ]);
  });

  test("accepts realistic one-character delta streams larger than 64 KiB", async () => {
    const events = Array.from({ length: 700 }, (_, index) =>
      `data: ${JSON.stringify({
        id: `chatcmpl-${String(index).padStart(4, "0")}-${"a".repeat(96)}`,
        object: "chat.completion.chunk",
        created: 1_784_688_400,
        model: "deepseek-v4-flash",
        choices: [
          {
            index: 0,
            delta: { content: "a" },
            logprobs: null,
            finish_reason: null,
          },
        ],
      })}\n\n`,
    ).join("");
    const payload = `${events}data: [DONE]\n\n`;
    expect(new TextEncoder().encode(payload).byteLength).toBeGreaterThan(65_536);
    const provider = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(okResponse(payload)),
    });

    const result = await collect(provider);

    expect(result.filter((event) => event.type === "delta")).toHaveLength(700);
    expect(result.at(-1)).toEqual({ type: "done" });
  });

  test("cancels the upstream reader and removes abort handling after DONE", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      },
      cancel,
    });
    const provider = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(body, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
        ),
    });
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");

    await expect(collect(provider, controller.signal)).resolves.toEqual([
      { type: "done" },
    ]);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("DeepSeekProvider failures", () => {
  test.each([
    [401, "authentication", false],
    [402, "balance", false],
    [429, "rate_limited", true],
    [500, "upstream", true],
    [503, "upstream", true],
  ] as const)(
    "normalizes HTTP %i without exposing secrets or provider bodies",
    async (status, category, retryable) => {
      const secretBody = "private provider diagnostics and prompt body";
      const { response, cancel } = responseWithCancel({
        text: secretBody,
        status,
        contentType: "application/json",
        close: false,
      });
      const provider = new DeepSeekProvider({
        apiKey: TEST_TOKEN,
        fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
      });

      let caught: unknown;
      try {
        await collect(provider);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(DeepSeekProviderError);
      expect(caught).toMatchObject({ category, retryable });
      const message = String(caught);
      expect(message).not.toContain(TEST_TOKEN);
      expect(message).not.toContain(secretBody);
      expect(message).not.toContain(input.system);
      expect(cancel).toHaveBeenCalledTimes(1);
    },
  );

  test("normalizes network failures without copying their unsafe message", async () => {
    const unsafe = `network rejected ${TEST_TOKEN} ${input.system}`;
    const provider = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error(unsafe)),
    });

    await expect(collect(provider)).rejects.toMatchObject({
      category: "network",
      retryable: true,
    });
    await expect(collect(provider)).rejects.not.toThrow(unsafe);
  });

  test("times out after the default 45 seconds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
          once: true,
        });
      }),
    );
    const provider = new DeepSeekProvider({ apiKey: TEST_TOKEN, fetch: fetchMock });
    const result = collect(provider);
    const rejection = expect(result).rejects.toMatchObject({
      category: "timeout",
      retryable: true,
    });

    await vi.advanceTimersByTimeAsync(44_999);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await rejection;
  });

  test("sanitizes external abort reasons into a stable AbortError", async () => {
    const fetchMock = vi.fn<typeof fetch>((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
          once: true,
        });
      }),
    );
    const provider = new DeepSeekProvider({ apiKey: TEST_TOKEN, fetch: fetchMock });
    const controller = new AbortController();
    const unsafeReason = new DOMException(
      `visitor left ${TEST_TOKEN} ${input.system}`,
      "AbortError",
    );
    const result = collect(provider, controller.signal);
    const captured = result.catch((error: unknown) => error);

    controller.abort(unsafeReason);

    const caught = await captured;
    expect(caught).toMatchObject({
      name: "AbortError",
      message: "The operation was aborted",
    });
    expect(String(caught)).not.toContain(TEST_TOKEN);
    expect(String(caught)).not.toContain(input.system);
  });

  test("does not invoke fetch when the external signal is already aborted", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      okResponse("data: [DONE]\n\n"),
    );
    const provider = new DeepSeekProvider({ apiKey: TEST_TOKEN, fetch: fetchMock });
    const controller = new AbortController();
    controller.abort(new Error(`unsafe preflight ${TEST_TOKEN} ${input.system}`));

    let caught: unknown;
    try {
      await collect(provider, controller.signal);
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      name: "AbortError",
      message: "The operation was aborted",
    });
    expect(String(caught)).not.toContain(TEST_TOKEN);
    expect(String(caught)).not.toContain(input.system);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("cancels a response that arrives after an external abort", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn<typeof fetch>(
      () => new Promise((resolve) => (resolveFetch = resolve)),
    );
    const provider = new DeepSeekProvider({ apiKey: TEST_TOKEN, fetch: fetchMock });
    const controller = new AbortController();
    const result = collect(provider, controller.signal);
    const rejection = expect(result).rejects.toMatchObject({
      name: "AbortError",
      message: "The operation was aborted",
    });
    const { response, cancel } = responseWithCancel({
      text: "data: [DONE]\n\n",
      contentType: "text/event-stream",
      close: false,
    });

    controller.abort(new Error(`unsafe ${TEST_TOKEN}`));
    resolveFetch(response);

    await rejection;
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test("stops buffered deltas when externally aborted after the first yield", async () => {
    const { response, cancel } = responseWithCancel({
      text:
        'data: {"choices":[{"delta":{"content":"first"}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":"must-not-escape"}}]}\n\n' +
        "data: [DONE]\n\n",
      contentType: "text/event-stream",
      close: false,
    });
    const provider = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
    });
    const controller = new AbortController();
    const iterator = provider
      .stream(input, controller.signal)
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: "delta", text: "first" },
    });
    controller.abort(new Error(`unsafe ${TEST_TOKEN}`));

    await expect(iterator.next()).rejects.toMatchObject({
      name: "AbortError",
      message: "The operation was aborted",
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test("finishes cleanly once the terminal done event has been yielded", async () => {
    const { response, cancel } = responseWithCancel({
      text: "data: [DONE]\n\n",
      contentType: "text/event-stream",
      close: false,
    });
    const provider = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
    });
    const controller = new AbortController();
    const iterator = provider
      .stream(input, controller.signal)
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: "done" },
    });
    controller.abort(new Error(`late unsafe ${TEST_TOKEN}`));

    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test("cancels and times out a response that arrives after the deadline", async () => {
    vi.useFakeTimers();
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn<typeof fetch>(
      () => new Promise((resolve) => (resolveFetch = resolve)),
    );
    const provider = new DeepSeekProvider({ apiKey: TEST_TOKEN, fetch: fetchMock });
    const result = collect(provider);
    const rejection = expect(result).rejects.toMatchObject({
      category: "timeout",
      retryable: true,
    });
    const { response, cancel } = responseWithCancel({
      text: "data: [DONE]\n\n",
      contentType: "text/event-stream",
      close: false,
    });

    await vi.advanceTimersByTimeAsync(45_000);
    resolveFetch(response);

    await rejection;
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test.each([undefined, "application/json", "text/plain; charset=utf-8"])(
    "rejects invalid event-stream Content-Type %j and cancels the body",
    async (contentType) => {
      const { response, cancel } = responseWithCancel({
        text: "data: [DONE]\n\n",
        contentType,
        close: false,
      });
      const provider = new DeepSeekProvider({
        apiKey: TEST_TOKEN,
        fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
      });

      await expect(collect(provider)).rejects.toMatchObject({
        category: "malformed_response",
        retryable: false,
      });
      expect(cancel).toHaveBeenCalledTimes(1);
    },
  );

  test.each([
    [
      "line",
      () => `data: ${"x".repeat(MAX_SSE_LINE_CHARS)}\n\n`,
    ],
    [
      "event",
      () => {
        const segment = "x".repeat(Math.floor(MAX_SSE_EVENT_CHARS / 3));
        return `data: ${segment}\ndata: ${segment}\ndata: ${segment}x\n\n`;
      },
    ],
    [
      "stream",
      () => ": ping\n".repeat(Math.ceil((MAX_SSE_STREAM_BYTES + 1) / 7)),
    ],
  ] as const)("rejects an oversized SSE %s and cancels the body", async (_name, makeText) => {
    const { response, cancel } = responseWithCancel({
      text: makeText(),
      contentType: "text/event-stream",
      close: false,
    });
    const provider = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
    });

    await expect(collect(provider)).rejects.toMatchObject({
      category: "malformed_response",
      retryable: false,
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test("accepts the exact output limit and rejects one code point more", async () => {
    const makeOutput = (count: number): string => {
      const parts: string[] = [];
      let remaining = count;
      while (remaining > 0) {
        const length = Math.min(2_000, remaining);
        parts.push(
          `data: ${JSON.stringify({
            choices: [{ delta: { content: "好".repeat(length) } }],
          })}\n\n`,
        );
        remaining -= length;
      }
      parts.push("data: [DONE]\n\n");
      return parts.join("");
    };
    const accepted = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(okResponse(makeOutput(MAX_OUTPUT_CODE_POINTS))),
    });
    const { response, cancel } = responseWithCancel({
      text: makeOutput(MAX_OUTPUT_CODE_POINTS + 1),
      contentType: "text/event-stream",
      close: false,
    });
    const rejected = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
    });

    const acceptedEvents = await collect(accepted);
    expect(
      acceptedEvents
        .filter((event) => event.type === "delta")
        .reduce((sum, event) => sum + [...event.text].length, 0),
    ).toBe(MAX_OUTPUT_CODE_POINTS);
    await expect(collect(rejected)).rejects.toMatchObject({
      category: "malformed_response",
      retryable: false,
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test("cleans up the timeout when acquiring a reader fails", async () => {
    vi.useFakeTimers();
    const response = okResponse("data: [DONE]\n\n");
    const heldReader = response.body?.getReader();
    const provider = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
    });

    await expect(collect(provider)).rejects.toMatchObject({
      category: "malformed_response",
      retryable: false,
    });
    expect(vi.getTimerCount()).toBe(0);

    heldReader?.releaseLock();
    await response.body?.cancel();
  });

  test.each([
    [
      "missing body",
      new Response(null, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
      "malformed_response",
    ],
    [
      "malformed JSON",
      okResponse("data: private invalid response body\n\n"),
      "malformed_response",
    ],
    [
      "interrupted stream",
      okResponse('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'),
      "stream_interrupted",
    ],
  ] as const)("normalizes %s", async (_name, response, category) => {
    const provider = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
    });

    let caught: unknown;
    try {
      await collect(provider);
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ category });
    expect(String(caught)).not.toContain(TEST_TOKEN);
    expect(String(caught)).not.toContain("private invalid response body");
  });

  test("normalizes a reader failure as an interrupted stream", async () => {
    const unsafe = `stream broke ${TEST_TOKEN}`;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error(unsafe));
      },
    });
    const provider = new DeepSeekProvider({
      apiKey: TEST_TOKEN,
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(body, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
        ),
    });

    let caught: unknown;
    try {
      await collect(provider);
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      category: "stream_interrupted",
      retryable: true,
    });
    expect(String(caught)).not.toContain(unsafe);
  });
});
