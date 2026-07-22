// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest";

import type { ProviderEvent, ProviderInput } from "./chat-types";
import {
  DeepSeekProvider,
  DeepSeekProviderError,
} from "./deepseek-provider";

const TEST_TOKEN = "unit-test-bearer-token";

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
      .mockResolvedValue(new Response(byteStream(chunks), { status: 200 }));
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
        .mockResolvedValue(new Response(body, { status: 200 })),
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
      const provider = new DeepSeekProvider({
        apiKey: TEST_TOKEN,
        fetch: vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response(secretBody, { status })),
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

  test("preserves external abort identity instead of normalizing it", async () => {
    const fetchMock = vi.fn<typeof fetch>((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
          once: true,
        });
      }),
    );
    const provider = new DeepSeekProvider({ apiKey: TEST_TOKEN, fetch: fetchMock });
    const controller = new AbortController();
    const reason = new DOMException("visitor left", "AbortError");
    const result = collect(provider, controller.signal);
    const rejection = expect(result).rejects.toBe(reason);

    controller.abort(reason);

    await rejection;
  });

  test.each([
    ["missing body", new Response(null, { status: 200 }), "malformed_response"],
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
        .mockResolvedValue(new Response(body, { status: 200 })),
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
