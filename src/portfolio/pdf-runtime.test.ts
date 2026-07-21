import { expect, test, vi } from "vitest";

const { getDocument, GlobalWorkerOptions } = vi.hoisted(() => {
  const promise = Promise.resolve({ numPages: 18 });

  return {
    getDocument: vi.fn(() => ({ promise })),
    GlobalWorkerOptions: { workerSrc: "" },
  };
});

vi.mock("pdfjs-dist", () => ({ getDocument, GlobalWorkerOptions }));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "/assets/pdf.worker.test.mjs",
}));

test("loads a PDF through the bundled PDF.js runtime", async () => {
  const { loadPdfDocument } = await import("./pdf-runtime");

  await expect(
    loadPdfDocument("/projects/pdfs/inkseat.pdf"),
  ).resolves.toEqual({ numPages: 18 });
  expect(getDocument).toHaveBeenCalledWith({
    url: "/projects/pdfs/inkseat.pdf",
  });
  expect(GlobalWorkerOptions.workerSrc).toBe(
    "/assets/pdf.worker.test.mjs",
  );
});
