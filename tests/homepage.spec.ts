import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

interface CanvasSignature {
  alphaCoverage: number;
  hash: number;
  height: number;
  nonTransparentBBox: {
    heightRatio: number;
    widthRatio: number;
  };
  nonTransparentSamples: number;
  sampledCount: number;
  width: number;
}

const canvasCompleteness = {
  minAlphaCoverage: 0.02,
  minBBoxHeightRatio: 0.5,
  minBBoxWidthRatio: 0.25,
  minNonTransparentSamples: 200,
  minSampledCount: 5_000,
} as const;

const browserErrors = new WeakMap<Page, string[]>();

async function canvasSignature(
  page: Page,
  selector = ".portrait-canvas",
): Promise<CanvasSignature> {
  return page.locator(selector).evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Portrait canvas has no 2D context.");

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const targetSampleCount = 20_000;
    const aspectRatio = canvas.width / Math.max(1, canvas.height);
    const columns = Math.min(
      canvas.width,
      Math.max(1, Math.round(Math.sqrt(targetSampleCount * aspectRatio))),
    );
    const rows = Math.min(
      canvas.height,
      Math.max(1, Math.round(targetSampleCount / columns)),
    );
    let hash = 2_166_136_261;
    let nonTransparentSamples = 0;
    let minX = canvas.width;
    let maxX = -1;
    let minY = canvas.height;
    let maxY = -1;

    for (let row = 0; row < rows; row += 1) {
      const y = Math.min(
        canvas.height - 1,
        Math.floor(((row + 0.5) * canvas.height) / rows),
      );
      for (let column = 0; column < columns; column += 1) {
        const x = Math.min(
          canvas.width - 1,
          Math.floor(((column + 0.5) * canvas.width) / columns),
        );
        const offset = (y * canvas.width + x) * 4;
        const red = pixels[offset] ?? 0;
        const green = pixels[offset + 1] ?? 0;
        const blue = pixels[offset + 2] ?? 0;
        const alpha = pixels[offset + 3] ?? 0;
        if (alpha > 0) {
          nonTransparentSamples += 1;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
        hash = Math.imul(hash ^ red, 16_777_619);
        hash = Math.imul(hash ^ green, 16_777_619);
        hash = Math.imul(hash ^ blue, 16_777_619);
        hash = Math.imul(hash ^ alpha, 16_777_619);
      }
    }

    const sampledCount = columns * rows;
    return {
      alphaCoverage: nonTransparentSamples / sampledCount,
      hash: hash >>> 0,
      height: canvas.height,
      nonTransparentBBox: {
        heightRatio: maxY >= minY ? (maxY - minY + 1) / canvas.height : 0,
        widthRatio: maxX >= minX ? (maxX - minX + 1) / canvas.width : 0,
      },
      nonTransparentSamples,
      sampledCount,
      width: canvas.width,
    };
  });
}

function isCompleteCanvas(signature: CanvasSignature): boolean {
  return (
    signature.sampledCount >= canvasCompleteness.minSampledCount &&
    signature.nonTransparentSamples >= canvasCompleteness.minNonTransparentSamples &&
    signature.alphaCoverage >= canvasCompleteness.minAlphaCoverage &&
    signature.nonTransparentBBox.widthRatio >=
      canvasCompleteness.minBBoxWidthRatio &&
    signature.nonTransparentBBox.heightRatio >=
      canvasCompleteness.minBBoxHeightRatio
  );
}

function expectCompleteCanvas(signature: CanvasSignature): void {
  expect(signature.sampledCount).toBeGreaterThanOrEqual(
    canvasCompleteness.minSampledCount,
  );
  expect(signature.nonTransparentSamples).toBeGreaterThanOrEqual(
    canvasCompleteness.minNonTransparentSamples,
  );
  expect(signature.alphaCoverage).toBeGreaterThanOrEqual(
    canvasCompleteness.minAlphaCoverage,
  );
  expect(signature.nonTransparentBBox.widthRatio).toBeGreaterThanOrEqual(
    canvasCompleteness.minBBoxWidthRatio,
  );
  expect(signature.nonTransparentBBox.heightRatio).toBeGreaterThanOrEqual(
    canvasCompleteness.minBBoxHeightRatio,
  );
}

