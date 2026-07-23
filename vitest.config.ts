import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: [
      "src/**/*.test.ts",
      "functions/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    restoreMocks: true,
  },
});
