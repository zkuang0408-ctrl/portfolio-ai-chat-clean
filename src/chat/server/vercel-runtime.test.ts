// @vitest-environment node

import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRuntime: vi.fn((options: unknown) => ({
    enabled: true,
    handle: vi.fn(),
    options,
  })),
}));

vi.mock("./runtime.js", () => ({ createRuntime: mocks.createRuntime }));

describe("createVercelRuntime", () => {
  test("passes only process environment to the shared runtime", async () => {
    const { createVercelRuntime } = await import("./vercel-runtime");
    const runtime = createVercelRuntime();

    expect(runtime.enabled).toBe(true);
    expect(mocks.createRuntime).toHaveBeenCalledWith({
      env: process.env,
    });
  });
});
