import { expect, test, type Page } from "@playwright/test";

interface CanvasSignature {
  dataUrlLength: number;
  hash: number;
  height: number;
  nonTransparentSamples: number;
  width: number;
}

const browserErrors = new WeakMap<Page, string[]>();

async function canvasSignature(page: Page): Promise<CanvasSignature> {
  return page.locator(".portrait-canvas").evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Portrait canvas has no 2D context.");

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const pixelCount = canvas.width * canvas.height;
    const sampleStep = Math.max(1, Math.floor(pixelCount / 20_000));
    let hash = 2_166_136_261;
    let nonTransparentSamples = 0;

    for (let pixel = 0; pixel < pixelCount; pixel += sampleStep) {
      const offset = pixel * 4;
      const red = pixels[offset] ?? 0;
      const green = pixels[offset + 1] ?? 0;
      const blue = pixels[offset + 2] ?? 0;
      const alpha = pixels[offset + 3] ?? 0;
      if (alpha > 0) nonTransparentSamples += 1;
      hash = Math.imul(hash ^ red, 16_777_619);
      hash = Math.imul(hash ^ green, 16_777_619);
      hash = Math.imul(hash ^ blue, 16_777_619);
      hash = Math.imul(hash ^ alpha, 16_777_619);
    }

    return {
      dataUrlLength: canvas.toDataURL("image/png").length,
      hash: hash >>> 0,
      height: canvas.height,
      nonTransparentSamples,
      width: canvas.width,
    };
  });
}

async function waitForNonEmptyCanvas(page: Page): Promise<CanvasSignature> {
  await expect
    .poll(async () => (await canvasSignature(page)).nonTransparentSamples, {
      message: "portrait canvas should contain rendered pixels",
      timeout: 10_000,
    })
    .toBeGreaterThan(0);

  return canvasSignature(page);
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
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? [], "browser errors").toEqual([]);
});

test("renders a responsive, complete portrait and becomes still", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  await expect(page.getByText("赵实旷.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Crafting Future Through Objects & Systems\./i })).toBeVisible();
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(page.locator("nav a")).toHaveCount(0);
  await expect(page.locator("nav [aria-disabled='true']")).toHaveCount(3);
  await expect(page.locator(".portrait-base")).toBeVisible();
  await expect(page.locator(".portrait-canvas")).toBeVisible();

  await waitForNonEmptyCanvas(page);
  await page.waitForTimeout(2_400);
  const settled = await canvasSignature(page);
  await page.waitForTimeout(350);
  const later = await canvasSignature(page);

  expect(settled.nonTransparentSamples).toBeGreaterThan(0);
  expect(settled.dataUrlLength).toBeGreaterThan(1_000);
  expect(later).toEqual(settled);
  await expectCriticalLayoutInsideViewport(page);

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
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: `output/playwright/${artifactName}`,
    });
  }
});

test("reduced motion draws the settled state directly", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const first = await waitForNonEmptyCanvas(page);
  await page.waitForTimeout(350);
  const later = await canvasSignature(page);

  expect(first.nonTransparentSamples).toBeGreaterThan(0);
  expect(first.dataUrlLength).toBeGreaterThan(1_000);
  expect(later).toEqual(first);
});

test("resize redraws a settled portrait without replaying the scatter", async ({
  page,
}) => {
  await page.goto("/");
  await waitForNonEmptyCanvas(page);
  await page.waitForTimeout(2_400);

  const before = await canvasSignature(page);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Project must define a viewport.");
  await page.setViewportSize({
    height: Math.max(320, viewport.height - 17),
    width: Math.max(320, viewport.width - 13),
  });

  await page.waitForTimeout(180);
  const redrawn = await waitForNonEmptyCanvas(page);
  await page.waitForTimeout(350);
  const later = await canvasSignature(page);

  expect({ height: redrawn.height, width: redrawn.width }).not.toEqual({
    height: before.height,
    width: before.width,
  });
  expect(redrawn.nonTransparentSamples).toBeGreaterThan(0);
  expect(later).toEqual(redrawn);
  await expectCriticalLayoutInsideViewport(page);
});
