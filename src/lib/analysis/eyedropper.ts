// Pure geometry + colour maths for the Eyedropper (Slice 7). The canvas /
// getImageData / store wiring lives in Viewer.svelte (untested glue); everything
// here is pure and unit-tested. See ADR-0001 (canvas-hover split) and ADR-0003
// (what "L" means).

import { toSourcePixel, type Point, type Size, type Transform } from "../viewer/transform";

/** WebKit caps canvas area; above it a canvas silently allocates blank. 4096² is
 *  the conservative historical limit. Reference images are ~1080p (well under),
 *  so the cap only bites on rare large originals — see IMPLEMENTATION.md. */
export const MAX_CANVAS_AREA = 4096 * 4096;

/** Rec. 709 luma on the sRGB-encoded bytes (ADR-0003): the weighted channel sum
 *  in the same 0–255 encoding as R/G/B — *not* linearized luminance. Slice 8's
 *  histogram L channel must use this exact formula so its hover-line matches. */
export function luminance(r: number, g: number, b: number): number {
  return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
}

/** Size of the sampling canvas for a source image: the natural size, or scaled
 *  down (aspect-preserving) to fit within `maxArea` when the source is too big
 *  for a canvas. Floors to whole pixels, never below 1. */
export function samplingCanvasSize(natural: Size, maxArea = MAX_CANVAS_AREA): Size {
  const area = natural.width * natural.height;
  if (area <= 0) return { width: 1, height: 1 };
  if (area <= maxArea) return natural;
  const factor = Math.sqrt(maxArea / area);
  return {
    width: Math.max(1, Math.floor(natural.width * factor)),
    height: Math.max(1, Math.floor(natural.height * factor)),
  };
}

/** Map a viewport point to the integer pixel to sample on the (possibly capped)
 *  sampling canvas, or `null` when the point falls outside the image. Inverts the
 *  viewer transform to source space, rejects out-of-image points (so hovering the
 *  Backdrop reads nothing), then scales source→canvas and floors. */
export function toCanvasSample(
  transform: Transform,
  point: Point,
  natural: Size,
  canvas: Size
): Point | null {
  const src = toSourcePixel(transform, point);
  if (src.x < 0 || src.y < 0 || src.x >= natural.width || src.y >= natural.height) {
    return null;
  }
  const x = Math.floor(src.x * (canvas.width / natural.width));
  const y = Math.floor(src.y * (canvas.height / natural.height));
  return {
    x: Math.min(x, canvas.width - 1),
    y: Math.min(y, canvas.height - 1),
  };
}
