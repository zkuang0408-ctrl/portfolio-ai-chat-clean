export type DockSide = "left" | "right";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface DockMetrics {
  readonly edge: number;
  readonly top: number;
  readonly bottom: number;
  readonly radius: number;
}

export interface DockPosition extends Point {
  readonly side: DockSide;
}

export function clampDockY(
  y: number,
  viewport: ViewportSize,
  metrics: DockMetrics,
): number {
  const min = metrics.top + metrics.radius;
  const max = Math.max(min, viewport.height - metrics.bottom - metrics.radius);
  if (!Number.isFinite(y)) return min;
  return Math.min(Math.max(y, min), max);
}

export function resolveDockPosition(
  point: Point,
  viewport: ViewportSize,
  metrics: DockMetrics,
  previous?: DockSide,
): DockPosition {
  const midpoint = viewport.width / 2;
  const side = point.x === midpoint && previous
    ? previous
    : point.x < midpoint
      ? "left"
      : "right";
  const x = side === "left"
    ? metrics.edge + metrics.radius
    : viewport.width - metrics.edge - metrics.radius;
  return { side, x, y: clampDockY(point.y, viewport, metrics) };
}
