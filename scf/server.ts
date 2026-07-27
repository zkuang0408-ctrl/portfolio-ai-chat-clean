import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { once } from "node:events";

import type { ChatRuntime } from "../src/chat/server/runtime.js";
import { MAX_CHAT_BODY_BYTES } from "../src/chat/server/validation.js";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

interface ScfServerOptions {
  readonly chat: ChatRuntime;
  readonly allowedOrigins: readonly string[];
}

class RequestBodyError extends Error {}

export function safeResponseHeaders(
  headers: Headers,
): readonly [string, string][] {
  return [...headers.entries()].filter(
    ([name]) => !HOP_BY_HOP_HEADERS.has(name.toLowerCase()),
  );
}

function webHeaders(source: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

async function readBody(
  request: IncomingMessage,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const value of request) {
    const chunk = value instanceof Uint8Array
      ? value
      : Buffer.from(value as string);
    size += chunk.byteLength;
    if (size > MAX_CHAT_BODY_BYTES) throw new RequestBodyError();
    chunks.push(chunk);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function corsHeaders(origin: string): readonly [string, string][] {
  return [
    ["access-control-allow-origin", origin],
    ["vary", "Origin"],
  ];
}

function applyHeaders(
  response: ServerResponse,
  headers: readonly (readonly [string, string])[],
): void {
  for (const [name, value] of headers) {
    response.setHeader(name, value);
  }
}

function writeJson(
  response: ServerResponse,
  status: number,
  code: string,
  origin?: string,
): void {
  response.statusCode = status;
  applyHeaders(response, [
    ["content-type", "application/json; charset=utf-8"],
    ["cache-control", "no-store"],
    ...(origin ? corsHeaders(origin) : []),
  ]);
  response.end(JSON.stringify({
    error: {
      code,
      message: "The request could not be completed.",
      retryable: false,
    },
  }));
}

function writePreflight(
  response: ServerResponse,
  origin: string,
): void {
  response.statusCode = 204;
  applyHeaders(response, [
    ...corsHeaders(origin),
    ["access-control-allow-methods", "POST, OPTIONS"],
    ["access-control-allow-headers", "content-type"],
    ["access-control-max-age", "600"],
    ["cache-control", "no-store"],
  ]);
  response.end();
}

function requestUrl(request: IncomingMessage): string {
  const host = request.headers.host;
  if (
    typeof host !== "string" ||
    host.length === 0 ||
    host.length > 255 ||
    /[\s/@\\]/u.test(host)
  ) {
    throw new Error("invalid host");
  }
  return new URL(request.url ?? "/", `https://${host}`).href;
}

async function toWebRequest(
  request: IncomingMessage,
  signal: AbortSignal,
): Promise<Request> {
  const body = await readBody(request);
  return new Request(requestUrl(request), {
    method: request.method,
    headers: webHeaders(request.headers),
    body: body.byteLength > 0
      ? body.buffer as ArrayBuffer
      : undefined,
    signal,
  });
}

async function writeWebResponse(
  source: Response,
  target: ServerResponse,
  origin: string,
): Promise<void> {
  target.statusCode = source.status;
  applyHeaders(target, [
    ...safeResponseHeaders(source.headers),
    ...corsHeaders(origin),
  ]);
  if (source.body === null) {
    target.end();
    return;
  }

  target.flushHeaders();
  const reader = source.body.getReader();
  try {
    while (!target.destroyed) {
      const item = await reader.read();
      if (item.done) break;
      if (!target.write(Buffer.from(item.value))) {
        await once(target, "drain");
      }
    }
    if (!target.destroyed) target.end();
    else await reader.cancel();
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Connection cleanup must not replace the public response.
    }
  }
}

export function createScfServer(
  options: ScfServerOptions,
): Server {
  return createServer(async (request, response) => {
    const origin = typeof request.headers.origin === "string"
      ? request.headers.origin
      : undefined;
    if (!origin || !options.allowedOrigins.includes(origin)) {
      writeJson(response, 403, "cross_origin_request");
      return;
    }

    let pathname: string;
    try {
      pathname = new URL(request.url ?? "/", "https://scf.invalid")
        .pathname;
    } catch {
      writeJson(response, 400, "invalid_request", origin);
      return;
    }
    if (pathname !== "/chat") {
      writeJson(response, 404, "not_found", origin);
      return;
    }
    if (request.method === "OPTIONS") {
      writePreflight(response, origin);
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("allow", "POST, OPTIONS");
      writeJson(response, 405, "method_not_allowed", origin);
      return;
    }

    const abortController = new AbortController();
    const abort = () => {
      if (!response.writableEnded && !abortController.signal.aborted) {
        abortController.abort();
      }
    };
    request.once("aborted", abort);
    response.once("close", abort);
    try {
      const webRequest = await toWebRequest(
        request,
        abortController.signal,
      );
      const webResponse = await options.chat.handle(webRequest);
      await writeWebResponse(webResponse, response, origin);
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
      } else if (error instanceof RequestBodyError) {
        writeJson(response, 413, "body_too_large", origin);
      } else if (!abortController.signal.aborted) {
        writeJson(response, 500, "internal_error", origin);
      }
    } finally {
      request.off("aborted", abort);
      response.off("close", abort);
    }
  });
}
