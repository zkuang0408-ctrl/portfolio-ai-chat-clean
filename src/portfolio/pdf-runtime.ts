import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export type ProjectPdfDocument = PDFDocumentProxy;

export async function loadPdfDocument(
  url: string,
): Promise<PDFDocumentProxy> {
  return getDocument({ url }).promise;
}
