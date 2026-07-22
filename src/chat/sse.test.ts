import { expect, test, vi } from "vitest";

import {
  SseProtocolError,
  isClientPublicErrorCode,
  parseSse,
} from "./sse";

const encoder = new TextEncoder();

function byteStream(bytes: Uint8Array, cuts: readonly number[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      let start = 0;
      for (const end of [...cuts, bytes.length]) {
        controller.enqueue(bytes.slice(start, end));
        start = end;
      }
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const events = [];
  for await (const event of parseSse(stream)) events.push(event);
  return events;
}

test("decodes typed events across UTF-8 byte, CRLF, LF, and event-block boundaries", async () => {
  const text = [
    'event: start\r\ndata: {"locale":"zh"}\r\n\r\n',
    'event: delta\ndata: {"text":"你好，"}\n\n',
    'event: sources\r\ndata: {"sources":[{"id":"S1","sourceId":"inkseat","projectId":"inkseat","page":8,"title":"INKSeat","citationLabel":"INKSEAT · P.08","publicHref":"/documents/inkseat.pdf#page=8"}]}\r\n\r\n',
    'event: done\ndata: {"inputTokens":12,"outputTokens":4}\n\n',
  ].join("");
  const bytes = encoder.encode(text);
  const multibyte = bytes.indexOf(0xe4);
  const cuts = [1, 7, 63, multibyte + 1, multibyte + 2, bytes.length - 2]
    .filter((cut, index, values) => cut > 0 && cut < bytes.length && values.indexOf(cut) === index)
    .sort((left, right) => left - right);

  const events = await collect(
    byteStream(bytes, cuts),
  );

  expect(events).toEqual([
    { type: "start", data: { locale: "zh" } },
    { type: "delta", data: { text: "你好，" } },
    {
      type: "sources",
      data: {
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
      },
    },
    { type: "done", data: { inputTokens: 12, outputTokens: 4 } },
  ]);
});

test("parses a validated public error event", async () => {
  const stream = byteStream(
    encoder.encode(
      'event: error\ndata: {"code":"rate_limited","message":"wait","retryable":true}\n\n',
    ),
    [],
  );

  await expect(collect(stream)).resolves.toEqual([
    {
      type: "error",
      data: { code: "rate_limited", message: "wait", retryable: true },
    },
  ]);
});

test.each([
  "event: mystery\ndata: {}\n\n",
  "event: delta\ndata: not-json\n\n",
  'event: delta\ndata: {"text":3}\n\n',
  'event: sources\ndata: {"sources":[{"id":"S9"}]}\n\n',
  'event: sources\ndata: {"sources":[{"id":"S1","sourceId":"profile","title":"Profile","citationLabel":"","publicHref":"#about"}]}\n\n',
  `event: delta\ndata: {"text":"${"x".repeat(70_000)}"}\n\n`,
])("rejects unknown, malformed, or oversized events without executing content", async (wire) => {
  const marker = "__portfolioSseExecuted";
  delete (globalThis as Record<string, unknown>)[marker];
  const hostile = wire.replace("not-json", `(globalThis.${marker}=true)`);

  await expect(collect(byteStream(encoder.encode(hostile), [3, 9]))).rejects.toBeInstanceOf(
    SseProtocolError,
  );
  expect((globalThis as Record<string, unknown>)[marker]).toBeUndefined();
});

test("rejects a stream that ends with an incomplete event block", async () => {
  await expect(
    collect(byteStream(encoder.encode('event: delta\ndata: {"text":"partial"}'), [])),
  ).rejects.toBeInstanceOf(SseProtocolError);
});

test("supports lone CR framing across chunk boundaries and ignores standard keepalives and fields", async () => {
  const wire = [
    ": keepalive\r\r",
    "id: 42\rretry: 1000\rx-ignored: yes\r\r",
    'event: start\rdata: {"locale":"en"}\r\r',
    'event: sources\rdata: {"sources":[]}\r\r',
    "event: done\rdata: {}\r\r",
  ].join("");
  const bytes = encoder.encode(wire);
  const firstCr = bytes.indexOf(13);

  await expect(collect(byteStream(bytes, [firstCr + 1, firstCr + 2]))).resolves.toEqual([
    { type: "start", data: { locale: "en" } },
    { type: "sources", data: { sources: [] } },
    { type: "done", data: {} },
  ]);
});

test("enforces an 8192-code-point total streamed answer limit", async () => {
  const wire = [
    'event: start\ndata: {"locale":"en"}\n\n',
    eventWire("delta", { text: "😀".repeat(4_500) }),
    eventWire("delta", { text: "x".repeat(3_693) }),
  ].join("");

  await expect(collect(byteStream(encoder.encode(wire), []))).rejects.toBeInstanceOf(
    SseProtocolError,
  );
});

test("enforces a one MiB total raw stream limit even for ignored keepalives", async () => {
  const keepalive = `: ${"x".repeat(1_024)}\n\n`;
  const wire = keepalive.repeat(1_030);

  await expect(collect(byteStream(encoder.encode(wire), []))).rejects.toBeInstanceOf(
    SseProtocolError,
  );
});

test("cancels the reader on malformed protocol and on early iterator return", async () => {
  const malformedCancelled = vi.fn();
  const malformed = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("event: mystery\ndata: {}\n\n"));
    },
    cancel: malformedCancelled,
  });
  await expect(collect(malformed)).rejects.toBeInstanceOf(SseProtocolError);
  expect(malformedCancelled).toHaveBeenCalledOnce();

  const earlyCancelled = vi.fn();
  const early = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('event: start\ndata: {"locale":"en"}\n\n'));
    },
    cancel: earlyCancelled,
  });
  const iterator = parseSse(early);
  await expect(iterator.next()).resolves.toEqual({
    done: false,
    value: { type: "start", data: { locale: "en" } },
  });
  await iterator.return(undefined);
  expect(earlyCancelled).toHaveBeenCalledOnce();
});

test.each([
  "//evil.example/file.pdf",
  "https://evil.example/file.pdf",
  "javascript:alert(1)",
  "/documents\\evil.pdf",
  "/documents/%5Cevil.pdf",
  "/documents/file.pdf%0Aignored",
  "/documents/file.pdf\u0000#page=1",
])("rejects unsafe public source href %s", async (publicHref) => {
  const wire = eventWire("sources", {
    sources: [{
      id: "S1",
      sourceId: "inkseat",
      projectId: "inkseat",
      page: 1,
      title: "INKSeat",
      citationLabel: "INKSeat · P.01",
      publicHref,
    }],
  });
  await expect(collect(byteStream(encoder.encode(wire), []))).rejects.toBeInstanceOf(
    SseProtocolError,
  );
});

test("exports a runtime-safe public error code guard", () => {
  expect(isClientPublicErrorCode("rate_limited")).toBe(true);
  expect(isClientPublicErrorCode("attacker_controlled")).toBe(false);
  expect(isClientPublicErrorCode(3)).toBe(false);
});

function eventWire(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}
