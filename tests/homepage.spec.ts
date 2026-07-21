import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

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
const expectedRequestFailures = new WeakMap<Page, Map<string, number>>();
const expectedConsoleErrors = new WeakMap<Page, Map<string, number>>();

const projectPdfFiles = [
  "inkseat.pdf",
  "emovue.pdf",
  "fruit-evolution.pdf",
  "atempo.pdf",
  "urosense.pdf",
  "first-fly.pdf",
] as const;

const projectPdfUrls = projectPdfFiles.map(
  (filename) => `/projects/pdfs/${filename}`,
);

function projectPdfFilename(url: string): string | null {
  const { pathname } = new URL(url);
  if (!pathname.startsWith("/projects/pdfs/") || !pathname.endsWith(".pdf")) {
    return null;
  }
  return pathname.slice(pathname.lastIndexOf("/") + 1);
}

function trackProjectPdfRequests(page: Page): string[] {
  const requestedFiles: string[] = [];
  page.on("request", (request) => {
    const filename = projectPdfFilename(request.url());
    if (filename) requestedFiles.push(filename);
  });
  return requestedFiles;
}

function uniqueRequestedFiles(requestedFiles: readonly string[]): string[] {
  return [...new Set(requestedFiles)];
}

function expectOneFailedRequest(page: Page, pathname: string): void {
  const failures = expectedRequestFailures.get(page);
  if (!failures) throw new Error("Browser error guards are not installed.");
  failures.set(pathname, (failures.get(pathname) ?? 0) + 1);
}

function expectOneConsoleError(page: Page, text: string): void {
  const errors = expectedConsoleErrors.get(page);
  if (!errors) throw new Error("Browser error guards are not installed.");
  errors.set(text, (errors.get(text) ?? 0) + 1);
}

function consumeExpectedConsoleError(page: Page, text: string): boolean {
  const errors = expectedConsoleErrors.get(page);
  if (!errors) return false;
  const remaining = errors.get(text) ?? 0;
  if (remaining === 0) return false;
  errors.set(text, remaining - 1);
  return true;
}

function consumeExpectedFailedRequest(page: Page, requestUrl: string): boolean {
  const failures = expectedRequestFailures.get(page);
  if (!failures) return false;
  const pathname = new URL(requestUrl).pathname;
  const remaining = failures.get(pathname) ?? 0;
  if (remaining === 0) return false;
  failures.set(pathname, remaining - 1);
  return true;
}

async function waitForReaderReady(
  reader: Locator,
  timeout = 30_000,
): Promise<void> {
  await expect(reader).toHaveAttribute("data-reader-state", "ready", {
    timeout,
  });
}

async function loadAllFirstPagesSequentially(page: Page): Promise<void> {
  const readers = page.locator("[data-project-reader]");
  await expect(readers).toHaveCount(6);
  for (let index = 0; index < 6; index += 1) {
    const reader = readers.nth(index);
    await reader.scrollIntoViewIfNeeded();
    await waitForReaderReady(reader);
    await expect(reader.locator("[data-current-page]")).toHaveText("01");
  }
}

async function waitForBrowserLayout(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function dispatchReaderPointerGesture(
  reader: Locator,
  input: {
    endX: number;
    endY: number;
    pointerId: number;
    pointerType: "touch" | "pen";
    startX: number;
    startY: number;
  },
): Promise<{ downPrevented: boolean; upPrevented: boolean }> {
  return reader.evaluate((element, gesture) => {
    const down = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: gesture.startX,
      clientY: gesture.startY,
      isPrimary: true,
      pointerId: gesture.pointerId,
      pointerType: gesture.pointerType,
    });
    element.dispatchEvent(down);
    const up = new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      clientX: gesture.endX,
      clientY: gesture.endY,
      isPrimary: true,
      pointerId: gesture.pointerId,
      pointerType: gesture.pointerType,
    });
    element.dispatchEvent(up);
    return {
      downPrevented: down.defaultPrevented,
      upPrevented: up.defaultPrevented,
    };
  }, input);
}

