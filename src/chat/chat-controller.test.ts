import { beforeEach, expect, test, vi } from "vitest";

import { CHAT_CONTENT } from "./content";
import {
  type PortfolioChatDependencies,
  startPortfolioChat,
} from "./chat-controller";

const encoder = new TextEncoder();

function responseFromEvents(events: readonly string[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) controller.enqueue(encoder.encode(event));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

function event(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

function setup(
  overrides: Partial<PortfolioChatDependencies> = {},
  locale: "zh" | "en" = "zh",
) {
  const root = document.createElement("aside");
  document.body.append(root);
  const navigateToSource = vi.fn();
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    responseFromEvents([
      event("start", { locale }),
      event("delta", { text: locale === "zh" ? "依据作品，" : "Based on the work, " }),
      event("delta", { text: locale === "zh" ? "他善于系统思考。" : "he thinks in systems." }),
      event("sources", {
        sources: [
          {
            id: "S1",
            sourceId: "inkseat",
            projectId: "inkseat",
            page: 8,
            title: "INKSeat",
            citationLabel: "INKSEAT · P.08",
            publicHref: "/documents/inkseat.pdf#page=8",
          },
        ],
      }),
      event("done", {}),
    ]),
  );
  const dependencies: PortfolioChatDependencies = {
    fetch,
    storage: sessionStorage,
    locale,
    navigateToSource,
    createSessionId: () => "123e4567-e89b-42d3-a456-426614174000",
    ...overrides,
  };
  const cleanup = startPortfolioChat(root, dependencies);
  return { root, fetch, navigateToSource, cleanup };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

test("recommendation click submits the exact localized question", async () => {
  const { root, fetch, cleanup } = setup();
  const recommendation = root.querySelector<HTMLButtonElement>(
    "[data-chat-recommendation]",
  );

  recommendation?.click();
  await settle();

  const request = fetch.mock.calls[0]?.[1];
  expect(JSON.parse(String(request?.body))).toMatchObject({
    message: CHAT_CONTENT.zh.recommendations[0],
    locale: "zh",
    history: [],
  });
  cleanup();
});

test("Enter submits while Shift+Enter and composing Enter do not", async () => {
  const { root, fetch, cleanup } = setup();
  const input = root.querySelector<HTMLTextAreaElement>("[data-chat-input]")!;
  input.value = "问题";
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }));
  expect(fetch).not.toHaveBeenCalled();

  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await settle();
  expect(fetch).toHaveBeenCalledOnce();
  cleanup();
});

test("appends ordered sentence-batched deltas, trusted sources, and follow-up copy", async () => {
  const partial = responseFromEvents([
    event("start", { locale: "zh" }),
    event("delta", { text: "第一" }),
    event("delta", { text: "句。第二" }),
    event("delta", { text: "句！" }),
    event("sources", {
      sources: [
        {
          id: "S2",
          sourceId: "profile",
          title: "<img src=x onerror=alert(1)>",
          citationLabel: "个人资料",
          publicHref: "#about",
        },
      ],
    }),
    event("done", {}),
  ]);
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(partial);
  const { root, navigateToSource, cleanup } = setup({ fetch });
  const input = root.querySelector<HTMLTextAreaElement>("textarea")!;
  input.value = "介绍";
  root.querySelector<HTMLFormElement>("form")?.requestSubmit();
  await settle();

  expect(root.querySelector(".chat-message--assistant")?.textContent).toBe(
    "第一句。第二句！",
  );
  expect(root.querySelector("[data-chat-status]")?.textContent).toContain("继续");
  const source = root.querySelector<HTMLButtonElement>("[data-chat-source]")!;
  expect(source.textContent).toBe("个人资料");
  expect(source.querySelector("img")).toBeNull();
  source.click();
  expect(navigateToSource).toHaveBeenCalledWith(
    expect.objectContaining({ sourceId: "profile" }),
  );
  expect(JSON.parse(sessionStorage.getItem("portfolio-chat-history-v1") ?? "[]")).toHaveLength(2);
  cleanup();
});

