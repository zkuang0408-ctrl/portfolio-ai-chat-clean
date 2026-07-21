import { createCanvas } from "@napi-rs/canvas";
import { mkdir } from "node:fs/promises";

import {
  extractPdfPages,
  type ExtractPdfPagesOptions,
  type OcrPage,
} from "./pdf-extractor";

import type { ExtractedPage } from "./types";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface OcrWorker {
  recognize(image: Buffer): Promise<{ readonly data: { readonly text: string } }>;
  terminate(): Promise<unknown>;
}

interface TesseractModuleBoundary {
  readonly createWorker: (
    languages: string[],
    oem: number,
    options: { readonly cachePath: string },
  ) => Promise<OcrWorker>;
  readonly OEM: { readonly LSTM_ONLY: number };
}

type MakeDirectory = (
  path: string,
  options: { readonly recursive: true },
) => Promise<unknown>;

export interface DefaultOcrWorkerDependencies {
  readonly makeDirectory?: MakeDirectory;
  readonly loadTesseract?: () => Promise<TesseractModuleBoundary>;
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
const TESSERACT_CACHE_PATH = "tmp/tesseract-cache";

export async function createDefaultOcrWorker(
  dependencies: DefaultOcrWorkerDependencies = {},
): Promise<OcrWorker> {
  const makeDirectory =
    dependencies.makeDirectory ??
    ((path: string, options: { readonly recursive: true }) =>
      mkdir(path, options));
  const loadTesseract =
    dependencies.loadTesseract ??
    (async () =>
      (await import("tesseract.js")) as unknown as TesseractModuleBoundary);

  await makeDirectory(TESSERACT_CACHE_PATH, { recursive: true });
  const tesseract = await loadTesseract();

  return tesseract.createWorker(["chi_sim", "eng"], tesseract.OEM.LSTM_ONLY, {
    cachePath: TESSERACT_CACHE_PATH,
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
  const worker = await (dependencies.createWorker ?? createDefaultOcrWorker)();
  const renderPage = dependencies.renderPage ?? renderPdfPageToPng;
  let terminated = false;
  let terminationPromise: Promise<void> | undefined;
  let extractionState: "not-started" | "running" | "finished" = "not-started";

  const assertWorkerActive = (): void => {
    if (terminated) throw new Error("OCR run has already terminated");
    if (terminationPromise) throw new Error("OCR run is terminating");
  };

  const terminate = (): Promise<void> => {
    if (terminated) return Promise.resolve();
    if (terminationPromise) return terminationPromise;

    terminationPromise = Promise.resolve()
      .then(() => worker.terminate())
      .then(() => {
        terminated = true;
      })
      .catch((error: unknown) => {
        terminationPromise = undefined;
        throw error;
      });
    return terminationPromise;
  };
  const ocrPage: OcrPage = async (page, _pageNumber) => {
    assertWorkerActive();
    if (extractionState === "finished") {
      throw new Error("OCR extraction run has already finished");
    }
    const image = await renderPage(page, OCR_SCALE);
    const result = await worker.recognize(image);
    return result.data.text;
  };

  return {
    ocrPage,
    async extract(document, options = {}) {
      assertWorkerActive();
      if (extractionState !== "not-started") {
        throw new Error("OCR extraction run has already started");
      }
      extractionState = "running";

      let extractionFailed = false;
      let extractionError: unknown;
      let extractedPages: readonly ExtractedPage[] | undefined;
      try {
        extractedPages = await extractPdfPages(document, { ...options, ocrPage });
      } catch (error: unknown) {
        extractionFailed = true;
        extractionError = error;
      }
      extractionState = "finished";

      try {
        await terminate();
      } catch (terminationError: unknown) {
        if (!extractionFailed) throw terminationError;
      }

      if (extractionFailed) throw extractionError;
      return extractedPages ?? [];
    },
    terminate,
  };
}