async function dispatchTrustedTouchGesture(
  page: Page,
  input: {
    endX: number;
    endY: number;
    startX: number;
    startY: number;
  },
): Promise<void> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: input.startX, y: input.startY }],
    });
    for (let step = 1; step <= 6; step += 1) {
      const progress = step / 6;
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: input.startX + (input.endX - input.startX) * progress,
            y: input.startY + (input.endY - input.startY) * progress,
          },
        ],
      });
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}

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
  expectedRequestFailures.set(page, new Map());
  expectedConsoleErrors.set(page, new Map());
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !consumeExpectedConsoleError(page, message.text())
    ) {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.push(`response: ${response.status()} ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    if (consumeExpectedFailedRequest(page, request.url())) return;
    errors.push(
      `requestfailed: ${request.failure()?.errorText ?? "unknown error"} ${request.url()}`,
    );
  });
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? [], "browser errors").toEqual([]);
  const unobservedExpectedFailures = [
    ...(expectedRequestFailures.get(page)?.entries() ?? []),
  ].filter(([, remaining]) => remaining > 0);
  expect(
    unobservedExpectedFailures,
    "every narrowly exempted request failure should occur",
  ).toEqual([]);
  const unobservedExpectedConsoleErrors = [
    ...(expectedConsoleErrors.get(page)?.entries() ?? []),
  ].filter(([, remaining]) => remaining > 0);
  expect(
    unobservedExpectedConsoleErrors,
    "every narrowly exempted console error should occur",
  ).toEqual([]);
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
  await expect(page.locator("nav a")).toHaveCount(3);
  await expect(page.locator("nav [aria-disabled='true']")).toHaveCount(0);
  await expect(page.locator(".portrait-base")).toHaveCSS("opacity", "0");
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
    await loadAllFirstPagesSequentially(page);
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

test("publishes selected work, stable documents, and privacy-safe contact details", async ({
  page,
}) => {
  await page.goto("/");

  const navigation = page.getByRole("navigation", { name: "主要栏目" });
  const links = navigation.getByRole("link");
  await expect(links).toHaveCount(3);
  await expect(links.nth(0)).toHaveAttribute("href", "#about");
  await expect(links.nth(1)).toHaveAttribute("href", "#projects");
  await expect(links.nth(2)).toHaveAttribute("href", "#contact");

  for (const target of ["about", "projects", "contact"]) {
    await navigation.getByRole("link", { name: new RegExp(target, "i") }).click();
    await expect(page.locator(`#${target}`)).toBeInViewport();
  }

  const projectCards = page.locator("#projects .project-card");
  await expect(projectCards).toHaveCount(6);
  const readers = page.locator("[data-project-reader]");
  await expect(readers).toHaveCount(6);
  await expect(page.locator("[data-total-pages]")).toHaveText([
    "18",
    "19",
    "25",
    "20",
    "25",
    "28",
  ]);
  expect(
    await readers.evaluateAll((elements) =>
      elements.map((element) => ({
        projectTitle: (element as HTMLElement).dataset.projectTitle,
        url: (element as HTMLElement).dataset.pdfUrl,
      })),
    ),
  ).toEqual([
    { projectTitle: "INKSeat", url: projectPdfUrls[0] },
    { projectTitle: "EMOVUE", url: projectPdfUrls[1] },
    { projectTitle: "Fruit & Evolution", url: projectPdfUrls[2] },
    { projectTitle: "Atempo / Breath Mirror", url: projectPdfUrls[3] },
    { projectTitle: "UroSense", url: projectPdfUrls[4] },
    { projectTitle: "First Fly", url: projectPdfUrls[5] },
  ]);

  for (const documentUrl of [
    "/documents/zhao-shikuang-portfolio.pdf",
    "/documents/zhao-shikuang-portfolio.pptx",
  ]) {
    const response = await page.request.get(documentUrl);
    expect(response.status(), documentUrl).toBe(200);
  }

  await expect(
    page.locator('a[href="mailto:zkuang0408@gmail.com"]'),
  ).toBeVisible();
  const publicText = await page.locator("body").innerText();
  expect(publicText).toContain("zkuang0408@gmail.com");

  const stage = page.locator(".portrait-stage");
  const base = page.locator(".portrait-base");
  await expect(base).toHaveCSS("opacity", "0");
  for (const state of ["portrait-stage--fallback", "portrait-stage--error"]) {
    await stage.evaluate((element, className) => element.classList.add(className), state);
    await expect(base).toHaveCSS("opacity", "0");
    await stage.evaluate((element, className) => element.classList.remove(className), state);
  }

  const widths = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
});

