export const PORTRAIT_GEOMETRY = Object.freeze({
  width: 1_350,
  height: 1_425,
  originalWidth: 1_104,
  originalHeight: 1_425,
  originalOffsetX: 123,
  protectedMinX: 220,
  protectedMaxX: 900,
});

export const DESKTOP_PORTRAIT_SCALE_MULTIPLIER = 0.97;

export function originalFrameFor(
  sourceWidth: number,
  sourceHeight: number,
): { left: number; width: number } {
  const width =
    sourceHeight *
    (PORTRAIT_GEOMETRY.originalWidth / PORTRAIT_GEOMETRY.originalHeight);

  return { left: (sourceWidth - width) / 2, width };
}

export function originalFrameNormalizedX(
  x: number,
  sourceWidth: number,
  sourceHeight: number,
): number {
  const frame = originalFrameFor(sourceWidth, sourceHeight);

  return (x - frame.left) / frame.width;
}
