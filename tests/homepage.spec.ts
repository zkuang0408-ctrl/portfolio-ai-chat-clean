import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { originalFrameFor } from "../src/particles/portrait-geometry";
import { portraitCompositionFor } from "../src/particles/renderer";

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
const expectedHttpErrors = new WeakMap<Page, Map<string, number>>();

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

function projectPagePath(url: string): string | null {
  const { pathname } = new URL(url);
  if (!pathname.startsWith("/projects/pages/") || !pathname.endsWith(".webp")) {
    return null;
  }
  return pathname;
}

function trackProjectPageRequests(page: Page): string[] {
  const requestedPages: string[] = [];
  page.on("request", (request) => {
    const pathname = projectPagePath(request.url());
    if (pathname) requestedPages.push(pathname);
  });
  return requestedPages;
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

function expectHttpError(page: Page, status: number, pathname = "/api/chat"): void {
  const responses = expectedHttpErrors.get(page);
  if (!responses) throw new Error("Browser error guards are not installed.");
  const key = `${status} ${pathname}`;
  responses.set(key, (responses.get(key) ?? 0) + 1);
}

function consumeExpectedHttpError(page: Page, status: number, url: string): boolean {
  const responses = expectedHttpErrors.get(page);
  if (!responses) return false;
  const key = `${status} ${new URL(url).pathname}`;
  const remaining = responses.get(key) ?? 0;
  if (remaining === 0) return false;
  responses.set(key, remaining - 1);
  return true;
}

interface MockSource {
  readonly id: "S1";
  readonly sourceId: string;
  readonly projectId?: string;
  readonly page?: number;
  readonly title: string;
  readonly citationLabel: string;
  readonly publicHref: string;
}

function eventWire(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function fulfillChat(
  route: Route,
  options: { locale?: "zh" | "en"; text: string; sources?: readonly MockSource[] },
): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "text/event-stream; charset=utf-8",
    headers: { "cache-control": "no-store" },
    body: [
      eventWire("start", { locale: options.locale ?? "zh" }),
      eventWire("delta", { text: options.text.slice(0, Math.ceil(options.text.length / 2)) }),
      eventWire("delta", { text: options.text.slice(Math.ceil(options.text.length / 2)) }),
      eventWire("sources", { sources: options.sources ?? [] }),
      eventWire("done", {}),
    ].join(""),
  });
}

async function ask(page: Page, question: string): Promise<void> {
  const chat = page.locator("[data-chat-root]");
  if ((await chat.getAttribute("data-chat-presentation")) !== "expanded") {
    await expect(chat).not.toHaveAttribute("data-chat-scrolling", "true");
    await page.locator("[data-open-chat]").click();
    await expect(chat).toHaveAttribute("data-chat-presentation", "expanded");
  }
  await page.locator("[data-chat-input]").fill(question);
  await page.locator("[data-chat-send]").click();
}

