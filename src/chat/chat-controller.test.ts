import { beforeEach, expect, test, vi } from "vitest";

import { CHAT_CONTENT } from "./content";
import {
  type PortfolioChatDependencies,
  startPortfolioChat,
} from "./chat-controller";
import { renderChat } from "./render-chat";

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
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() =>
    Promise.resolve(responseFromEvents([
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
    ])),
  );
  const dependencies: PortfolioChatDependencies = {
    fetch,
    endpoint:
      "https://1234567890-abcd1234.ap-guangzhou.tencentscf.com/chat",
    storage: sessionStorage,
    locale,
    navigateToSource,
    createSessionId: () => "123e4567-e89b-42d3-a456-426614174000",
    ...overrides,
  };
  const cleanup = startPortfolioChat(renderChat(root, locale), dependencies);
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
  expect(fetch.mock.calls[0]?.[0]).toBe(
    "https://1234567890-abcd1234.ap-guangzhou.tencentscf.com/chat",
  );
  expect(JSON.parse(String(request?.body))).toMatchObject({
    message: CHAT_CONTENT.zh.recommendations[0],
    locale: "zh",
    history: [],
  });
  cleanup();
});

test("collapses guidance after submit and lets the visitor reopen it", async () => {
  const { root, cleanup } = setup();
  const guidance = root.querySelector<HTMLElement>("[data-chat-guidance]")!;
  const toggle = root.querySelector<HTMLButtonElement>("[data-chat-guide-toggle]")!;

  expect(guidance.hidden).toBe(false);
  expect(toggle.hidden).toBe(true);

  root.querySelector<HTMLButtonElement>("[data-chat-recommendation]")?.click();
  await settle();

  expect(guidance.hidden).toBe(true);
  expect(toggle.hidden).toBe(false);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(toggle.textContent).toBe(CHAT_CONTENT.zh.showGuideLabel);

  toggle.click();
  expect(guidance.hidden).toBe(false);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(toggle.textContent).toBe(CHAT_CONTENT.zh.hideGuideLabel);

  const input = root.querySelector<HTMLTextAreaElement>("[data-chat-input]")!;
  input.value = "继续介绍他的项目";
  root.querySelector<HTMLFormElement>("[data-chat-form]")?.requestSubmit();
  expect(guidance.hidden).toBe(true);
  cleanup();
});

