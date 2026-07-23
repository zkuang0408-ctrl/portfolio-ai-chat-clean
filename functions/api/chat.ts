import {
  createRuntime,
  type RuntimeOptions,
} from "../../src/chat/server/runtime.js";

interface AiGateway {
  getUrl(provider: string): Promise<string>;
}

interface AiBinding {
  gateway(id: string): AiGateway;
}

type CloudflareEnv = Readonly<Record<string, unknown>> & {
  readonly AI?: AiBinding;
};

interface PagesContext {
  readonly request: Request;
  readonly env: CloudflareEnv;
}

let runtimePromise: Promise<ReturnType<typeof createRuntime>> | undefined;

function stringEnvironment(
  env: CloudflareEnv,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => {
      return typeof entry[1] === "string";
    }),
  );
}

function withoutTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function runtimeOptions(
  env: Readonly<Record<string, string | undefined>>,
): RuntimeOptions {
  return {
    env,
    ipAddress: (request) =>
      request.headers.get("CF-Connecting-IP") ?? undefined,
    providerFailure: (category) => {
      console.warn(
        JSON.stringify({
          event: "portfolio_chat_upstream_failure",
          category,
        }),
      );
    },
  };
}

async function initializeRuntime(
  env: CloudflareEnv,
): Promise<ReturnType<typeof createRuntime>> {
  const values = stringEnvironment(env);
  try {
    const gateway = env.AI?.gateway("default");
    if (!gateway) throw new Error("AI binding unavailable");
    const baseUrl = withoutTrailingSlash(await gateway.getUrl("deepseek"));
    return createRuntime(
      runtimeOptions({ ...values, DEEPSEEK_BASE_URL: baseUrl }),
    );
  } catch {
    console.warn(
      JSON.stringify({
        event: "portfolio_chat_configuration_failure",
        category: "ai_binding",
      }),
    );
    return createRuntime(
      runtimeOptions({ ...values, CHAT_ENABLED: "false" }),
    );
  }
}

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

  runtimePromise ??= initializeRuntime(context.env);
  const runtime = await runtimePromise;
  return runtime.handle(context.request);
}
