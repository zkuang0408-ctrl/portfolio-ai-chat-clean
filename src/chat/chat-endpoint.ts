const FALLBACK_CHAT_ENDPOINT = "/api/chat";
const FUNCTION_HOST =
  /^\d+-[a-z0-9]+\.ap-guangzhou\.tencentscf\.com$/u;

export function resolveChatEndpoint(value: string | undefined): string {
  const candidate = value?.trim();
  if (!candidate) return FALLBACK_CHAT_ENDPOINT;

  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "https:" ||
      !FUNCTION_HOST.test(url.hostname) ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/chat" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return FALLBACK_CHAT_ENDPOINT;
    }
    return url.href;
  } catch {
    return FALLBACK_CHAT_ENDPOINT;
  }
}
