import { createCanvas } from "@napi-rs/canvas";
import { mkdir } from "node:fs/promises";

import {
  extractPdfPages,
  type ExtractPdfPagesOptions,
  type OcrPage,
} from "./pdf-extractor";
import { runWithCleanup } from "./cleanup-error";

import type { ExtractedPage } from "./types";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface OcrWorker {
  recognize(image: Buffer): Promise<{ readonly data: { readonly text: string } }>;
  setParameters?(parameters: {
    readonly tessedit_pageseg_mode: string;
  }): Promise<unknown>;
  terminate(): Promise<unknown>;
}

interface InitializableOcrWorker extends OcrWorker {
  reinitialize(languages: string[]): Promise<unknown>;
  setParameters(parameters: {
    readonly tessedit_pageseg_mode: string;
  }): Promise<unknown>;
}

interface TesseractModuleBoundary {
  readonly createWorker: (
    languages: string | string[],
    oem: number,
    options: { readonly cachePath: string },
  ) => Promise<InitializableOcrWorker>;
  readonly OEM: { readonly LSTM_ONLY: number };
  readonly PSM: { readonly AUTO: string };
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

  const worker = await tesseract.createWorker("chi_sim", tesseract.OEM.LSTM_ONLY, {
    cachePath: TESSERACT_CACHE_PATH,
  });
  try {
    await worker.reinitialize(["chi_sim", "eng"]);
    await worker.setParameters({
      tessedit_pageseg_mode: tesseract.PSM.AUTO,
    });
    return worker;
  } catch (initializationError: unknown) {
    return runWithCleanup(
      async () => {
        throw initializationError;
      },
      () => worker.terminate(),
      "OCR initialization termination also failed",
    );
  }
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
    let result = await worker.recognize(image);
    if (!result.data.text.trim() && worker.setParameters) {
      await worker.setParameters({ tessedit_pageseg_mode: "11" });
      result = await runWithCleanup(
        () => worker.recognize(image),
        () => worker.setParameters!({ tessedit_pageseg_mode: "3" }),
        "OCR page-segmentation restoration also failed",
      );
    }
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

      return runWithCleanup(
        async () => {
          if (extractionFailed) throw extractionError;
          return extractedPages ?? [];
        },
        terminate,
        "OCR extraction termination also failed",
      );
    },
    terminate,
  };
}