function installBrowserErrorGuards(page: Page): void {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  expectedRequestFailures.set(page, new Map());
  expectedConsoleErrors.set(page, new Map());
  expectedHttpErrors.set(page, new Map());
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
    if (
      response.status() >= 400 &&
      !consumeExpectedHttpError(page, response.status(), response.url())
    ) {
      errors.push(`response: ${response.status()} ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    if (consumeExpectedFailedRequest(page, request.url())) return;
    const failure = request.failure()?.errorText ?? "unknown error";
    const pathname = new URL(request.url()).pathname;
    if (
      failure === "net::ERR_ABORTED" &&
      pathname.startsWith("/projects/pages/") &&
      pathname.endsWith(".webp")
    ) {
      return;
    }
    errors.push(
      `requestfailed: ${failure} ${request.url()}`,
    );
  });
}

function assertNoBrowserErrors(page: Page): void {
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
  const unobservedExpectedHttpErrors = [
    ...(expectedHttpErrors.get(page)?.entries() ?? []),
  ].filter(([, remaining]) => remaining > 0);
  expect(
    unobservedExpectedHttpErrors,
    "every narrowly exempted HTTP error should occur",
  ).toEqual([]);
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
  const selectors = page.locator("[data-project-selector]");
  await expect(readers).toHaveCount(6);
  await expect(selectors).toHaveCount(6);
  for (let index = 0; index < 6; index += 1) {
    const selector = selectors.nth(index);
    const projectId = await selector.getAttribute("data-project-selector");
    if (!projectId) throw new Error(`Project selector ${index} has no project id.`);
    await selector.scrollIntoViewIfNeeded();
    await selector.click();
    const reader = page.locator(
      `[data-project-reader][data-project-id="${projectId}"]`,
    );
    await reader.scrollIntoViewIfNeeded();
    await expect(reader).toBeVisible();
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
      headline: bounds(".hero-copy"),
      identity: bounds(".site-nav__brand"),
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
  const minimumHeightRatio = layout.viewportWidth <= 390 ? 0.4 : 0.55;
  expect(visibleCanvasWidth).toBeGreaterThan(layout.viewportWidth * 0.5);
  expect(visibleCanvasHeight).toBeGreaterThan(
    layout.viewportHeight * minimumHeightRatio,
  );
}

async function pressTrustedTouch(
  page: Page,
  point: { x: number; y: number },
): Promise<() => Promise<void>> {
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
  });
  return async () => {
    try {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    } finally {
      await session.detach();
    }
  };
}

test.beforeEach(async ({ page }) => {
  installBrowserErrorGuards(page);
});

test.afterEach(async ({ page }) => {
  assertNoBrowserErrors(page);
});

const centeredPortraitProjects = new Set([
  "desktop-1440",
  "desktop-1920",
  "mobile-390",
  "mobile-430",
  "mobile-320",
  "mobile-landscape-667",
]);

test("centered particle portrait protects the face and fixed assistant", async ({
  page,
}, testInfo) => {
  test.skip(
    !centeredPortraitProjects.has(testInfo.project.name),
    "Only the six approved portrait viewports own this geometry contract.",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await waitForCompleteCanvas(page);

  const base = page.locator(".portrait-base");
  const mask = page.locator(".portrait-mask");
  for (const source of [base, mask]) {
    await expect(source).toBeHidden();
    await expect(source).toHaveCSS("visibility", "hidden");
    await expect(source).toHaveCSS("pointer-events", "none");
  }

  const geometry = await page.evaluate(() => {
    type Rect = {
      bottom: number;
      left: number;
      right: number;
      top: number;
    };
    const rect = (selector: string): Rect => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const bounds = element.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
      };
    };
    const optionalRect = (selector: string): Rect | null => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return null;
      return {
        bottom: bounds.bottom,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
      };
    };
    const headline = document.querySelector<HTMLElement>(".hero-copy .headline");
    const portraitBase = document.querySelector<HTMLImageElement>(".portrait-base");
    if (!headline || !portraitBase || portraitBase.naturalWidth === 0) {
      throw new Error("Portrait geometry is not ready.");
    }
    const canvasElement = document.querySelector<HTMLCanvasElement>(
      ".portrait-canvas",
    );
    if (!canvasElement) throw new Error("Missing .portrait-canvas");
    const context = canvasElement.getContext("2d");
    if (!context) throw new Error("Portrait canvas context is unavailable.");
    const imageData = context.getImageData(
      0,
      0,
      canvasElement.width,
      canvasElement.height,
    );
    let alphaMinX = canvasElement.width;
    let alphaMaxX = -1;
    for (let y = 0; y < canvasElement.height; y += 1) {
      for (let x = 0; x < canvasElement.width; x += 1) {
        if (imageData.data[(y * canvasElement.width + x) * 4 + 3] === 0) {
          continue;
        }
        alphaMinX = Math.min(alphaMinX, x);
        alphaMaxX = Math.max(alphaMaxX, x);
      }
    }
    if (alphaMaxX < alphaMinX) {
      throw new Error("Portrait canvas has no visible particles.");
    }
    const canvasBounds = canvasElement.getBoundingClientRect();
    const canvasScaleX = canvasBounds.width / canvasElement.width;
    const canvas = rect(".portrait-canvas");
    const scene = rect(".hero-scene");
    const stage = rect(".portrait-stage");
    const canvasWidth = canvas.right - canvas.left;
    const canvasHeight = canvas.bottom - canvas.top;
    const sourceWidth = portraitBase.naturalWidth;
    const sourceHeight = portraitBase.naturalHeight;
    const headlineText = Array.from(headline.querySelectorAll("span")).map(
      (span) => {
        const range = document.createRange();
        range.selectNodeContents(span);
        const bounds = range.getBoundingClientRect();
        return {
          bottom: bounds.bottom,
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
        };
      },
    );
    return {
      alphaBounds: {
        left: canvasBounds.left + alphaMinX * canvasScaleX,
        right: canvasBounds.left + (alphaMaxX + 1) * canvasScaleX,
      },
      card: optionalRect("[data-chat-panel]"),
      canvas,
      headline: rect(".hero-copy .headline"),
      headlineText,
      orb: rect("[data-chat-orb]"),
      scene,
      source: { height: sourceHeight, width: sourceWidth },
      stage,
      viewport: { height: window.innerHeight, width: window.innerWidth },
    };
  });
  const composition = portraitCompositionFor(
    geometry.canvas.right - geometry.canvas.left,
    geometry.canvas.bottom - geometry.canvas.top,
    geometry.source,
  );
  const originalFrame = originalFrameFor(
    geometry.source.width,
    geometry.source.height,
  );
  // Source-grounded head rectangle: hair/face occupy x=.32-.76, y=.18-.60.
  const protectedFace = {
    left:
      geometry.canvas.left + composition.offsetX +
      (originalFrame.left + originalFrame.width * 0.32) * composition.scale,
    right:
      geometry.canvas.left + composition.offsetX +
      (originalFrame.left + originalFrame.width * 0.76) * composition.scale,
    top:
      geometry.canvas.top + composition.offsetY +
      geometry.source.height * composition.scale * 0.18,
    bottom:
      geometry.canvas.top + composition.offsetY +
      geometry.source.height * composition.scale * 0.6,
  };
  const intersects = (
    a: typeof geometry.headline,
    b: typeof geometry.headline,
    tolerance = 1,
  ) =>
    a.left < b.right - tolerance && a.right > b.left + tolerance &&
    a.top < b.bottom - tolerance && a.bottom > b.top + tolerance;

  expect(geometry.canvas).toEqual(geometry.stage);
  if (testInfo.project.name === "mobile-landscape-667") {
    expect(geometry.stage.left).toBe(geometry.scene.left);
    expect(geometry.stage.top).toBe(geometry.scene.top);
    expect(geometry.stage.bottom).toBe(geometry.scene.bottom);
    expect(geometry.stage.right).toBeCloseTo(
      geometry.scene.left + (geometry.scene.right - geometry.scene.left) * 0.52,
      0,
    );
  } else {
    expect(geometry.stage).toEqual(geometry.scene);
  }
  expect(geometry.source).toEqual({ height: 1_425, width: 1_350 });
  if (testInfo.project.name.startsWith("desktop-")) {
    expect(geometry.alphaBounds.left).toBeGreaterThanOrEqual(
      geometry.viewport.width * 0.02,
    );
    expect(geometry.alphaBounds.right).toBeLessThanOrEqual(
      geometry.viewport.width * 0.98,
    );
  }
  expect(
    geometry.headlineText.some((line) => intersects(line, protectedFace, 5)),
    `headline text must not cover the protected face: ${JSON.stringify({ geometry, protectedFace })}`,
  ).toBe(false);
  expect(intersects(geometry.headline, geometry.orb)).toBe(false);
  if (testInfo.project.name.startsWith("mobile-")) {
    expect(geometry.card, "mobile guide card should have visible bounds").not.toBeNull();
    if (geometry.card) {
      expect(intersects(geometry.card, protectedFace, 5)).toBe(false);
      expect(geometry.card.top).toBeGreaterThanOrEqual(protectedFace.bottom + 8);
      expect(intersects(geometry.card, geometry.headline)).toBe(false);
    }
  }
  for (const line of geometry.headlineText) {
    expect(line.left).toBeGreaterThanOrEqual(-1);
    expect(line.right).toBeLessThanOrEqual(geometry.viewport.width + 1);
    expect(line.top).toBeGreaterThanOrEqual(-1);
    expect(line.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1);
  }
  if (testInfo.project.name === "mobile-landscape-667") {
    expect(intersects(geometry.headline, protectedFace)).toBe(false);
    expect(geometry.headline.left).toBeGreaterThanOrEqual(protectedFace.right - 1);
  }
  if (testInfo.project.name === "mobile-320") {
    expect(geometry.headlineText).toHaveLength(2);
    expect(intersects(geometry.headline, protectedFace)).toBe(false);
    expect(geometry.headline.top).toBeGreaterThanOrEqual(
      protectedFace.bottom - 1,
    );
  }
});

test("centered particle portrait mask failure preserves the portfolio path", async ({
  page,
}, testInfo) => {
  test.skip(
    !centeredPortraitProjects.has(testInfo.project.name),
    "Only the six approved portrait viewports own this fallback contract.",
  );
  expectOneFailedRequest(page, "/portrait-particle-mask.png");
  expectOneConsoleError(page, "Failed to load resource: net::ERR_FAILED");
  await page.route("**/portrait-particle-mask.png", (route) =>
    route.abort("failed"),
  );
  await page.goto("/");

  await expect(page.locator(".portrait-stage")).toHaveClass(
    /portrait-stage--error/,
  );
  const portraitStatus = page.locator(".portrait-error");
  await expect(portraitStatus).toBeVisible();
  await expect(portraitStatus).toHaveText(
    "Portrait visualization unavailable.",
  );
  await expect(
    page.getByRole("heading", {
      name: /Crafting Future Through Objects & Systems\./i,
    }),
  ).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "主要栏目" });
  await expect(navigation).toBeVisible();
  for (const target of ["resume", "projects"] as const) {
    await navigation.locator(`a[href="#${target}"]`).click();
    await expect(page.locator(`#${target}`)).toBeInViewport();
  }
});

