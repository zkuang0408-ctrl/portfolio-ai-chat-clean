// @vitest-environment node

import type { AddressInfo } from "node:net";

import {
  afterEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import type { ChatRuntime } from "../src/chat/server/runtime";
import {
  createScfServer,
  safeResponseHeaders,
} from "./server";

const ALLOWED_ORIGIN =
  "https://portfolio-ai-chat-clean.pages.dev";
const encoder = new TextEncoder();
const servers: ReturnType<typeof createScfServer>[] = [];
type ChatHandle = (request: Request) => Promise<Response>;
type ChatHandleMock = ReturnType<typeof vi.fn<ChatHandle>>;

function sseResponse(): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'event: start\ndata: {"locale":"zh"}\n\n',
          ),
        );
        controller.enqueue(
          encoder.encode(
            'event: delta\ndata: {"text":"回答。"}\n\n',
          ),
        );
        controller.enqueue(
          encoder.encode(
            'event: sources\ndata: {"sources":[]}\n\n',
          ),
        );
        controller.enqueue(
          encoder.encode("event: done\ndata: {}\n\n"),
        );
        controller.close();
      },
    }),
    {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
      },
    },
  );
}

async function start(
  handle: ChatHandleMock = vi.fn<ChatHandle>(
    async () => sseResponse(),
  ),
): Promise<{
  readonly baseUrl: string;
  readonly handle: ChatHandleMock;
}> {
  const chat: ChatRuntime = { enabled: true, handle };
  const server = createScfServer({
    chat,
    allowedOrigins: [ALLOWED_ORIGIN],
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    handle,
  };
}

async function eventually(
  predicate: () => boolean,
  timeoutMs = 1_000,
): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("condition was not reached");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

describe("createScfServer", () => {
  test("returns exact preflight headers for an allowed origin", async () => {
    const { baseUrl, handle } = await start();
    const response = await fetch(`${baseUrl}/chat`, {
      method: "OPTIONS",
      headers: {
        origin: ALLOWED_ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin"))
      .toBe(ALLOWED_ORIGIN);
    expect(response.headers.get("access-control-allow-methods"))
      .toBe("POST, OPTIONS");
    expect(response.headers.get("access-control-allow-headers"))
      .toBe("content-type");
    expect(response.headers.get("access-control-allow-credentials"))
      .toBeNull();
    expect(response.headers.get("vary")).toBe("Origin");
    expect(handle).not.toHaveBeenCalled();
  });

  test.each([undefined, "https://attacker.example"])(
    "rejects disallowed origin %j without a CORS grant",
    async (origin) => {
      const { baseUrl, handle } = await start();
      const headers = new Headers({
        "content-type": "application/json",
      });
      if (origin) headers.set("origin", origin);
      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers,
        body: "{}",
      });

      expect(response.status).toBe(403);
      expect(response.headers.get("access-control-allow-origin"))
        .toBeNull();
      expect(await response.json()).toMatchObject({
        error: { code: "cross_origin_request" },
      });
      expect(handle).not.toHaveBeenCalled();
    },
  );

  test.each([
    ["GET", "/chat", 405, "method_not_allowed"],
    ["POST", "/missing", 404, "not_found"],
  ] as const)(
    "rejects %s %s",
    async (method, path, status, code) => {
      const { baseUrl, handle } = await start();
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { origin: ALLOWED_ORIGIN },
      });

      expect(response.status).toBe(status);
      expect(response.headers.get("content-type"))
        .toContain("application/json");
      expect(await response.json()).toMatchObject({
        error: { code },
      });
      expect(handle).not.toHaveBeenCalled();
    },
  );

  test("forwards POST body and SCF headers to the shared runtime", async () => {
    const { baseUrl, handle } = await start();
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: {
        origin: ALLOWED_ORIGIN,
        "content-type": "application/json",
        "x-scf-remote-addr": "203.0.113.8",
      },
      body: '{"message":"hello"}',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin"))
      .toBe(ALLOWED_ORIGIN);
    expect(handle).toHaveBeenCalledOnce();
    const request = handle.mock.calls[0]?.[0];
    expect(request).toBeDefined();
    const forwarded = request!;
    expect(new URL(forwarded.url).pathname).toBe("/chat");
    expect(forwarded.headers.get("origin")).toBe(ALLOWED_ORIGIN);
    expect(forwarded.headers.get("x-scf-remote-addr"))
      .toBe("203.0.113.8");
    expect(await forwarded.text()).toBe('{"message":"hello"}');
  });

  test("streams SSE chunks before the answer completes", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handle = vi.fn<ChatHandle>(async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(
              encoder.encode("event: start\ndata: {}\n\n"),
            );
            await gate;
            controller.enqueue(
              encoder.encode(
                'event: delta\ndata: {"text":"later"}\n\n',
              ),
            );
            controller.close();
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      ),
    );
    const { baseUrl } = await start(handle);
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: {
        origin: ALLOWED_ORIGIN,
        "content-type": "application/json",
      },
      body: "{}",
    });
    const reader = response.body!.getReader();

    expect(
      new TextDecoder().decode((await reader.read()).value),
    ).toContain("event: start");
    release();
    expect(
      new TextDecoder().decode((await reader.read()).value),
    ).toContain("event: delta");
  });

  test("aborts the Web request when the visitor disconnects", async () => {
    let requestSignal: AbortSignal | undefined;
    const handle = vi.fn<ChatHandle>(async (request: Request) => {
      requestSignal = request.signal;
      await new Promise<void>((resolve) => {
        request.signal.addEventListener("abort", () => resolve(), {
          once: true,
        });
      });
      return new Response(null, { status: 499 });
    });
    const { baseUrl } = await start(handle);
    const controller = new AbortController();
    const pending = fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: {
        origin: ALLOWED_ORIGIN,
        "content-type": "application/json",
      },
      body: "{}",
      signal: controller.signal,
    });

    await eventually(() => handle.mock.calls.length === 1);
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await eventually(() => requestSignal?.aborted === true);
  });
});

test("filters hop-by-hop response headers", () => {
  expect(
    safeResponseHeaders(new Headers({
      connection: "close",
      "transfer-encoding": "chunked",
      "content-type": "text/event-stream",
      "cache-control": "no-store",
    })),
  ).toEqual([
    ["cache-control", "no-store"],
    ["content-type", "text/event-stream"],
  ]);
});
