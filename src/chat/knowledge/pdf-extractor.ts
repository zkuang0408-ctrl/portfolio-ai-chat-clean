import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

import type { ExtractedPage } from "./types";

export const NATIVE_TEXT_MINIMUM_CHARACTERS = 40;

export type OcrPage = (
  page: PDFPageProxy,
  pageNumber: number,
) => Promise<string>;

export interface ExtractPdfPagesOptions {
  readonly expectedPageCount?: number;
  readonly visualPages?: readonly number[];
  readonly ocrPage?: OcrPage;
}

export function normalizePdfText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function normalizedCharacterCount(text: string): number {
  return Array.from(text).length;
}

async function getNativePageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  const text = content.items
    .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
    .join("");

  return normalizePdfText(text);
}

export async function extractPdfPages(
  document: PDFDocumentProxy,
  options: ExtractPdfPagesOptions = {},
): Promise<readonly ExtractedPage[]> {
  const { expectedPageCount, ocrPage, visualPages = [] } = options;

  if (
    expectedPageCount !== undefined &&
    document.numPages !== expectedPageCount
  ) {
    throw new Error(
      `PDF page count mismatch: expected ${expectedPageCount}, received ${document.numPages}`,
    );
  }

  const visualPageNumbers = new Set(visualPages);
  const extractedPages: ExtractedPage[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const text = await getNativePageText(page);

    if (
      normalizedCharacterCount(text) >= NATIVE_TEXT_MINIMUM_CHARACTERS ||
      visualPageNumbers.has(pageNumber)
    ) {
      extractedPages.push({ page: pageNumber, text, method: "pdf-text" });
      continue;
    }

    if (!ocrPage) {
      throw new Error(
        `OCR page function is required for PDF page ${pageNumber} with fewer than ${NATIVE_TEXT_MINIMUM_CHARACTERS} characters`,
      );
    }

    extractedPages.push({
      page: pageNumber,
      text: normalizePdfText(await ocrPage(page, pageNumber)),
      method: "ocr",
    });
  }

  return extractedPages;
}