test.describe("canonical grounded portfolio chat", () => {
  test.skip(
    ({ viewport }) => viewport?.width !== 1_440,
    "The canonical desktop project owns deterministic chat coverage.",
  );

  test("keeps a persistent collapsible assistant with four grounded prompts", async ({ page }) => {
    await page.goto("/");

    const chat = page.locator("[data-chat-root]");
    await expect(page.locator("[data-site-brand]")).toHaveText("赵实旷");
    await expect(chat.locator("[data-chat-recommendation]")).toHaveCount(4);
    await expect(chat).toHaveAttribute("data-chat-presentation", "guide");
    await expect(chat.locator("[data-chat-panel]")).toBeVisible();
    await chat.locator("[data-chat-collapse]").click();
    await expect(chat).toHaveAttribute("data-chat-presentation", "collapsed");
    await expect(chat.locator("[data-chat-orb]")).toBeVisible();
    await chat.locator("[data-chat-orb]").click();
    await expect(chat).toHaveAttribute("data-chat-presentation", "expanded");
    await expect(chat.locator("[data-chat-panel]")).toBeVisible();
    const style = await chat.locator("[data-chat-panel]").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const computed = getComputedStyle(element);
      return {
        background: computed.backgroundColor,
        borderRadius: computed.borderRadius,
        boxShadow: computed.boxShadow,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      };
    });
    expect(style.left).toBeGreaterThanOrEqual(0);
    expect(style.right).toBeLessThanOrEqual(1_440);
    expect(style.top).toBeGreaterThanOrEqual(0);
    expect(style.width).toBeLessThanOrEqual(400);
    expect(style.height).toBeLessThanOrEqual(560);
    expect(style.borderRadius).toBe("30px 30px 22px 22px");
    expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(style.boxShadow).not.toBe("none");
  });

  test("streams Chinese and English deltas using the visitor language", async ({ browser, page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "language", { configurable: true, get: () => "zh-CN" });
    });
    await page.route("**/api/chat", async (route) =>
      fulfillChat(route, { locale: "zh", text: "这是依据作品资料生成的中文回答。" }),
    );
    await page.goto("/");
    await ask(page, "请介绍赵实旷");
    await expect(page.locator('[data-chat-message="assistant"]').last()).toHaveText(
      "这是依据作品资料生成的中文回答。",
    );

    const englishContext = await browser.newContext({
      baseURL: new URL(page.url()).origin,
      locale: "en-US",
      viewport: { width: 1_440, height: 900 },
    });
    const englishPage = await englishContext.newPage();
    installBrowserErrorGuards(englishPage);
    await englishPage.route("**/api/chat", async (route) =>
      fulfillChat(route, { locale: "en", text: "This answer is grounded in the portfolio." }),
    );
    await englishPage.goto("/");
    await ask(englishPage, "Introduce Shikuang");
    await expect(englishPage.locator('[data-chat-message="assistant"]').last()).toHaveText(
      "This answer is grounded in the portfolio.",
    );
    assertNoBrowserErrors(englishPage);
    await englishContext.close();
  });

  test("keeps completed turns on same-tab reload but not in a new context", async ({ browser, page }) => {
    await page.route("**/api/chat", async (route) =>
      fulfillChat(route, { locale: "en", text: "Stored only for this browser tab." }),
    );
    await page.goto("/");
    await ask(page, "Remember this turn");
    await expect(page.locator('[data-chat-message="assistant"]')).toHaveText(
      "Stored only for this browser tab.",
    );
    await page.reload();
    await expect(page.locator('[data-chat-message="user"]')).toHaveText("Remember this turn");
    await expect(page.locator('[data-chat-message="assistant"]')).toHaveText(
      "Stored only for this browser tab.",
    );

    const freshContext = await browser.newContext({
      baseURL: new URL(page.url()).origin,
      viewport: { width: 1_440, height: 900 },
    });
    const freshPage = await freshContext.newPage();
    installBrowserErrorGuards(freshPage);
    await freshPage.goto("/");
    await expect(freshPage.locator("[data-chat-message]")).toHaveCount(0);
    assertNoBrowserErrors(freshPage);
    await freshContext.close();
  });

  test("renders JSON limits, provider errors, and an incomplete SSE failure without breaking the composer", async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      const body = route.request().postDataJSON() as { message: string };
      if (body.message === "limit") {
        await route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "rate_limited", message: "limited" } }),
        });
      } else if (body.message === "provider") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "upstream_unavailable", message: "offline" } }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: eventWire("start", { locale: "en" }) + eventWire("delta", { text: "Partial evidence" }),
        });
      }
    });
    await page.goto("/");

    expectOneConsoleError(page, "Failed to load resource: the server responded with a status of 429 (Too Many Requests)");
    expectHttpError(page, 429);
    await ask(page, "limit");
    await expect(page.locator("[data-chat-status]")).toContainText("request limit");
    expectOneConsoleError(page, "Failed to load resource: the server responded with a status of 503 (Service Unavailable)");
    expectHttpError(page, 503);
    await ask(page, "provider");
    await expect(page.locator("[data-chat-status]")).toContainText("couldn’t complete");
    await ask(page, "partial");
    await expect(page.locator('[data-chat-message="assistant"]').last()).toHaveText("Partial evidence");
    await expect(page.locator("[data-chat-status]")).toContainText("Something went wrong");
    await expect(page.locator("[data-chat-input]")).toBeEnabled();
  });

  test("opens exact project pages and handles profile and sanitized resume sources", async ({ page }) => {
    await page.addInitScript(() => {
      const originalOpen = window.open.bind(window);
      window.open = ((...args: Parameters<typeof window.open>) => {
        Object.defineProperty(window, "__portfolioOpenArgs", {
          configurable: true,
          value: args,
        });
        return originalOpen(...args);
      }) as typeof window.open;
    });
    const sourceFor = (message: string): MockSource => {
      if (message === "project") {
        return {
          id: "S1", sourceId: "inkseat", projectId: "inkseat", page: 8,
          title: "INKSeat", citationLabel: "INKSEAT · P.08", publicHref: "/projects/pdfs/emovue.pdf#page=99",
        };
      }
      if (message === "profile") {
        return {
          id: "S1", sourceId: "profile", page: 1, title: "Profile",
          citationLabel: "PROFILE", publicHref: "#contact",
        };
      }
      return {
        id: "S1", sourceId: "resume", page: 1, title: "Resume",
        citationLabel: "RESUME · P.01", publicHref: "/documents/zhao-shikuang-portfolio.pdf",
      };
    };
    await page.route("**/api/chat", async (route) => {
      const { message } = route.request().postDataJSON() as { message: string };
      await fulfillChat(route, { locale: "en", text: "Grounded answer.", sources: [sourceFor(message)] });
    });
    await page.goto("/");

    await ask(page, "project");
    await page.getByRole("button", { name: "INKSEAT · P.08" }).click();
    const inkseat = page.locator('[data-project-reader][data-project-id="inkseat"]');
    await expect(page.locator("#project-inkseat")).toBeInViewport();
    await expect(inkseat.locator("[data-current-page]")).toHaveText("08", { timeout: 30_000 });

    await ask(page, "profile");
    await page.getByRole("button", { name: "PROFILE" }).click();
    await expect(page.locator("#resume")).toBeInViewport();

    await ask(page, "resume");
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "RESUME · P.01" }).click();
    const popup = await popupPromise;
    expect(
      await page.evaluate(() =>
        (window as unknown as { __portfolioOpenArgs: unknown[] }).__portfolioOpenArgs,
      ),
    ).toEqual([
      "/documents/zhao-shikuang-resume-public.pdf#page=1",
      "_blank",
      "noopener,noreferrer",
    ]);
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await popup.close();
  });

  test("keyboard submission and reduced motion remain accessible", async ({ page }) => {
    await page.addInitScript(() => {
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (options?: boolean | ScrollIntoViewOptions) {
        Object.defineProperty(window, "__portfolioScrollOptions", {
          configurable: true,
          value: options,
        });
        return original.call(this, options);
      };
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/chat", async (route) =>
      fulfillChat(route, {
        locale: "en",
        text: "Keyboard response.",
        sources: [{
          id: "S1",
          sourceId: "profile",
          page: 1,
          title: "Profile",
          citationLabel: "PROFILE · P.01",
          publicHref: "#about",
        }],
      }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Ask AI" }).click();
    const input = page.locator("[data-chat-input]");
    await input.focus();
    await expect(input).toBeFocused();
    await input.fill("Keyboard question");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-chat-message="assistant"]')).toHaveText("Keyboard response.");
    await expect(input).toBeEnabled();
    await expect(page.locator("[data-chat-recommendation]").first()).toHaveCSS(
      "transition-duration",
      "0s",
    );
    await page.getByRole("button", { name: "PROFILE · P.01" }).click();
    const scrollOptions = await page.evaluate(() =>
      (window as unknown as { __portfolioScrollOptions: ScrollIntoViewOptions })
        .__portfolioScrollOptions,
    );
    expect(scrollOptions).toEqual({ block: "start" });
    expect(scrollOptions).not.toHaveProperty("behavior");
  });

  test("an API failure leaves navigation, portrait, and all six PDF readers usable", async ({ page }) => {
    expectOneConsoleError(page, "Failed to load resource: the server responded with a status of 503 (Service Unavailable)");
    expectHttpError(page, 503);
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "upstream_unavailable", message: "offline" } }),
      });
    });
    await page.goto("/");
    await ask(page, "fail safely");
    await expect(page.locator("[data-chat-status]")).toContainText("couldn’t complete");
    await page.locator('a[href="#projects"]').click();
    await expect(page.locator("#projects")).toBeInViewport();
    await waitForCompleteCanvas(page);
    await loadAllFirstPagesSequentially(page);
    await page.locator('[data-project-selector="inkseat"]').click();
    const first = page.locator('[data-project-reader][data-project-id="inkseat"]');
    await first.scrollIntoViewIfNeeded();
    await waitForReaderReady(first);
    await first.getByRole("button", { name: "Next page of INKSeat" }).click();
    await expect(first.locator("[data-current-page]")).toHaveText("02", { timeout: 30_000 });
  });
});

