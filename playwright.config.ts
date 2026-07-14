import { defineConfig, devices } from "@playwright/test";

const port = 4173;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "line",
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port}`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "desktop-1440",
      use: { viewport: { width: 1_440, height: 900 } },
    },
    {
      name: "desktop-1920",
      use: { viewport: { width: 1_920, height: 1_080 } },
    },
    {
      name: "mobile-390",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "mobile-430",
      use: {
        ...devices["iPhone 14 Pro Max"],
        browserName: "chromium",
        viewport: { width: 430, height: 932 },
      },
    },
    {
      name: "mobile-320",
      use: {
        hasTouch: true,
        isMobile: true,
        viewport: { width: 320, height: 568 },
      },
    },
    {
      name: "mobile-landscape-667",
      use: {
        hasTouch: true,
        isMobile: true,
        viewport: { width: 667, height: 375 },
      },
    },
  ],
});
