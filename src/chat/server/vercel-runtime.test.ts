// @vitest-environment node

import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRuntime: vi.fn((options: unknown) => ({
    enabled: true,
    handle: vi.fn(),
    options,
  })),
  ipAddress: vi.fn(() => "203.0.113.8"),
}));

vi.mock("./runtime.js", () => ({ createRuntime: mocks.createRuntime }));
vi.mock("@vercel/functions/headers", () => ({ ipAddress: mocks.ipAddress }));

describe("createVercelRuntime", () => {
  test("passes process environment and Vercel IP extraction to the shared runtime", async () => {
    const { createVercelRuntime } = await import("./vercel-runtime");
    const runtime = createVercelRuntime();
    const options = mocks.createRuntime.mock.calls[0]?.[0] as {
      env: NodeJS.ProcessEnv;
      ipAddress(request: Request): string | undefined;
    };
    const request = new Request("https://portfolio.test/api/chat");

    expect(runtime.enabled).toBe(true);
    expect(options.env).toBe(process.env);
    expect(options.ipAddress(request)).toBe("203.0.113.8");
    expect(mocks.ipAddress).toHaveBeenCalledWith(request);
  });
});
