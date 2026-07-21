// @vitest-environment node

import { expect, test, vi } from "vitest";

import {
  extractPdfPages,
  normalizePdfText,
  type OcrPage,
} from "./pdf-extractor";
import { createPdfOcrRun } from "./ocr";

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

interface FakeTextItem {
  readonly str?: unknown;
}

function fakePage(items: readonly FakeTextItem[]): PDFPageProxy {
  return {
    getTextContent: async () => ({ items }),
  } as unknown as PDFPageProxy;
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

  await expect(run.extract(fakeDocument([fakePage([{ str: "low" }])]))).rejects.toThrow(
    "recognition failed",
  );
  expect(terminate).toHaveBeenCalledOnce();
});
