// @vitest-environment node

import { expect, test, vi } from "vitest";

import {
  extractPdfPages,
  normalizePdfText,
  type OcrPage,
} from "./pdf-extractor";
import {
  createDefaultOcrWorker,
  createPdfOcrRun,
  renderPdfPageToPng,
} from "./ocr";

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

interface FakeTextItem {
  readonly str?: unknown;
}

type FakePage = PDFPageProxy & { cleanup: ReturnType<typeof vi.fn> };

function fakePage(items: readonly FakeTextItem[]): FakePage {
  return {
    getTextContent: async () => ({ items }),
    cleanup: vi.fn(),
  } as unknown as FakePage;
}

function fakeDocument(pages: readonly PDFPageProxy[]): PDFDocumentProxy {
  return {
    numPages: pages.length,
    getPage: async (pageNumber: number) => {
      const page = pages[pageNumber - 1];
      if (!page) throw new Error(`Unknown fake page ${pageNumber}`);
      return page;
    },
  } as unknown as PDFDocumentProxy;
}

test("keeps native normalized text of at least 40 Unicode characters without OCR", async () => {
  const nativeText = `  ${"😀".repeat(40)}\n `;
  const ocrPage = vi.fn<OcrPage>();

  await expect(
    extractPdfPages(fakeDocument([fakePage([{ str: nativeText }])]), { ocrPage }),
  ).resolves.toEqual([
    { page: 1, text: "😀".repeat(40), method: "pdf-text" },
  ]);
  expect(ocrPage).not.toHaveBeenCalled();
});

test("uses injected OCR once for a non-visual page with too little native text", async () => {
  const ocrPage = vi.fn<OcrPage>().mockResolvedValue("  OCR\n  content  ");

  await expect(
    extractPdfPages(fakeDocument([fakePage([{ str: "short" }])]), { ocrPage }),
  ).resolves.toEqual([{ page: 1, text: "OCR content", method: "ocr" }]);
  expect(ocrPage).toHaveBeenCalledTimes(1);
  expect(ocrPage.mock.calls[0]?.[1]).toBe(1);
});

test("keeps allowlisted visual pages as PDF text without OCR", async () => {
  const ocrPage = vi.fn<OcrPage>();

  await expect(
    extractPdfPages(fakeDocument([fakePage([{ str: "  " }])]), {
      ocrPage,
      visualPages: [1],
    }),
  ).resolves.toEqual([{ page: 1, text: "", method: "pdf-text" }]);
  expect(ocrPage).not.toHaveBeenCalled();
});

test("preserves document page order and one-based page numbers", async () => {
  const ocrPage = vi.fn<OcrPage>().mockResolvedValueOnce("OCR second page");
  const nativeText = "x".repeat(40);

  await expect(
    extractPdfPages(
      fakeDocument([
        fakePage([{ str: nativeText }]),
        fakePage([{ str: "low text" }]),
        fakePage([{ str: nativeText.replaceAll("x", "z") }]),
      ]),
      { ocrPage },
    ),
  ).resolves.toEqual([
    { page: 1, text: nativeText, method: "pdf-text" },
    { page: 2, text: "OCR second page", method: "ocr" },
    { page: 3, text: "z".repeat(40), method: "pdf-text" },
  ]);
  expect(ocrPage.mock.calls.map(([, pageNumber]) => pageNumber)).toEqual([2]);
});

test("rejects a document whose actual page count differs from the manifest", async () => {
  await expect(
    extractPdfPages(fakeDocument([fakePage([])]), { expectedPageCount: 2 }),
  ).rejects.toThrow("PDF page count mismatch: expected 2, received 1");
});

test("normalizes whitespace and counts Unicode code points deterministically", async () => {
  expect(normalizePdfText(" \n你好\t world\u3000 ")).toBe("你好 world");

  const ocrPage = vi.fn<OcrPage>().mockResolvedValue("fallback");
  await expect(
    extractPdfPages(fakeDocument([fakePage([{ str: "😀".repeat(39) }])]), {
      ocrPage,
    }),
  ).resolves.toEqual([{ page: 1, text: "fallback", method: "ocr" }]);
  expect(ocrPage).toHaveBeenCalledOnce();
});

test("keeps a word boundary between adjacent native PDF text items", async () => {
  const ocrPage = vi.fn<OcrPage>();

  await expect(
    extractPdfPages(
      fakeDocument([
        fakePage([
          { str: "Hello" },
          { str: "world" },
          { str: 42 },
          {},
          { str: "x".repeat(30) },
        ]),
      ]),
      { ocrPage },
    ),
  ).resolves.toEqual([
    { page: 1, text: `Hello world ${"x".repeat(30)}`, method: "pdf-text" },
  ]);
  expect(ocrPage).not.toHaveBeenCalled();
});

