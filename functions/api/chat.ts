import { createRuntime } from "../../src/chat/server/runtime.js";

type CloudflareEnv = Readonly<Record<string, string | undefined>>;

interface PagesContext {
  readonly request: Request;
  readonly env: CloudflareEnv;
}

let runtime: ReturnType<typeof createRuntime> | undefined;

function methodNotAllowed(): Response {
  return Response.json(
    {
      error: {
        code: "method_not_allowed",
        message: "Only POST is supported.",
        retryable: false,
      },
    },
    {
      status: 405,
      headers: {
        allow: "POST",
        "cache-control": "no-store",
      },
    },
  );
}

export async function onRequest(context: PagesContext): Promise<Response> {
  if (context.request.method !== "POST") return methodNotAllowed();

  runtime ??= createRuntime({
    env: context.env,
    ipAddress: (request) =>
      request.headers.get("CF-Connecting-IP") ?? undefined,
  });
  return runtime.handle(context.request);
}