test("keeps the mobile hero zones separate and opens the full assistant from the guide", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"));
  await page.goto("/");
  const layout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const bounds = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
      if (!bounds) throw new Error(`Missing ${selector}`);
      return {
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
      };
    };
    const lines = (selector: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector), (line) => {
        const bounds = line.getBoundingClientRect();
        return {
          height: bounds.height,
          fontSize: Number.parseFloat(getComputedStyle(line).fontSize),
          text: line.textContent?.trim(),
        };
      });
    const root = document.querySelector<HTMLElement>("[data-chat-root]");
    const ask = document.querySelector<HTMLElement>("[data-open-chat]");
    if (!root || !ask) throw new Error("Missing mobile hero controls");
    return {
      askDisplay: getComputedStyle(ask).display,
      action: rect("[data-chat-mobile-guide-action]"),
      card: rect("[data-chat-panel]"),
      headline: rect(".hero-copy .headline"),
      headlineLines: lines(".hero-copy .headline > span"),
      nav: rect(".site-nav"),
      supporting: rect(".hero-supporting"),
      supportingLines: lines(".hero-supporting > span"),
      presentation: root.dataset.chatPresentation,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  expect(layout.askDisplay).toBe("none");
  expect(layout.nav.height).toBeLessThanOrEqual(72);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.headlineLines.map((line) => line.text)).toEqual([
    "Crafting Future",
    "Through Objects & Systems.",
  ]);
  expect(layout.supportingLines.map((line) => line.text)).toEqual([
    "从实体产品到智能系统，",
    "以研究、交互与原型塑造未来体验。",
  ]);
  for (const line of [...layout.headlineLines, ...layout.supportingLines]) {
    expect(line.height).toBeLessThanOrEqual(line.fontSize * 1.55);
  }
  expect(layout.headline.bottom).toBeLessThanOrEqual(layout.supporting.top - 8);
  expect(layout.supporting.bottom).toBeLessThanOrEqual(layout.card.top - 14);
  expect(layout.card.height).toBeGreaterThanOrEqual(76);
  expect(layout.card.height).toBeLessThanOrEqual(92);
  expect(layout.action.width).toBeGreaterThanOrEqual(44);
  expect(layout.action.height).toBeGreaterThanOrEqual(44);
  expect(layout.action.left).toBeGreaterThanOrEqual(layout.card.left - 1);
  expect(layout.action.right).toBeLessThanOrEqual(layout.card.right + 1);
  expect(layout.action.top).toBeGreaterThanOrEqual(layout.card.top - 1);
  expect(layout.action.bottom).toBeLessThanOrEqual(layout.card.bottom + 1);
  expect(layout.presentation).toBe("guide");

  await page.locator("[data-chat-mobile-guide-action]").click();
  const root = page.locator("[data-chat-root]");
  await expect(root).toHaveAttribute("data-chat-presentation", "expanded");
  await expect(page.locator("[data-chat-panel]")).toBeVisible();
  await expect(page.locator("[data-chat-transcript]")).toBeVisible();
  await expect(page.locator("[data-chat-input]")).toBeVisible();
});

