import { describe, expect, test } from "vitest";

import { resolveChatEndpoint } from "./chat-endpoint";

describe("resolveChatEndpoint", () => {
  test.each([undefined, "", "   "])("falls back for %j", (value) => {
    expect(resolveChatEndpoint(value)).toBe("/api/chat");
  });

  test("accepts the exact Guangzhou Function URL shape", () => {
    expect(
      resolveChatEndpoint(
        "https://1234567890-abcd1234.ap-guangzhou.tencentscf.com/chat",
      ),
    ).toBe(
      "https://1234567890-abcd1234.ap-guangzhou.tencentscf.com/chat",
    );
  });

  test.each([
    "http://1234567890-abcd1234.ap-guangzhou.tencentscf.com/chat",
    "https://1234567890-abcd1234.ap-shanghai.tencentscf.com/chat",
    "https://evil.ap-guangzhou.tencentscf.com/chat",
    "https://1234567890-abcd1234.ap-guangzhou.tencentscf.com/",
    "https://1234567890-abcd1234.ap-guangzhou.tencentscf.com/chat/",
    "https://1234567890-abcd1234.ap-guangzhou.tencentscf.com/chat?q=1",
    "https://user@1234567890-abcd1234.ap-guangzhou.tencentscf.com/chat",
  ])("falls back for invalid endpoint %s", (value) => {
    expect(resolveChatEndpoint(value)).toBe("/api/chat");
  });
});

