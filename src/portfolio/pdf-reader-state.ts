export type PageDirection = "previous" | "next";

export function boundPage(page: number, totalPages: number): number {
  const safeTotal = Math.max(1, Math.floor(totalPages));
  const safePage = Number.isFinite(page) ? Math.floor(page) : 1;

  return Math.min(safeTotal, Math.max(1, safePage));
}

function padPage(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(2, "0");
}

export function pageCounter(currentPage: number, totalPages: number) {
  return {
    current: padPage(boundPage(currentPage, totalPages)),
    total: padPage(Math.max(1, Math.floor(totalPages))),
  };
}

export function pageBoundary(currentPage: number, totalPages: number) {
  const current = boundPage(currentPage, totalPages);
  const total = Math.max(1, Math.floor(totalPages));

  return {
    canGoPrevious: current > 1,
    canGoNext: current < total,
  };
}

export function swipeDirection(input: {
  deltaX: number;
  deltaY: number;
}): PageDirection | null {
  if (
    Math.abs(input.deltaX) < 44 ||
    Math.abs(input.deltaX) <= Math.abs(input.deltaY) * 1.25
  ) {
    return null;
  }

  return input.deltaX < 0 ? "next" : "previous";
}
