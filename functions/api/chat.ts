import {
  createRuntime,
  type RuntimeOptions,
} from "../../src/chat/server/runtime.js";
import { TENCENT_TOKENHUB_BASE_URL } from "../../src/chat/server/deepseek-provider.js";

type CloudflareEnv = Readonly<Record<string, unknown>>;

interface PagesContext {
  readonly request: Request;
  readonly env: CloudflareEnv;
}

const TENCENT_TOKENHUB_MODEL = "deepseek-v4-flash-202605";
const PROVIDER_ENVIRONMENT_NAMES = new Set([
  "TENCENT_TOKENHUB_API_KEY",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
  "CLOUDFLARE_AI_GATEWAY_TOKEN",
]);

let runtime: ReturnType<typeof createRuntime> | undefined;

function stringEnvironment(
  env: CloudflareEnv,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => {
      return typeof entry[1] === "string";
    }),
  );
}

function sharedEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => !PROVIDER_ENVIRONMENT_NAMES.has(name)),
  );
}

function isTokenHubKey(value: string | undefined): value is string {
  return (
    value !== undefined &&
    value.length > 0 &&
    value.length <= 4_096 &&
    /^[\x21-\x7e]+$/.test(value)
  );
}

function runtimeOptions(
  env: Readonly<Record<string, string | undefined>>,
): RuntimeOptions {
  return {
    env,
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

function initializeRuntime(env: CloudflareEnv): ReturnType<typeof createRuntime> {
  const values = stringEnvironment(env);
  const shared = sharedEnvironment(values);
  const tokenHubKey = values.TENCENT_TOKENHUB_API_KEY;
  if (!isTokenHubKey(tokenHubKey)) {
    console.warn(
      JSON.stringify({
        event: "portfolio_chat_configuration_failure",
        category: "tokenhub_key",
      }),
    );
    return createRuntime(runtimeOptions({ ...shared, CHAT_ENABLED: "false" }));
  }

  return createRuntime(
    runtimeOptions({
      ...shared,
      DEEPSEEK_API_KEY: tokenHubKey,
      DEEPSEEK_BASE_URL: TENCENT_TOKENHUB_BASE_URL,
      DEEPSEEK_MODEL: TENCENT_TOKENHUB_MODEL,
    }),
  );
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

  runtime ??= initializeRuntime(context.env);
  return runtime.handle(context.request);
}