test("uses a transparent 56px mobile orb and docks only after release", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"));
  await page.goto("/");
  const root = page.locator("[data-chat-root]");
  await page.evaluate(() => window.scrollTo(0, 220));
  await expect(root).toHaveAttribute("data-chat-presentation", "collapsed");

  const shell = await root.evaluate((element) => {
    const orb = element.querySelector<HTMLElement>("[data-chat-orb]");
    if (!orb) throw new Error("Missing orb");
    const bounds = orb.getBoundingClientRect();
    const style = getComputedStyle(orb);
    const pseudo = getComputedStyle(element, "::before");
    const canvas = element.querySelector<HTMLElement>(".chat-particle-canvas");
    return {
      width: bounds.width,
      height: bounds.height,
      background: style.backgroundColor,
      border: style.borderStyle,
      pseudoContent: pseudo.content,
      mixBlend: canvas ? getComputedStyle(canvas).mixBlendMode : "",
    };
  });
  expect(shell.width).toBeCloseTo(56, 4);
  expect(shell.height).toBeCloseTo(56, 4);
  expect(shell.background).toBe("rgba(0, 0, 0, 0)");
  expect(shell.border).toBe("none");
  expect(shell.pseudoContent).toBe("none");
  expect(shell.mixBlend).toBe("difference");

  const orb = page.locator("[data-chat-orb]");
  const start = await orb.boundingBox();
  if (!start) throw new Error("Mobile orb has no bounds");
  const target = await page.evaluate(() => ({
    x: window.innerWidth * 0.65,
    y: Math.min(window.innerHeight - 44, Math.max(96, window.innerHeight * 0.46)),
  }));
  const startX = start.x + start.width / 2;
  const startY = start.y + start.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y);
  await expect(root).toHaveAttribute("data-chat-dragging", "true");
  const duringMove = await orb.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const root = element.closest<HTMLElement>("[data-chat-root]");
    return {
      centerX: bounds.left + bounds.width / 2,
      dock: root?.dataset.chatDock,
      viewportWidth: window.innerWidth,
    };
  });
  expect(duringMove.centerX).toBeGreaterThan(duringMove.viewportWidth * 0.55);
  expect(duringMove.centerX).toBeLessThan(duringMove.viewportWidth - 44);
  expect(duringMove.dock).toBe("left");

  await page.mouse.up();
  await expect(root).not.toHaveAttribute("data-chat-dragging", "true");
  await expect(root).toHaveAttribute("data-chat-dock", "right");
  const released = await orb.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      viewportWidth: window.innerWidth,
    };
  });
  expect(released.left).toBeGreaterThanOrEqual(0);
  expect(released.right).toBeLessThanOrEqual(released.viewportWidth);

  await orb.click();
  await expect(root).toHaveAttribute("data-chat-presentation", "expanded");
  await expect(page.locator("[data-chat-panel]")).toBeVisible();
});