async function waitForCompleteCanvas(
  page: Page,
  selector = ".portrait-canvas",
  timeout = 10_000,
): Promise<CanvasSignature> {
  let latestSignature: CanvasSignature | undefined;
  try {
    await expect
      .poll(
        async () => {
          latestSignature = await canvasSignature(page, selector);
          return isCompleteCanvas(latestSignature);
        },
        {
          message: "portrait canvas should contain a complete rendered portrait",
          timeout,
        },
      )
      .toBe(true);
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\nLatest canvas signature: ${JSON.stringify(latestSignature)}`,
    );
  }

  const signature = await canvasSignature(page, selector);
  expectCompleteCanvas(signature);
  return signature;
}

async function expectCriticalLayoutInsideViewport(page: Page): Promise<void> {
  const layout = await page.evaluate(() => {
    const bounds = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      };
    };

    return {
      bodyScrollWidth: document.body.scrollWidth,
      canvas: bounds(".portrait-canvas"),
      documentScrollWidth: document.documentElement.scrollWidth,
      headline: bounds(".headline-wrap"),
      identity: bounds(".identity"),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });

  expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.bodyScrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);

  for (const [name, rect] of [
    ["identity", layout.identity],
    ["headline", layout.headline],
  ] as const) {
    expect(rect.width, `${name} should have width`).toBeGreaterThan(0);
    expect(rect.height, `${name} should have height`).toBeGreaterThan(0);
    expect(rect.left, `${name} should not leave the left edge`).toBeGreaterThanOrEqual(-1);
    expect(rect.right, `${name} should not leave the right edge`).toBeLessThanOrEqual(
      layout.viewportWidth + 1,
    );
    expect(rect.top, `${name} should not leave the top edge`).toBeGreaterThanOrEqual(-1);
    expect(rect.bottom, `${name} should not leave the bottom edge`).toBeLessThanOrEqual(
      layout.viewportHeight + 1,
    );
  }

  const visibleCanvasWidth =
    Math.min(layout.canvas.right, layout.viewportWidth) - Math.max(layout.canvas.left, 0);
  const visibleCanvasHeight =
    Math.min(layout.canvas.bottom, layout.viewportHeight) - Math.max(layout.canvas.top, 0);
  expect(visibleCanvasWidth).toBeGreaterThan(layout.viewportWidth * 0.5);
  expect(visibleCanvasHeight).toBeGreaterThan(layout.viewportHeight * 0.55);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.push(`response: ${response.status()} ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    errors.push(
      `requestfailed: ${request.failure()?.errorText ?? "unknown error"} ${request.url()}`,
    );
  });
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? [], "browser errors").toEqual([]);
});

test("renders a responsive, complete portrait and becomes still", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  const faviconResponse = await page.request.get("/favicon.svg");
  expect(faviconResponse.status()).toBe(200);
  expect(faviconResponse.headers()["content-type"]).toContain("image/svg+xml");

  await page.evaluate(() => {
    const probe = document.createElement("canvas");
    probe.id = "single-pixel-probe";
    probe.width = 200;
    probe.height = 200;
    const context = probe.getContext("2d");
    if (!context) throw new Error("Probe canvas has no 2D context.");
    context.fillRect(0, 0, 1, 1);
    document.body.append(probe);
  });
  await expect(
    waitForCompleteCanvas(page, "#single-pixel-probe", 500),
    "one opaque pixel must not count as a complete portrait",
  ).rejects.toThrow();
  await page.locator("#single-pixel-probe").evaluate((probe) => probe.remove());

  await expect(page.getByText("赵实旷.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Crafting Future Through Objects & Systems\./i })).toBeVisible();
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(page.locator("nav a")).toHaveCount(0);
  await expect(page.locator("nav [aria-disabled='true']")).toHaveCount(3);
  await expect(page.locator(".portrait-base")).toBeVisible();
  await expect(page.locator(".portrait-canvas")).toBeVisible();

  await waitForCompleteCanvas(page);
  await page.waitForTimeout(2_400);
  const settled = await canvasSignature(page);
  await page.waitForTimeout(350);
  const later = await canvasSignature(page);

  expectCompleteCanvas(settled);
  expect(later).toEqual(settled);
  await expectCriticalLayoutInsideViewport(page);
  await testInfo.attach(`canvas-metrics-${testInfo.project.name}`, {
    body: JSON.stringify(settled, null, 2),
    contentType: "application/json",
  });
  if (process.env.REPORT_CANVAS_METRICS === "1") {
    console.log(
      `[canvas-metrics] ${testInfo.project.name} ${JSON.stringify(settled)}`,
    );
  }

  const artifactNames: Record<string, string> = {
    "desktop-1440": "desktop-1440-final.png",
    "desktop-1920": "desktop-1920-final.png",
    "mobile-390": "mobile-390-final.png",
    "mobile-430": "mobile-430-final.png",
  };
  const artifactName = artifactNames[testInfo.project.name];
  const requiredArtifactProjects = new Set([
    "desktop-1440",
    "desktop-1920",
    "mobile-390",
    "mobile-430",
  ]);
  if (requiredArtifactProjects.has(testInfo.project.name)) {
    expect(
      artifactName,
      `${testInfo.project.name} should have a visual-QA screenshot name`,
    ).toBeDefined();
  }
  if (artifactName) {
    const isolatedScreenshot = testInfo.outputPath(artifactName);
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: isolatedScreenshot,
    });
    await testInfo.attach(`visual-qa-${testInfo.project.name}`, {
      contentType: "image/png",
      path: isolatedScreenshot,
    });
    await copyFile(
      isolatedScreenshot,
      join("output", "playwright", artifactName),
    );
  }
});

test("reduced motion draws the settled state directly", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const first = await waitForCompleteCanvas(page);
  await page.waitForTimeout(350);
  const later = await canvasSignature(page);

  expectCompleteCanvas(first);
  expect(later).toEqual(first);
});

test("resize redraws a settled portrait without replaying the scatter", async ({
  page,
}) => {
  await page.goto("/");
  await waitForCompleteCanvas(page);
  await page.waitForTimeout(2_400);

  const before = await canvasSignature(page);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Project must define a viewport.");
  await page.setViewportSize({
    height: Math.max(320, viewport.height - 17),
    width: Math.max(320, viewport.width - 13),
  });

  await page.waitForTimeout(180);
  const redrawn = await waitForCompleteCanvas(page);
  await page.waitForTimeout(350);
  const later = await canvasSignature(page);

  expect({ height: redrawn.height, width: redrawn.width }).not.toEqual({
    height: before.height,
    width: before.width,
  });
  expectCompleteCanvas(redrawn);
  expect(later).toEqual(redrawn);
  await expectCriticalLayoutInsideViewport(page);
});