test("does not invent source controls when the stream sends none", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    responseFromEvents([
      event("start", { locale: "en" }),
      event("delta", { text: "Answer mentioning INKSeat." }),
      event("sources", { sources: [] }),
      event("done", {}),
    ]),
  );
  const { root, cleanup } = setup({ fetch, locale: "en" }, "en");
  root.querySelector<HTMLButtonElement>("[data-chat-recommendation]")?.click();
  await settle();
  expect(root.querySelectorAll("[data-chat-source]")).toHaveLength(0);
  cleanup();
});

test.each([
  ["rate_limited", "请求较多"],
  ["chat_disabled", "暂时不可用"],
  ["upstream_unavailable", "暂时无法完成"],
  ["internal_error", "出现问题"],
])("maps public error %s to localized safe copy", async (code, copy) => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    responseFromEvents([
      event("start", { locale: "zh" }),
      event("error", { code, message: "SECRET INTERNAL", retryable: true }),
    ]),
  );
  const { root, cleanup } = setup({ fetch });
  root.querySelector<HTMLButtonElement>("[data-chat-recommendation]")?.click();
  await settle();
  expect(root.querySelector("[data-chat-status]")?.textContent).toContain(copy);
  expect(root.textContent).not.toContain("SECRET INTERNAL");
  expect(sessionStorage.getItem("portfolio-chat-history-v1")).toBeNull();
  cleanup();
});

test("handles non-OK non-JSON responses without exposing the body", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response("PRIVATE UPSTREAM DETAIL", { status: 503 }),
  );
  const { root, cleanup } = setup({ fetch }, "en");
  root.querySelector<HTMLButtonElement>("[data-chat-recommendation]")?.click();
  await settle();
  expect(root.querySelector("[data-chat-status]")?.textContent).toContain("couldn’t complete");
  expect(root.textContent).not.toContain("PRIVATE UPSTREAM DETAIL");
  cleanup();
});

test("preserves received text on stream failure and offers a retry", async () => {
  let attempt = 0;
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
    attempt += 1;
    if (attempt === 2) {
      return responseFromEvents([
        event("start", { locale: "en" }),
        event("delta", { text: "Recovered." }),
        event("sources", { sources: [] }),
        event("done", {}),
      ]);
    }
    const chunks = [
      encoder.encode(event("start", { locale: "en" })),
      encoder.encode(event("delta", { text: "Partial sentence." })),
    ];
    let index = 0;
    return new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          const chunk = chunks[index];
          index += 1;
          if (chunk) {
            controller.enqueue(chunk);
          } else {
            controller.error(new DOMException("aborted", "AbortError"));
          }
        },
      }),
      { status: 200 },
    );
  });
  const { root, cleanup } = setup({ fetch, locale: "en" }, "en");
  root.querySelector<HTMLButtonElement>("[data-chat-recommendation]")?.click();
  await settle();
  expect(root.querySelector(".chat-message--assistant")?.textContent).toContain("Partial sentence.");
  const retry = root.querySelector<HTMLButtonElement>("[data-chat-retry]")!;
  expect(retry.textContent).toMatch(/retry/i);
  retry.click();
  await settle();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(root.textContent).toContain("Recovered.");
  cleanup();
});

test("allows only one in-flight request and cleanup aborts it and removes listeners", async () => {
  let signal: AbortSignal | undefined;
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((_url, init) => {
    signal = init?.signal ?? undefined;
    return new Promise<Response>(() => {});
  });
  const { root, cleanup } = setup({ fetch });
  const button = root.querySelector<HTMLButtonElement>("[data-chat-recommendation]")!;
  button.click();
  button.click();
  expect(fetch).toHaveBeenCalledOnce();
  expect(signal?.aborted).toBe(false);

  cleanup();
  expect(signal?.aborted).toBe(true);
  button.click();
  expect(fetch).toHaveBeenCalledOnce();
});

test("aborts the request after rejecting a malformed stream", async () => {
  let signal: AbortSignal | undefined;
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_url, init) => {
    signal = init?.signal ?? undefined;
    return responseFromEvents([event("mystery", {})]);
  });
  const { root, cleanup } = setup({ fetch });

  root.querySelector<HTMLButtonElement>("[data-chat-recommendation]")?.click();
  await settle();

  expect(signal?.aborted).toBe(true);
  expect(root.querySelector("[data-chat-retry]")).not.toBeNull();
  cleanup();
});
