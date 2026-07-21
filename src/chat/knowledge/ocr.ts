import { createCanvas } from "@napi-rs/canvas";

import {
  extractPdfPages,
  type ExtractPdfPagesOptions,
  type OcrPage,
} from "./pdf-extractor";

import type { ExtractedPage } from "./types";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

interface OcrWorker {
  recognize(image: Buffer): Promise<{ readonly data: { readonly text: string } }>;
  terminate(): Promise<unknown>;
}

export type CreateOcrWorker = () => Promise<OcrWorker>;
export type RenderPageToPng = (
  page: PDFPageProxy,
  scale: number,
) => Promise<Buffer>;

export interface PdfOcrRunDependencies {
  readonly createWorker?: CreateOcrWorker;
  readonly renderPage?: RenderPageToPng;
}

export interface PdfOcrRun {
  readonly ocrPage: OcrPage;
  extract(
    document: PDFDocumentProxy,
    options?: Omit<ExtractPdfPagesOptions, "ocrPage">,
  ): Promise<readonly ExtractedPage[]>;
  terminate(): Promise<void>;
}

const OCR_SCALE = 2;

async function createTesseractWorker(): Promise<OcrWorker> {
  const tesseract = await import("tesseract.js");

  return tesseract.createWorker(["chi_sim", "eng"], tesseract.OEM.LSTM_ONLY, {
    cachePath: "tmp/tesseract-cache",
  });
}

export async function renderPdfPageToPng(
  page: PDFPageProxy,
  scale = OCR_SCALE,
): Promise<Buffer> {
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height),
  );
  const context = canvas.getContext("2d");

  await page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;

  return canvas.toBuffer("image/png");
}

export async function createPdfOcrRun(
  dependencies: PdfOcrRunDependencies = {},
): Promise<PdfOcrRun> {
  const worker = await (dependencies.createWorker ?? createTesseractWorker)();
  const renderPage = dependencies.renderPage ?? renderPdfPageToPng;
  let terminated = false;

  const terminate = async (): Promise<void> => {
    if (!terminated) {
      terminated = true;
      await worker.terminate();
    }
  };
  const ocrPage: OcrPage = async (page, _pageNumber) => {
    const image = await renderPage(page, OCR_SCALE);
    const result = await worker.recognize(image);
    return result.data.text;
  };

  return {
    ocrPage,
    async extract(document, options = {}) {
      try {
        return await extractPdfPages(document, { ...options, ocrPage });
      } finally {
        await terminate();
      }
    },
    terminate,
  };
}