test("starts with compact guidance when persisted conversation history exists", async () => {
  const first = setup();
  first.root.querySelector<HTMLButtonElement>("[data-chat-recommendation]")?.click();
  await settle();
  first.cleanup();
  first.root.remove();

  const second = setup();
  const guidance = second.root.querySelector<HTMLElement>("[data-chat-guidance]")!;
  const toggle = second.root.querySelector<HTMLButtonElement>("[data-chat-guide-toggle]")!;

  expect(guidance.hidden).toBe(true);
  expect(toggle.hidden).toBe(false);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  second.cleanup();
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
  const answer = root.querySelector<HTMLElement>(".chat-message--assistant")!;
  const sources = root.querySelector<HTMLElement>("[data-chat-sources]")!;
  expect(answer.nextElementSibling).toBe(sources);
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

test("moves evidence after the newest answer on later turns", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(responseFromEvents([
      event("start", { locale: "zh" }),
      event("delta", { text: "第一轮回答。" }),
      event("sources", {
        sources: [{
          id: "S1",
          sourceId: "inkseat",
          projectId: "inkseat",
          page: 8,
          title: "INKSeat",
          citationLabel: "INKSEAT · P.08",
          publicHref: "/documents/inkseat.pdf#page=8",
        }],
      }),
      event("done", {}),
    ]))
    .mockResolvedValueOnce(responseFromEvents([
      event("start", { locale: "zh" }),
      event("delta", { text: "第二轮回答。" }),
      event("sources", {
        sources: [{
          id: "S2",
          sourceId: "emovue",
          projectId: "emovue",
          page: 12,
          title: "EMOVUE",
          citationLabel: "EMOVUE · P.12",
          publicHref: "/documents/emovue.pdf#page=12",
        }],
      }),
      event("done", {}),
    ]));
  const { root, navigateToSource, cleanup } = setup({ fetch });
  const form = root.querySelector<HTMLFormElement>("[data-chat-form]")!;
  const input = root.querySelector<HTMLTextAreaElement>("[data-chat-input]")!;
  input.value = "第一个问题";
  form.requestSubmit();
  await settle();
  input.value = "第二个问题";
  form.requestSubmit();
  await settle();
  const answers = root.querySelectorAll(".chat-message--assistant");
  const sources = root.querySelector<HTMLElement>("[data-chat-sources]")!;
  expect(answers).toHaveLength(2);
  expect(answers[1]?.nextElementSibling).toBe(sources);
  expect(root.querySelector("[data-chat-transcript]")?.lastElementChild).toBe(sources);
  const sourceButtons = root.querySelectorAll<HTMLButtonElement>("[data-chat-source]");
  expect(sourceButtons).toHaveLength(1);
  expect(sourceButtons[0]?.textContent).toBe("EMOVUE · P.12");
  sourceButtons[0]?.click();
  expect(navigateToSource).toHaveBeenCalledWith(
    expect.objectContaining({ sourceId: "emovue", projectId: "emovue", page: 12 }),
  );
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

test.each([
  [
    "duplicate sources",
    [event("start", { locale: "zh" }), event("sources", { sources: [] }), event("sources", { sources: [] }), event("done", {})],
  ],
  [
    "delta after sources",
    [event("start", { locale: "zh" }), event("sources", { sources: [] }), event("delta", { text: "late" }), event("done", {})],
  ],
  [
    "done without sources",
    [event("start", { locale: "zh" }), event("delta", { text: "answer" }), event("done", {})],
  ],
  [
    "duplicate start",
    [event("start", { locale: "zh" }), event("start", { locale: "zh" })],
  ],
] as const)("rejects %s event ordering and clears streamed sources", async (_name, events) => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(responseFromEvents(events));
  const { root, cleanup } = setup({ fetch });

  root.querySelector<HTMLButtonElement>("[data-chat-recommendation]")?.click();
  await settle();

  expect(root.querySelector("[data-chat-retry]")).not.toBeNull();
  expect(root.querySelectorAll("[data-chat-source]")).toHaveLength(0);
  expect(sessionStorage.getItem("portfolio-chat-history-v1")).toBeNull();
  cleanup();
});

test("appends sentence batches as new text nodes without replacing prior nodes", async () => {
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      controller.enqueue(encoder.encode(event("start", { locale: "en" })));
      controller.enqueue(encoder.encode(event("delta", { text: "First sentence. Next" })));
    },
  }));
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
  const { root, cleanup } = setup({ fetch, locale: "en" }, "en");

  root.querySelector<HTMLButtonElement>("[data-chat-recommendation]")?.click();
  await settle();
  const answer = root.querySelector<HTMLElement>(".chat-message--assistant")!;
  const firstNode = answer.firstChild;
  expect(firstNode?.textContent).toBe("First sentence. ");

  streamController?.enqueue(encoder.encode(event("delta", { text: "sentence!" })));
  streamController?.enqueue(encoder.encode(event("sources", { sources: [] })));
  streamController?.enqueue(encoder.encode(event("done", {})));
  streamController?.close();
  await settle();

  expect(answer.childNodes).toHaveLength(2);
  expect(answer.firstChild).toBe(firstNode);
  expect(Array.from(answer.childNodes, (node) => node.textContent)).toEqual([
    "First sentence. ",
    "Nextsentence!",
  ]);
  cleanup();
});

test("removes an empty assistant placeholder when failure occurs before visible text", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response("unavailable", { status: 503 }),
  );
  const { root, cleanup } = setup({ fetch });

  root.querySelector<HTMLButtonElement>("[data-chat-recommendation]")?.click();
  await settle();

  expect(root.querySelectorAll(".chat-message--assistant")).toHaveLength(0);
  expect(root.querySelector("[data-chat-retry]")).not.toBeNull();
  cleanup();
});

test("clears the sent input and shows an assistant-side evidence wait state immediately", () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
    () => new Promise<Response>(() => {}),
  );
  const { root, cleanup } = setup({ fetch });
  const input = root.querySelector<HTMLTextAreaElement>("[data-chat-input]")!;
  input.value = "我想了解他的作品方法";

  root.querySelector<HTMLFormElement>("[data-chat-form]")?.requestSubmit();

  expect(input.value).toBe("");
  expect(root.querySelector(".chat-message--user")?.textContent).toBe(
    "我想了解他的作品方法",
  );
  const loading = root.querySelector<HTMLElement>("[data-chat-loading]")!;
  expect(loading.childNodes[0]?.textContent).toBe("正在查找作品依据");
  expect(loading.querySelectorAll(".chat-loading-dot")).toHaveLength(3);
  expect(root.querySelector("[data-chat-status]")?.textContent).toBe("");
  root.querySelector<HTMLFormElement>("[data-chat-form]")?.requestSubmit();
  expect(fetch).toHaveBeenCalledOnce();
  cleanup();
});
