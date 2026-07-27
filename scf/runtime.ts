import {
  TENCENT_TOKENHUB_BASE_URL,
} from "../src/chat/server/deepseek-provider.js";
import {
  createRuntime,
  type ChatRuntime,
} from "../src/chat/server/runtime.js";
import {
  parseAllowedOrigins,
  scfRemoteAddress,
} from "./security.js";

const TENCENT_TOKENHUB_MODEL = "deepseek-v4-flash-202605";
const PROVIDER_ENVIRONMENT_NAMES = new Set([
  "TENCENT_TOKENHUB_API_KEY",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
  "CLOUDFLARE_AI_GATEWAY_TOKEN",
  "CHAT_ALLOWED_ORIGINS",
]);

export interface ScfRuntime {
  readonly chat: ChatRuntime;
  readonly allowedOrigins: readonly string[];
}

function isTokenHubKey(value: string | undefined): value is string {
  return (
    value !== undefined &&
    value.length > 0 &&
    value.length <= 4_096 &&
    /^[\x21-\x7e]+$/u.test(value)
  );
}

export function createScfRuntime(
  source: NodeJS.ProcessEnv = process.env,
): ScfRuntime {
  const values = Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string",
    ),
  );
  const tokenHubKey = values.TENCENT_TOKENHUB_API_KEY;
  const allowedOrigins = parseAllowedOrigins(
    values.CHAT_ALLOWED_ORIGINS,
  );
  const shared = Object.fromEntries(
    Object.entries(values).filter(
      ([name]) => !PROVIDER_ENVIRONMENT_NAMES.has(name),
    ),
  );
  const validKey = isTokenHubKey(tokenHubKey);

  if (!validKey || !allowedOrigins) {
    console.warn(JSON.stringify({
      event: "portfolio_chat_configuration_failure",
      category: validKey ? "allowed_origins" : "tokenhub_key",
    }));
    return {
      chat: createRuntime({
        env: { ...shared, CHAT_ENABLED: "false" },
      }),
      allowedOrigins: allowedOrigins ?? [],
    };
  }

  return {
    chat: createRuntime({
      env: {
        ...shared,
        DEEPSEEK_API_KEY: tokenHubKey,
        DEEPSEEK_BASE_URL: TENCENT_TOKENHUB_BASE_URL,
        DEEPSEEK_MODEL: TENCENT_TOKENHUB_MODEL,
      },
      allowedOrigins,
      ipAddress: (request) =>
        scfRemoteAddress(request.headers),
      providerFailure: (category) => {
        console.warn(JSON.stringify({
          event: "portfolio_chat_upstream_failure",
          category,
        }));
      },
    }),
    allowedOrigins,
  };
}