test("keeps the mobile chat inside the keyboard viewport and uses physical tap feedback", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"));
  await page.addInitScript(() => {
    const viewport = new EventTarget() as EventTarget & {
      height: number;
      offsetTop: number;
      width: number;
    };
    viewport.height = window.innerHeight;
    viewport.offsetTop = 0;
    viewport.width = window.innerWidth;
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
    Object.defineProperty(window, "__setChatVisualViewport", {
      configurable: true,
      value: (height: number, offsetTop: number) => {
        viewport.height = height;
        viewport.offsetTop = offsetTop;
        viewport.dispatchEvent(new Event("resize"));
        viewport.dispatchEvent(new Event("scroll"));
      },
    });
  });
  await page.goto("/");
  const guide = page.locator("[data-chat-mobile-guide-action]");
  const tapHighlight = await guide.evaluate((element) =>
    getComputedStyle(element).getPropertyValue("-webkit-tap-highlight-color"),
  );
  expect(tapHighlight).toBe("rgba(0, 0, 0, 0)");

  const guideBounds = await guide.boundingBox();
  if (!guideBounds) throw new Error("Mobile chat guide has no bounds");
  const releaseTouch = await pressTrustedTouch(page, {
    x: guideBounds.x + guideBounds.width / 2,
    y: guideBounds.y + guideBounds.height / 2,
  });
  await page.waitForTimeout(60);
  const pressedState = await guide.evaluate((element) => ({
    active: element.matches(":active"),
    coarse: matchMedia("(pointer: coarse)").matches,
    scale: getComputedStyle(element).scale,
    tapScale: getComputedStyle(element).getPropertyValue("--tap-scale"),
  }));
  expect(pressedState, "trusted touch press state").toMatchObject({
    coarse: true,
    tapScale: "1.02",
  });
  expect(pressedState.active).toBe(false);
  expect(Number.parseFloat(pressedState.scale)).toBeGreaterThan(1);
  await releaseTouch();

  const root = page.locator("[data-chat-root]");
  const panel = page.locator("[data-chat-panel]");
  const input = page.locator("[data-chat-input]");
  await expect(root).toHaveAttribute("data-chat-presentation", "expanded");
  await expect(input).toBeFocused();
  const layoutHeight = page.viewportSize()?.height ?? 844;
  const keyboardHeight = Math.min(
    layoutHeight - 160,
    Math.max(180, Math.floor(layoutHeight * 0.62)),
  );
  const keyboardOffset = 44;
  await page.evaluate(
    ({ height, offsetTop }) => {
      (window as unknown as {
        __setChatVisualViewport: (height: number, offsetTop: number) => void;
      }).__setChatVisualViewport(height, offsetTop);
    },
    { height: keyboardHeight, offsetTop: keyboardOffset },
  );
  await expect(root).toHaveAttribute("data-chat-keyboard", "active");

  const geometry = await panel.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    if (!viewport) throw new Error("Missing visual viewport");
    return {
      top: bounds.top,
      bottom: bounds.bottom,
      visualTop: viewport.offsetTop,
      visualBottom: viewport.offsetTop + viewport.height,
    };
  });
  expect(geometry.top).toBeGreaterThanOrEqual(geometry.visualTop + 12);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.visualBottom - 11);

  await page.evaluate(() => window.scrollTo(0, 200));
  await expect(root).toHaveAttribute("data-chat-presentation", "expanded");
  const releasedScale = await guide.evaluate((element) => getComputedStyle(element).scale);
  expect(Number.parseFloat(releasedScale)).toBeCloseTo(1, 2);
});

