export function parseAllowedOrigins(
  value: string | undefined,
): readonly string[] | undefined {
  if (!value) return undefined;
  const origins = value.split(",").map((item) => item.trim());
  if (
    origins.length === 0 ||
    origins.some((item) => item.length === 0)
  ) {
    return undefined;
  }

  const parsed: string[] = [];
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (
        url.protocol !== "https:" ||
        url.origin !== origin ||
        url.username !== "" ||
        url.password !== "" ||
        origin.includes("*")
      ) {
        return undefined;
      }
      parsed.push(origin);
    } catch {
      return undefined;
    }
  }
  return [...new Set(parsed)];
}
