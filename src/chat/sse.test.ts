import { expect, test } from "vitest";

import { SseProtocolError, parseSse } from "./sse";

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