test.describe("canonical desktop PDF reader behavior", () => {
  test.skip(
    ({ viewport }) => viewport?.width !== 1_440,
    "Canonical desktop project owns the lazy-network proof.",
  );

  test("loads only the approached project PDF", async ({ page }) => {
    const requestedFiles = trackProjectPdfRequests(page);
    await page.goto("/");
    await waitForCompleteCanvas(page);

    const firstReader = page.locator(
      '[data-project-reader][data-pdf-url="/projects/pdfs/inkseat.pdf"]',
    );
    await page.evaluate(() => {
      const reader = document.querySelector<HTMLElement>(
        '[data-project-reader][data-pdf-url="/projects/pdfs/inkseat.pdf"]',
      );
      if (!reader) throw new Error("Missing INKSeat reader.");
      const readerTop = reader.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        behavior: "instant",
        top: Math.max(0, readerTop - window.innerHeight - 700),
      });
    });
    await waitForBrowserLayout(page);
    await expect(page.locator("#about")).toBeInViewport();
    const initialDistance = await firstReader.evaluate(
      (element) => element.getBoundingClientRect().top - window.innerHeight,
    );
    expect(initialDistance).toBeGreaterThan(600);
    expect(uniqueRequestedFiles(requestedFiles)).toEqual([]);

    await firstReader.evaluate((element) => {
      const readerTop = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        behavior: "instant",
        top: Math.max(0, readerTop - window.innerHeight - 550),
      });
    });
    await waitForReaderReady(firstReader);

    expect(uniqueRequestedFiles(requestedFiles)).toEqual(["inkseat.pdf"]);
  });

  test("navigates INKSeat without wrapping at either boundary", async ({
    page,
  }) => {
    await page.goto("/");
    const reader = page.locator(
      '[data-project-reader][data-pdf-url="/projects/pdfs/inkseat.pdf"]',
    );
    await reader.scrollIntoViewIfNeeded();
    await waitForReaderReady(reader);

    const currentPage = reader.locator("[data-current-page]");
    const totalPages = reader.locator("[data-total-pages]");
    const previous = reader.getByRole("button", {
      name: "Previous page of INKSeat",
    });
    const next = reader.getByRole("button", {
      name: "Next page of INKSeat",
    });
    await expect(currentPage).toHaveText("01");
    await expect(totalPages).toHaveText("18");
    await expect(previous).toBeDisabled();
    await previous.evaluate((button: HTMLButtonElement) => button.click());
    await expect(currentPage).toHaveText("01");

    await next.click();
    await expect(currentPage).toHaveText("02", { timeout: 30_000 });
    await next.focus();
    await page.keyboard.press("ArrowRight");
    await expect(currentPage).toHaveText("03", { timeout: 30_000 });
    await reader.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(currentPage).toHaveText("02", { timeout: 30_000 });

    for (let pageNumber = 3; pageNumber <= 18; pageNumber += 1) {
      await next.click();
      await expect(currentPage).toHaveText(
        String(pageNumber).padStart(2, "0"),
        { timeout: 30_000 },
      );
    }
    await expect(next).toBeDisabled();
    await next.evaluate((button: HTMLButtonElement) => button.click());
    await expect(currentPage).toHaveText("18");
  });

  test("isolates one failed PDF while another reader stays usable", async ({
    page,
  }) => {
    const failedPath = "/projects/pdfs/emovue.pdf";
    expectOneFailedRequest(page, failedPath);
    expectOneConsoleError(page, "Failed to load resource: net::ERR_FAILED");
    let abortedRequests = 0;
    await page.route(`**${failedPath}`, async (route) => {
      if (abortedRequests === 0) {
        abortedRequests += 1;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.goto("/");
    const failedReader = page.locator(
      `[data-project-reader][data-pdf-url="${failedPath}"]`,
    );
    await failedReader.scrollIntoViewIfNeeded();
    await expect(failedReader).toHaveAttribute("data-reader-state", "error", {
      timeout: 30_000,
    });
    const errorRegion = failedReader.locator("[data-reader-error]");
    await expect(errorRegion).toBeVisible();
    await expect(errorRegion).toContainText("Unable to load this project.");
    await expect(
      errorRegion.getByRole("button", { name: "Retry" }),
    ).toBeVisible();
    const originalPdf = errorRegion.getByRole("link", {
      name: "Open original PDF",
    });
    await expect(originalPdf).toBeVisible();
    await expect(originalPdf).toHaveAttribute("href", failedPath);
    await expect(originalPdf).toHaveAttribute("target", "_blank");
    expect(abortedRequests).toBe(1);

    const healthyReader = page.locator(
      '[data-project-reader][data-pdf-url="/projects/pdfs/inkseat.pdf"]',
    );
    await healthyReader.scrollIntoViewIfNeeded();
    await waitForReaderReady(healthyReader);
    await expect(healthyReader.locator("[data-current-page]")).toHaveText("01");
  });
});

test.describe("canonical mobile PDF reader behavior", () => {
  test.skip(
    ({ viewport }) => viewport?.width !== 390,
    "Canonical 390px mobile project owns pointer-gesture coverage.",
  );

  test("uses trusted horizontal touch and synthetic pen navigation while preserving native vertical scroll", async ({
    page,
  }) => {
    await page.goto("/");
    const reader = page.locator(
      '[data-project-reader][data-pdf-url="/projects/pdfs/inkseat.pdf"]',
    );
    await reader.scrollIntoViewIfNeeded();
    await waitForReaderReady(reader);
    const currentPage = reader.locator("[data-current-page]");
    await expect(currentPage).toHaveText("01");

    const stage = reader.locator("[data-reader-stage]");
    await reader.evaluate((element) => {
      element.setAttribute("data-reader-pointer-events", "");
      for (const type of [
        "pointerdown",
        "pointermove",
        "pointerup",
        "pointercancel",
      ]) {
        element.addEventListener(type, () => {
          const events =
            element.getAttribute("data-reader-pointer-events") ?? "";
          element.setAttribute(
            "data-reader-pointer-events",
            events ? `${events},${type}` : type,
          );
        });
      }
    });
    const readPointerEvents = async (): Promise<string[]> =>
      (
        (await reader.getAttribute("data-reader-pointer-events")) ?? ""
      ).split(",").filter(Boolean);

    const box = await stage.boundingBox();
    if (!box) throw new Error("INKSeat reader has no gesture bounds.");
    await dispatchTrustedTouchGesture(page, {
      endX: box.x + box.width * 0.25,
      endY: box.y + box.height * 0.5 + 8,
      startX: box.x + box.width * 0.75,
      startY: box.y + box.height * 0.5,
    });
    await expect
      .poll(
        async () => {
          const pointerEvents = await readPointerEvents();
          return {
            counter: await currentPage.textContent(),
            sawPointerCancel: pointerEvents.includes("pointercancel"),
            sawPointerDown: pointerEvents.includes("pointerdown"),
            sawPointerMove: pointerEvents.includes("pointermove"),
            sawPointerUp: pointerEvents.includes("pointerup"),
            touchAction: await stage.evaluate(
              (element) => getComputedStyle(element).touchAction,
            ),
          };
        },
        { timeout: 10_000 },
      )
      .toEqual({
        counter: "02",
        sawPointerCancel: false,
        sawPointerDown: true,
        sawPointerMove: true,
        sawPointerUp: true,
        touchAction: "pan-y",
      });

    const horizontalPen = await dispatchReaderPointerGesture(reader, {
      endX: box.x + box.width * 0.25,
      endY: box.y + box.height * 0.45 + 8,
      pointerId: 2,
      pointerType: "pen",
      startX: box.x + box.width * 0.75,
      startY: box.y + box.height * 0.45,
    });
    expect(horizontalPen.downPrevented).toBe(false);
    expect(horizontalPen.upPrevented).toBe(true);
    await expect(currentPage).toHaveText("03", { timeout: 30_000 });

    const vertical = await dispatchReaderPointerGesture(reader, {
      endX: box.x + box.width * 0.5 - 12,
      endY: box.y + box.height * 0.72,
      pointerId: 3,
      pointerType: "pen",
      startX: box.x + box.width * 0.5,
      startY: box.y + box.height * 0.3,
    });
    expect(vertical.downPrevented).toBe(false);
    expect(vertical.upPrevented).toBe(false);
    await expect(currentPage).toHaveText("03");

    const scrollBefore = await page.evaluate(() => window.scrollY);
    const verticalEventStart = (await readPointerEvents()).length;
    await dispatchTrustedTouchGesture(page, {
      endX: box.x + box.width * 0.5 - 8,
      endY: box.y + box.height * 0.25,
      startX: box.x + box.width * 0.5,
      startY: box.y + box.height * 0.75,
    });
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(scrollBefore);
    await expect(currentPage).toHaveText("03");
    expect((await readPointerEvents()).slice(verticalEventStart)).toContain(
      "pointercancel",
    );
  });
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

test("cross-breakpoint resize resamples the reduced-motion budget without RAF replay", async ({
  page,
}, testInfo) => {
  const transition =
    testInfo.project.name === "desktop-1440"
      ? { initialBudget: 14_000, resizedBudget: 7_000, width: 390, height: 844 }
      : testInfo.project.name === "mobile-390"
        ? { initialBudget: 7_000, resizedBudget: 14_000, width: 1_440, height: 900 }
        : undefined;
  test.skip(!transition, "Only the canonical desktop/mobile projects cross the breakpoint.");
  if (!transition) return;

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const probe = { ellipseRadii: [] as number[], rafCalls: 0 };
    const originalEllipse = CanvasRenderingContext2D.prototype.ellipse;
    CanvasRenderingContext2D.prototype.ellipse = function (
      x,
      y,
      radiusX,
      radiusY,
      rotation,
      startAngle,
      endAngle,
      counterclockwise,
    ) {
      probe.ellipseRadii.push(radiusY);
      return originalEllipse.call(
        this,
        x,
        y,
        radiusX,
        radiusY,
        rotation,
        startAngle,
        endAngle,
        counterclockwise,
      );
    };
    const originalRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      probe.rafCalls += 1;
      return originalRaf(callback);
    };
    Object.defineProperty(window, "__portraitResizeProbe", {
      configurable: true,
      value: probe,
    });
  });

  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as {
          __portraitResizeProbe: { ellipseRadii: number[] };
        }).__portraitResizeProbe.ellipseRadii.length,
      ),
    )
    .toBe(transition.initialBudget);
  expect(
    await page.evaluate(() =>
      (window as unknown as {
        __portraitResizeProbe: { rafCalls: number };
      }).__portraitResizeProbe.rafCalls,
    ),
  ).toBe(0);

  await page.setViewportSize({
    width: transition.width,
    height: transition.height,
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as {
          __portraitResizeProbe: { ellipseRadii: number[] };
        }).__portraitResizeProbe.ellipseRadii.length,
      ),
    )
    .toBe(transition.initialBudget + transition.resizedBudget);

  const afterResize = await page.evaluate(() => ({
    ellipseCount: (
      window as unknown as {
        __portraitResizeProbe: { ellipseRadii: number[] };
      }
    ).__portraitResizeProbe.ellipseRadii.length,
    rafCalls: (
      window as unknown as {
        __portraitResizeProbe: { rafCalls: number };
      }
    ).__portraitResizeProbe.rafCalls,
  }));
  await page.waitForTimeout(350);
  expect(afterResize).toEqual({
    ellipseCount: transition.initialBudget + transition.resizedBudget,
    rafCalls: 0,
  });
  expect(
    await page.evaluate(() => ({
      ellipseCount: (
        window as unknown as {
          __portraitResizeProbe: { ellipseRadii: number[] };
        }
      ).__portraitResizeProbe.ellipseRadii.length,
      rafCalls: (
        window as unknown as {
          __portraitResizeProbe: { rafCalls: number };
        }
      ).__portraitResizeProbe.rafCalls,
    })),
  ).toEqual(afterResize);
  await waitForCompleteCanvas(page);
  await expectCriticalLayoutInsideViewport(page);
});