test("cleans up every fetched page after native, visual, and OCR success", async () => {
  const pages = [
    fakePage([{ str: "n".repeat(40) }]),
    fakePage([{ str: "visual" }]),
    fakePage([{ str: "low" }]),
  ] as const;

  await extractPdfPages(fakeDocument(pages), {
    visualPages: [2],
    ocrPage: vi.fn<OcrPage>().mockResolvedValue("OCR result"),
  });

  for (const page of pages) expect(page.cleanup).toHaveBeenCalledOnce();
});

test("cleans up a fetched page when native text extraction throws", async () => {
  const page = fakePage([]);
  vi.spyOn(page, "getTextContent").mockRejectedValue(new Error("text failed"));

  await expect(extractPdfPages(fakeDocument([page]))).rejects.toThrow("text failed");
  expect(page.cleanup).toHaveBeenCalledOnce();
});

test("cleans up a fetched page when OCR throws", async () => {
  const page = fakePage([{ str: "low" }]);

  await expect(
    extractPdfPages(fakeDocument([page]), {
      ocrPage: vi.fn<OcrPage>().mockRejectedValue(new Error("OCR failed")),
    }),
  ).rejects.toThrow("OCR failed");
  expect(page.cleanup).toHaveBeenCalledOnce();
});

test("creates one OCR worker per run, renders at scale two, and terminates it", async () => {
  const recognize = vi.fn().mockResolvedValue({ data: { text: "识别结果" } });
  const terminate = vi.fn().mockResolvedValue(undefined);
  const createWorker = vi.fn().mockResolvedValue({ recognize, terminate });
  const renderPage = vi.fn().mockResolvedValue(Buffer.from("png"));
  const page = fakePage([]);

  const run = await createPdfOcrRun({ createWorker, renderPage });
  await expect(run.ocrPage(page, 1)).resolves.toBe("识别结果");
  await run.terminate();

  expect(createWorker).toHaveBeenCalledTimes(1);
  expect(renderPage).toHaveBeenCalledWith(page, 2);
  expect(recognize).toHaveBeenCalledWith(Buffer.from("png"));
  expect(terminate).toHaveBeenCalledOnce();
});

test("terminates the OCR worker when extraction throws", async () => {
  const terminate = vi.fn().mockResolvedValue(undefined);
  const createWorker = vi.fn().mockResolvedValue({
    recognize: vi.fn().mockRejectedValue(new Error("recognition failed")),
    terminate,
  });

  const run = await createPdfOcrRun({
    createWorker,
    renderPage: vi.fn().mockResolvedValue(Buffer.from("png")),
  });

  const page = fakePage([{ str: "low" }]);
  await expect(run.extract(fakeDocument([page]))).rejects.toThrow("recognition failed");
  expect(terminate).toHaveBeenCalledOnce();
  expect(page.cleanup).toHaveBeenCalledOnce();
});

test("reuses one worker across low-text pages and terminates once", async () => {
  const recognize = vi
    .fn()
    .mockResolvedValueOnce({ data: { text: "first" } })
    .mockResolvedValueOnce({ data: { text: "second" } });
  const terminate = vi.fn().mockResolvedValue(undefined);
  const createWorker = vi.fn().mockResolvedValue({ recognize, terminate });
  const renderPage = vi.fn().mockResolvedValue(Buffer.from("png"));
  const pages = [fakePage([{ str: "a" }]), fakePage([{ str: "b" }])];

  const run = await createPdfOcrRun({ createWorker, renderPage });
  await expect(run.extract(fakeDocument(pages))).resolves.toEqual([
    { page: 1, text: "first", method: "ocr" },
    { page: 2, text: "second", method: "ocr" },
  ]);

  expect(createWorker).toHaveBeenCalledOnce();
  expect(recognize).toHaveBeenCalledTimes(2);
  expect(terminate).toHaveBeenCalledOnce();
});

test("terminates once after a native-only extraction", async () => {
  const terminate = vi.fn().mockResolvedValue(undefined);
  const recognize = vi.fn();
  const run = await createPdfOcrRun({
    createWorker: vi.fn().mockResolvedValue({ recognize, terminate }),
    renderPage: vi.fn(),
  });

  await run.extract(fakeDocument([fakePage([{ str: "n".repeat(40) }])]));

  expect(recognize).not.toHaveBeenCalled();
  expect(terminate).toHaveBeenCalledOnce();
});