test("keeps keyboard viewport state and tap enlargement mobile-only", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.goto("/");
  const trigger = page.locator("[data-open-chat]");
  const desktopStyle = await trigger.evaluate((element) => ({
    scale: getComputedStyle(element).scale,
    tapHighlight: getComputedStyle(element).getPropertyValue("-webkit-tap-highlight-color"),
  }));
  expect(desktopStyle.scale).toBe("none");
  expect(desktopStyle.tapHighlight).not.toBe("rgba(0, 0, 0, 0)");
  await trigger.click();
  await expect(page.locator("[data-chat-root]")).not.toHaveAttribute("data-chat-keyboard", "active");
});

test("keeps mobile project chevrons proportional to the reader page", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"));
  await page.goto("/#projects");
  await page.locator("[data-project-selector]").first().click();
  const reader = page.locator('[data-project-reader][data-project-id="inkseat"]');
  await reader.scrollIntoViewIfNeeded();
  await waitForReaderReady(reader);
  const geometry = await reader.locator(".project-reader-stage").evaluate((stage) => {
    const button = stage.querySelector<HTMLElement>(".project-reader-chevron--next");
    const svg = button?.querySelector<SVGElement>("svg");
    if (!button || !svg) throw new Error("Missing reader chevron");
    const stageBounds = stage.getBoundingClientRect();
    const buttonBounds = button.getBoundingClientRect();
    const svgBounds = svg.getBoundingClientRect();
    return {
      stageWidth: stageBounds.width,
      button: { width: buttonBounds.width, height: buttonBounds.height },
      svg: { width: svgBounds.width, height: svgBounds.height },
    };
  });
  expect(geometry.button.width).toBeGreaterThanOrEqual(44);
  expect(geometry.button.height).toBeGreaterThanOrEqual(44);
  expect(geometry.svg.width).toBeGreaterThanOrEqual(14);
  expect(geometry.svg.width).toBeLessThanOrEqual(22);
  expect(geometry.svg.height / geometry.svg.width).toBeCloseTo(66 / 40, 1);
  expect(geometry.svg.width).toBeCloseTo(
    Math.min(22, Math.max(14, geometry.stageWidth * 0.031)),
    0,
  );
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

  await expect(page.locator("[data-site-brand]")).toHaveText("赵实旷");
  await expect(page.getByRole("heading", { name: /Crafting Future Through Objects & Systems\./i })).toBeVisible();
  const primaryNavigation = page.getByRole("navigation", { name: "主要栏目" });
  await expect(primaryNavigation).toBeVisible();
  await expect(primaryNavigation.locator("a")).toHaveCount(3);
  await expect(primaryNavigation.locator("[aria-disabled='true']")).toHaveCount(0);
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
  await expect(links.nth(0)).toHaveAttribute("href", "#resume");
  await expect(links.nth(1)).toHaveAttribute("href", "#projects");
  await expect(links.nth(2)).toHaveAttribute("href", "#contact");

  for (const target of ["resume", "projects", "contact"]) {
    await navigation.locator(`a[href="#${target}"]`).click();
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
    page.locator('#contact a[href="mailto:zkuang0408@gmail.com"]'),
  ).toBeVisible();
  const publicText = await page.locator("body").innerText();
  expect(publicText).toContain("zkuang0408@gmail.com");
  expect(publicText).toContain("2643414752@qq.com");

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

test.describe("canonical desktop project reader behavior", () => {
  test.skip(
    ({ viewport }) => viewport?.width !== 1_440,
    "Canonical desktop project owns the lazy-network proof.",
  );

  test("preloads only the approached reader's next image page", async ({ page }) => {
    const requestedPages = trackProjectPageRequests(page);
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
    await expect(page.locator("#resume")).toBeInViewport();
    const initialDistance = await firstReader.evaluate(
      (element) => element.getBoundingClientRect().top - window.innerHeight,
    );
    expect(initialDistance).toBeGreaterThan(600);
    expect(requestedPages.some((path) => /\/02-1800\.webp$/.test(path))).toBe(false);

    await firstReader.evaluate((element) => {
      const readerTop = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        behavior: "instant",
        top: Math.max(0, readerTop - window.innerHeight - 550),
      });
    });
    await waitForReaderReady(firstReader);

    await expect
      .poll(() =>
        requestedPages.some(
          (path) =>
            path.includes("/projects/pages/inkseat/") &&
            path.endsWith("/02-1800.webp"),
        ),
      )
      .toBe(true);
    expect(
      requestedPages.some(
        (path) =>
          !path.includes("/projects/pages/inkseat/") &&
          /\/02-1800\.webp$/.test(path),
      ),
    ).toBe(false);
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

  test("isolates one failed image page while another reader stays usable", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator('[data-project-selector="emovue"]').click();
    const failedReader = page.locator(
      '[data-project-reader][data-project-id="emovue"]',
    );
    await failedReader.scrollIntoViewIfNeeded();
    await waitForReaderReady(failedReader);
    const firstPagePath = await failedReader
      .locator("[data-page-image]")
      .getAttribute("src");
    if (!firstPagePath) throw new Error("Missing EMOVUE first page URL.");
    const failedPath = firstPagePath.replace("/01-1800.webp", "/02-1800.webp");
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
    await failedReader.getByRole("button", { name: "Next page of EMOVUE" }).click();
    await expect(failedReader).toHaveAttribute("data-reader-state", "error", {
      timeout: 30_000,
    });
    const errorRegion = failedReader.locator("[data-reader-error]");
    await expect(errorRegion).toBeVisible();
    await expect(errorRegion).toContainText("Unable to load this project.");
    await expect(
      errorRegion.getByRole("button", { name: "Retry" }),
    ).toBeVisible();
    const originalPdf = failedReader.getByRole("link", {
      name: "Open complete PDF",
    });
    await expect(originalPdf).toBeVisible();
    await expect(originalPdf).toHaveAttribute("href", "/projects/pdfs/emovue.pdf");
    await expect(originalPdf).toHaveAttribute("target", "_blank");
    expect(abortedRequests).toBe(1);

    await page.locator('[data-project-selector="inkseat"]').click();
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
    width: viewport.width <= 333 ? viewport.width + 17 : viewport.width - 13,
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
  await page.evaluate(() => window.scrollTo({ behavior: "instant", top: 0 }));
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