test("terminates and cleans up the page when rendering fails", async () => {
  const terminate = vi.fn().mockResolvedValue(undefined);
  const page = fakePage([{ str: "low" }]);
  const run = await createPdfOcrRun({
    createWorker: vi.fn().mockResolvedValue({ recognize: vi.fn(), terminate }),
    renderPage: vi.fn().mockRejectedValue(new Error("render failed")),
  });

  await expect(run.extract(fakeDocument([page]))).rejects.toThrow("render failed");
  expect(terminate).toHaveBeenCalledOnce();
  expect(page.cleanup).toHaveBeenCalledOnce();
});

test("rejects OCR and extraction calls after successful termination", async () => {
  const run = await createPdfOcrRun({
    createWorker: vi.fn().mockResolvedValue({
      recognize: vi.fn(),
      terminate: vi.fn().mockResolvedValue(undefined),
    }),
    renderPage: vi.fn(),
  });
  await run.terminate();

  await expect(run.ocrPage(fakePage([]), 1)).rejects.toThrow(
    "OCR run has already terminated",
  );
  await expect(run.extract(fakeDocument([]))).rejects.toThrow(
    "OCR run has already terminated",
  );
});

test("allows termination to be retried after a rejected attempt", async () => {
  const terminate = vi
    .fn()
    .mockRejectedValueOnce(new Error("terminate failed"))
    .mockResolvedValueOnce(undefined);
  const run = await createPdfOcrRun({
    createWorker: vi.fn().mockResolvedValue({ recognize: vi.fn(), terminate }),
  });

  await expect(run.terminate()).rejects.toThrow("terminate failed");
  await expect(run.terminate()).resolves.toBeUndefined();
  expect(terminate).toHaveBeenCalledTimes(2);
});

test("preserves the primary extraction error when termination also fails", async () => {
  const primaryError = new Error("recognition failed");
  const terminationError = new Error("terminate failed");
  const run = await createPdfOcrRun({
    createWorker: vi.fn().mockResolvedValue({
      recognize: vi.fn().mockRejectedValue(primaryError),
      terminate: vi.fn().mockRejectedValue(terminationError),
    }),
    renderPage: vi.fn().mockResolvedValue(Buffer.from("png")),
  });

  await expect(
    run.extract(fakeDocument([fakePage([{ str: "low" }])])),
  ).rejects.toBe(primaryError);
});

test("propagates termination failure after successful extraction", async () => {
  const terminationError = new Error("terminate failed");
  const run = await createPdfOcrRun({
    createWorker: vi.fn().mockResolvedValue({
      recognize: vi.fn(),
      terminate: vi.fn().mockRejectedValue(terminationError),
    }),
  });

  await expect(
    run.extract(fakeDocument([fakePage([{ str: "n".repeat(40) }])])),
  ).rejects.toBe(terminationError);
});

test("creates the default cache directory recursively before its worker", async () => {
  const events: string[] = [];
  const terminate = vi.fn().mockResolvedValue(undefined);
  const createWorker = vi.fn(async () => {
    events.push("worker");
    return { recognize: vi.fn(), terminate };
  });
  const makeDirectory = vi.fn(async () => {
    events.push("directory");
  });

  const worker = await createDefaultOcrWorker({
    makeDirectory,
    loadTesseract: vi.fn().mockResolvedValue({
      createWorker,
      OEM: { LSTM_ONLY: 1 },
    }),
  });

  expect(events).toEqual(["directory", "worker"]);
  expect(makeDirectory).toHaveBeenCalledWith("tmp/tesseract-cache", {
    recursive: true,
  });
  expect(createWorker).toHaveBeenCalledWith(["chi_sim", "eng"], 1, {
    cachePath: "tmp/tesseract-cache",
  });
  await worker.terminate();
});

test("renders a real in-memory PDF.js page to a PNG buffer", async () => {
  const [{ PDFDocument }, { getDocument }] = await Promise.all([
    import("@napi-rs/canvas"),
    import("pdfjs-dist/legacy/build/pdf.mjs"),
  ]);
  const source = new PDFDocument();
  const sourceContext = source.beginPage(32, 24);
  sourceContext.fillStyle = "#336699";
  sourceContext.fillRect(0, 0, 32, 24);
  source.endPage();

  const loadingTask = getDocument({ data: new Uint8Array(source.close()) });
  const document = await loadingTask.promise;
  const page = await document.getPage(1);

  try {
    const png = await renderPdfPageToPng(page);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  } finally {
    page.cleanup();
    await loadingTask.destroy();
  }
});
